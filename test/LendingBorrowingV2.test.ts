/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { Signer } from "ethers";

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const DEC = 8n;
const UNIT = 10n ** DEC; // 1 whole token, 8 decimals (both cirBTC and USDC)
const WAD = 10n ** 18n;
const BPS = 10_000n;

// Risk params
const COLLATERAL_FACTOR = 5000n; // 50%
const MAX_COLLATERAL_FACTOR = 6500n; // 65%
const LIQ_THRESHOLD = 8000n; // 80%
const LIQ_BONUS = 800n; // 8%
const CLOSE_FACTOR = 5000n; // 50%

// Oracle: cirBTC = $100,000, price scaled by 1e8 (Chainlink-style)
const PRICE_DECIMALS = 8;
const INITIAL_PRICE = 100_000n * UNIT; // 100000 * 1e8

// Helpers to express whole-token amounts in base units.
const cir = (n: string | number) => ethers.parseUnits(String(n), Number(DEC));
const usdc = (n: string | number) => ethers.parseUnits(String(n), Number(DEC));

async function deployFixture() {
  const [owner, alice, bob, liquidator] = await ethers.getSigners();

  const ERC20 = await ethers.getContractFactory("TestnetERC20");
  const cirBtc = await ERC20.deploy("Circle BTC", "cirBTC", Number(DEC));
  const usdcToken = await ERC20.deploy("USD Coin", "USDC", Number(DEC));

  const Oracle = await ethers.getContractFactory("MockPriceOracle");
  const oracle = await Oracle.deploy(INITIAL_PRICE, PRICE_DECIMALS);

  const Lending = await ethers.getContractFactory("LendingBorrowingV2");
  const lending = await Lending.deploy(
    await cirBtc.getAddress(),
    await usdcToken.getAddress(),
    await oracle.getAddress(),
    COLLATERAL_FACTOR,
    MAX_COLLATERAL_FACTOR,
    LIQ_THRESHOLD,
    LIQ_BONUS,
    CLOSE_FACTOR,
  );

  // Seed 500,000 USDC of liquidity via the supply side (share-backed), so the
  // pool is borrowable and the owner is the initial supplier.
  await usdcToken.allocateTo(owner.address, usdc(500_000));
  await usdcToken.approve(await lending.getAddress(), usdc(500_000));
  await lending.supply(usdc(500_000));

  // Seed users with cirBTC + USDC and approvals.
  for (const u of [alice, bob, liquidator]) {
    await cirBtc.allocateTo(u.address, cir(10));
    await usdcToken.allocateTo(u.address, usdc(200_000));
    await cirBtc.connect(u).approve(await lending.getAddress(), ethers.MaxUint256);
    await usdcToken.connect(u).approve(await lending.getAddress(), ethers.MaxUint256);
  }

  return { owner, alice, bob, liquidator, cirBtc, usdcToken, oracle, lending };
}

// Convenience: open a position with `collateral` cirBTC and borrow `borrow` USDC.
async function openAndBorrow(
  lending: any,
  user: Signer,
  collateral: bigint,
  borrow: bigint,
) {
  await lending.connect(user).openPositionWithCollateral(collateral);
  const addr = await user.getAddress();
  const id = (await lending.positionCount(addr)) - 1n;
  if (borrow > 0n) await lending.connect(user).takeLoan(id, borrow);
  return id;
}

describe("LendingBorrowingV2", () => {
  describe("collateral valuation & health factor", () => {
    it("values 1 cirBTC at the oracle price in USDC terms", async () => {
      const { lending, alice } = await deployFixture();
      const id = await openAndBorrow(lending, alice, cir(1), 0n);
      // 1 cirBTC @ $100k = 100,000 USDC of value.
      expect(await lending.collateralValue(alice.address, id)).to.equal(usdc(100_000));
    });

    it("computes HF = collateralValue * threshold / debt", async () => {
      const { lending, alice } = await deployFixture();
      // 1 cirBTC ($100k) collateral, borrow $40k.
      const id = await openAndBorrow(lending, alice, cir(1), usdc(40_000));
      // HF = 100000 * 0.8 / 40000 = 2.0
      const hf = await lending.healthFactor(alice.address, id);
      expect(hf).to.equal(2n * WAD);
    });

    it("reports max uint HF for a debt-free position", async () => {
      const { lending, alice } = await deployFixture();
      const id = await openAndBorrow(lending, alice, cir(1), 0n);
      expect(await lending.healthFactor(alice.address, id)).to.equal(ethers.MaxUint256);
    });

    it("HF crosses 1.0 exactly at the boundary price", async () => {
      const { lending, oracle, alice } = await deployFixture();
      // Zero the interest curve so debt stays nominal and the HF boundary is exact.
      await lending.setInterestRateParams(0n, 0n, 0n, WAD / 2n, 0n);
      const id = await openAndBorrow(lending, alice, cir(1), usdc(40_000));
      // HF=1 when collateralValue*0.8 = debt => value = 50000 => price = $50,000.
      await oracle.setPrice(50_000n * UNIT);
      expect(await lending.healthFactor(alice.address, id)).to.equal(WAD);
      expect(await lending.isLiquidatable(alice.address, id)).to.equal(false);
      // A hair below: liquidatable.
      await oracle.setPrice(49_999n * UNIT);
      expect(await lending.healthFactor(alice.address, id)).to.be.lt(WAD);
      expect(await lending.isLiquidatable(alice.address, id)).to.equal(true);
    });
  });

  describe("borrow limits", () => {
    it("allows borrowing up to exactly the collateral factor", async () => {
      const { lending, alice } = await deployFixture();
      await lending.connect(alice).openPositionWithCollateral(cir(1));
      const id = (await lending.positionCount(alice.address)) - 1n;
      // 50% of $100k = $50k.
      await expect(lending.connect(alice).takeLoan(id, usdc(50_000))).to.not.be.reverted;
    });

    it("reverts a borrow that exceeds the limit", async () => {
      const { lending, alice } = await deployFixture();
      await lending.connect(alice).openPositionWithCollateral(cir(1));
      const id = (await lending.positionCount(alice.address)) - 1n;
      await expect(
        lending.connect(alice).takeLoan(id, usdc(50_000) + 1n),
      ).to.be.revertedWithCustomError(lending, "ExceedsBorrowLimit");
    });

    it("blocks a withdrawal that would breach the borrow limit", async () => {
      const { lending, alice } = await deployFixture();
      const id = await openAndBorrow(lending, alice, cir(1), usdc(50_000));
      // Fully drawn: cannot withdraw any collateral.
      await expect(
        lending.connect(alice).withdrawCollateral(id, cir("0.0001")),
      ).to.be.revertedWithCustomError(lending, "WouldBeUndercollateralized");
    });
  });

  describe("liquidation", () => {
    it("rejects liquidating a healthy position", async () => {
      const { lending, alice, liquidator } = await deployFixture();
      const id = await openAndBorrow(lending, alice, cir(1), usdc(40_000));
      await expect(
        lending.connect(liquidator).liquidate(alice.address, id, usdc(1_000)),
      ).to.be.revertedWithCustomError(lending, "PositionHealthy");
    });

    it("liquidates an unhealthy position, paying the bonus, capped by close factor", async () => {
      const { lending, oracle, cirBtc, alice, liquidator } = await deployFixture();
      // Zero interest so close-factor and bonus arithmetic are exact.
      await lending.setInterestRateParams(0n, 0n, 0n, WAD / 2n, 0n);
      const id = await openAndBorrow(lending, alice, cir(1), usdc(40_000));

      // Crash price to $45k -> HF = 45000*0.8/40000 = 0.9.
      await oracle.setPrice(45_000n * UNIT);
      expect(await lending.isLiquidatable(alice.address, id)).to.equal(true);

      const debtBefore = await lending.currentDebt(alice.address, id);
      const collBefore = (await lending.getPosition(alice.address, id)).collateral;
      const liqCirBefore = await cirBtc.balanceOf(liquidator.address);

      // Offer to repay the whole debt; close factor caps it at 50%.
      await lending.connect(liquidator).liquidate(alice.address, id, debtBefore);

      const debtAfter = await lending.currentDebt(alice.address, id);
      const repaid = debtBefore - debtAfter;
      // Close factor = 50% (interest disabled, so exact).
      expect(repaid).to.equal(debtBefore / 2n);

      // Seized collateral = repaid * 1.08 / price, in cirBTC units.
      const seized = collBefore - (await lending.getPosition(alice.address, id)).collateral;
      const liqCirAfter = await cirBtc.balanceOf(liquidator.address);
      expect(liqCirAfter - liqCirBefore).to.equal(seized);

      // Value of seized collateral ≈ repaid * 1.08 (both in USDC base units).
      const seizedValue = seized * 45_000n; // 8-dec cirBTC * $/whole = USDC base units
      const expectedValue = (repaid * (BPS + LIQ_BONUS)) / BPS;
      expect(seizedValue).to.be.closeTo(expectedValue, expectedValue / 1000n);
    });

    it("records a liquidation against the borrower's credit", async () => {
      const { lending, oracle, alice, liquidator } = await deployFixture();
      const id = await openAndBorrow(lending, alice, cir(1), usdc(40_000));
      const scoreBefore = await lending.creditScore(alice.address);
      await oracle.setPrice(45_000n * UNIT);
      await lending.connect(liquidator).liquidate(alice.address, id, usdc(1_000));
      const scoreAfter = await lending.creditScore(alice.address);
      expect(scoreAfter).to.be.lt(scoreBefore);
      expect((await lending.credit(alice.address)).liquidations).to.equal(1n);
    });
  });

  describe("interest accrual", () => {
    it("accrues interest on outstanding debt over time", async () => {
      const { lending, alice } = await deployFixture();
      // Borrow $40k; make utilization exactly the 80% kink by using a fresh
      // pool of 50k. We reuse the 500k pool: util = 40000/540000 ~ 7.4%.
      const id = await openAndBorrow(lending, alice, cir(1), usdc(40_000));
      const debt0 = await lending.currentDebt(alice.address, id);

      await time.increase(365 * 24 * 60 * 60); // 1 year
      const debt1 = await lending.currentDebt(alice.address, id);
      expect(debt1).to.be.gt(debt0);

      // Rate must be at least the base rate (2%).
      const minGrowth = (debt0 * 102n) / 100n;
      expect(debt1).to.be.gte(minGrowth - 10n);
    });

    it("charges a higher rate above the utilization kink", async () => {
      const { lending, owner, usdcToken, alice, bob } = await deployFixture();

      // Low-utilization APR snapshot.
      await openAndBorrow(lending, alice, cir(1), usdc(10_000));
      const lowAPR = await lending.borrowAPR();

      // Push utilization above the kink by draining most of the pool.
      await lending.connect(bob).openPositionWithCollateral(cir(10));
      await lending.connect(bob).takeLoan(
        (await lending.positionCount(bob.address)) - 1n,
        usdc(480_000),
      );
      const highAPR = await lending.borrowAPR();
      expect(highAPR).to.be.gt(lowAPR);
      expect(await lending.utilization()).to.be.gt(await lending.kink());
    });

    it("supplyAPY is below borrowAPR (reserve factor + utilization)", async () => {
      const { lending, alice } = await deployFixture();
      await openAndBorrow(lending, alice, cir(1), usdc(40_000));
      expect(await lending.supplyAPY()).to.be.lt(await lending.borrowAPR());
    });
  });

  describe("credit score", () => {
    it("starts at the 500 baseline", async () => {
      const { lending, alice } = await deployFixture();
      expect(await lending.creditScore(alice.address)).to.equal(500n);
    });

    it("rises after a full repayment and raises the personal collateral factor", async () => {
      const { lending, alice } = await deployFixture();
      const id = await openAndBorrow(lending, alice, cir(1), usdc(40_000));
      // Repay in full (pass a generous amount; capped at debt).
      await lending.connect(alice).repayLoan(id, usdc(41_000));
      const score = await lending.creditScore(alice.address);
      // +40 (one full repay) +200 (volume >= 1000 USDC) = 740.
      expect(score).to.equal(740n);

      const eff = await lending.effectiveCollateralFactorBps(alice.address);
      // 5000 + (6500-5000)*(740-500)/500 = 5720.
      expect(eff).to.equal(5720n);
      expect(eff).to.be.gt(COLLATERAL_FACTOR);
      expect(eff).to.be.lt(LIQ_THRESHOLD);
    });

    it("never lets the effective factor reach the liquidation threshold", async () => {
      const { lending, alice } = await deployFixture();
      // Repay many loans to max the score.
      for (let i = 0; i < 10; i++) {
        const id = await openAndBorrow(lending, alice, cir(1), usdc(40_000));
        await lending.connect(alice).repayLoan(id, usdc(41_000));
      }
      expect(await lending.creditScore(alice.address)).to.equal(1000n);
      const eff = await lending.effectiveCollateralFactorBps(alice.address);
      expect(eff).to.equal(MAX_COLLATERAL_FACTOR);
      expect(eff).to.be.lt(LIQ_THRESHOLD);
    });
  });

  describe("multi-position isolation", () => {
    it("keeps positions independent", async () => {
      const { lending, oracle, alice, liquidator } = await deployFixture();
      const id0 = await openAndBorrow(lending, alice, cir(1), usdc(40_000)); // risky
      const id1 = await openAndBorrow(lending, alice, cir(2), usdc(20_000)); // safe

      await oracle.setPrice(45_000n * UNIT);
      expect(await lending.isLiquidatable(alice.address, id0)).to.equal(true);
      expect(await lending.isLiquidatable(alice.address, id1)).to.equal(false);

      const p1Before = await lending.getPosition(alice.address, id1);
      await lending.connect(liquidator).liquidate(alice.address, id0, usdc(1_000));
      // Liquidating position 0 leaves position 1's principal & collateral untouched
      // (currentDebt keeps accruing interest globally, but scaledDebt is invariant).
      const p1After = await lending.getPosition(alice.address, id1);
      expect(p1After.scaledDebt).to.equal(p1Before.scaledDebt);
      expect(p1After.collateral).to.equal(cir(2));
      expect(await lending.isLiquidatable(alice.address, id1)).to.equal(false);
    });

    it("counts positions and reflects them in the account summary", async () => {
      const { lending, alice } = await deployFixture();
      await openAndBorrow(lending, alice, cir(1), usdc(10_000));
      await openAndBorrow(lending, alice, cir(2), usdc(20_000));
      expect(await lending.positionCount(alice.address)).to.equal(2n);
      const s = await lending.accountSummary(alice.address);
      expect(s.totalCollateral).to.equal(cir(3));
      expect(s.totalDebtOut).to.be.gte(usdc(30_000));
    });
  });

  describe("supply side & reserves", () => {
    it("mints shares ~1:1 for the first suppliers and tracks balances", async () => {
      const { lending, bob } = await deployFixture();
      // Owner already supplied 500k in the fixture at rate 1.0.
      await lending.connect(bob).supply(usdc(100_000));
      expect(await lending.supplyBalanceOf(bob.address)).to.be.closeTo(usdc(100_000), 10n);
      expect(await lending.totalSupplied()).to.be.closeTo(usdc(600_000), 10n);
    });

    it("grows supplier balances and accrues reserves as interest is paid", async () => {
      const { lending, bob, alice } = await deployFixture();
      await lending.connect(bob).supply(usdc(100_000));
      const before = await lending.supplyBalanceOf(bob.address);

      // Create borrow demand, then let a year pass.
      await openAndBorrow(lending, alice, cir(5), usdc(200_000));
      await time.increase(365 * 24 * 60 * 60);

      const after = await lending.supplyBalanceOf(bob.address);
      expect(after).to.be.gt(before); // earned yield (projected via the live index)

      // Reserves are persisted on a state change (not projected), so touch state.
      await lending.connect(alice).repayLoan(0, usdc(1));
      expect(await lending.totalReserves()).to.be.gt(0n); // protocol took its cut
    });

    it("lets a supplier withdraw principal + interest and burns shares", async () => {
      const { lending, bob, usdcToken } = await deployFixture();
      await lending.connect(bob).supply(usdc(100_000));
      const balBefore = await usdcToken.balanceOf(bob.address);
      await lending.connect(bob).withdrawSupply(ethers.MaxUint256); // cap → full exit
      expect(await lending.supplyShares(bob.address)).to.equal(0n);
      expect(await usdcToken.balanceOf(bob.address)).to.be.gte(balBefore + usdc(100_000) - 10n);
    });

    it("blocks withdrawing more liquidity than is available (borrowed out)", async () => {
      const { lending, alice, owner } = await deployFixture();
      // Borrow most of the pool so cash is low.
      await openAndBorrow(lending, alice, cir(10), usdc(480_000));
      await expect(
        lending.connect(owner).withdrawSupply(usdc(100_000)),
      ).to.be.revertedWithCustomError(lending, "InsufficientLiquidity");
    });

    it("lets the owner withdraw reserves, but not more than accrued", async () => {
      const { lending, owner, alice } = await deployFixture();
      await openAndBorrow(lending, alice, cir(5), usdc(200_000));
      await time.increase(365 * 24 * 60 * 60);
      // A harmless state-changing touch persists the accrued reserves.
      await lending.connect(alice).repayLoan(0, usdc(1));
      const reserves = await lending.totalReserves();
      expect(reserves).to.be.gt(0n);
      await expect(
        lending.connect(alice).withdrawReserves(reserves),
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(lending.connect(owner).withdrawReserves(reserves + usdc(1_000_000)))
        .to.be.revertedWithCustomError(lending, "InvalidParam");
      await expect(lending.connect(owner).withdrawReserves(reserves)).to.not.be.reverted;
    });
  });

  describe("access control", () => {
    it("restricts owner-only functions", async () => {
      const { lending, alice } = await deployFixture();
      await expect(
        lending.connect(alice).setRiskParams(5000n, 6500n, 8000n, 800n, 5000n),
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(
        lending.connect(alice).setInterestRateParams(0n, 0n, 0n, WAD / 2n, 0n),
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(
        lending.connect(alice).setOracle(alice.address),
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(
        lending.connect(alice).fundPool(usdc(1)),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("rejects invalid risk params", async () => {
      const { lending } = await deployFixture();
      // max factor >= liquidation threshold is invalid.
      await expect(
        lending.setRiskParams(5000n, 8000n, 8000n, 800n, 5000n),
      ).to.be.revertedWithCustomError(lending, "InvalidParam");
    });

    it("lets anyone move the demo price (permissionless testnet oracle)", async () => {
      const { oracle, alice } = await deployFixture();
      await oracle.connect(alice).setPrice(50_000n * UNIT);
      expect(await oracle.getPrice()).to.equal(50_000n * UNIT);
    });
  });

  describe("oracle swap seam", () => {
    it("lets the owner swap the oracle implementation", async () => {
      const { lending, alice } = await deployFixture();
      const Oracle = await ethers.getContractFactory("MockPriceOracle");
      const oracle2 = await Oracle.deploy(50_000n * UNIT, PRICE_DECIMALS);
      await lending.setOracle(await oracle2.getAddress());
      const id = await openAndBorrow(lending, alice, cir(1), 0n);
      // New oracle prices 1 cirBTC at $50k.
      expect(await lending.collateralValue(alice.address, id)).to.equal(usdc(50_000));
    });
  });
});
