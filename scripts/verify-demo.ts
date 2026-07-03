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

/**
 * Walks the exact DEMO.md click-path as on-chain transactions and asserts the
 * outcomes each UI step promises — health-factor values and gauge colors, the
 * liquidation bonus + close factor, the credit-driven change in terms, and the
 * interest-rate jump past the kink. Runs against Hardhat's in-process chain
 * (no node, no wallet, no frontend required):
 *
 *     npx hardhat run scripts/verify-demo.ts
 *
 * It verifies the on-chain behavior behind every click. The browser UI and
 * wallet flow are verified separately by deploying to Arc Testnet (SETUP.md)
 * and following DEMO.md.
 */

import { ethers } from "hardhat";

const DEC = 8;
const UNIT = 10n ** 8n;
const WAD = 10n ** 18n;
const usd = (n: string | number) => ethers.parseUnits(String(n), DEC);
const cir = (n: string | number) => ethers.parseUnits(String(n), DEC);

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${label} — ${detail}`);
  if (!ok) failures++;
}
function hf(x: bigint): number {
  if (x >= ethers.MaxUint256 / 2n) return Infinity;
  return Number(ethers.formatUnits(x, 18));
}
function gaugeState(h: number): string {
  if (!Number.isFinite(h)) return "Healthy";
  if (h < 1) return "Liquidatable";
  if (h < 1.5) return "At risk";
  return "Healthy";
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

async function main() {
  const [deployer, borrower, goodBorrower, whale, liquidator] = await ethers.getSigners();

  console.log("Step 0 — deploy the stack (as `npm run deploy:lending`)");
  const ERC20 = await ethers.getContractFactory("TestnetERC20");
  const cirBtc = await ERC20.deploy("Circle BTC (Demo)", "cirBTC", DEC);
  const usdc = await ERC20.deploy("USD Coin", "USDC", DEC);
  const Oracle = await ethers.getContractFactory("MockPriceOracle");
  const oracle = await Oracle.deploy(usd(100_000), DEC); // $100,000
  const Lending = await ethers.getContractFactory("LendingBorrowingV2");
  const lending = await Lending.deploy(
    await cirBtc.getAddress(), await usdc.getAddress(), await oracle.getAddress(),
    5000, 6500, 8000, 800, 5000,
  );
  const L = await lending.getAddress();
  await (await usdc.allocateTo(deployer.address, usd(500_000))).wait();
  await (await usdc.approve(L, usd(500_000))).wait();
  await (await lending.fundPool(usd(500_000))).wait();
  check("pool funded", (await lending.poolLiquidity()) === usd(500_000), "500,000 USDC available to borrow");

  // Fund actors + approvals
  for (const u of [borrower, goodBorrower, whale, liquidator]) {
    await (await cirBtc.allocateTo(u.address, cir(100))).wait();
    await (await usdc.allocateTo(u.address, usd(500_000))).wait();
    await (await cirBtc.connect(u).approve(L, ethers.MaxUint256)).wait();
    await (await usdc.connect(u).approve(L, ethers.MaxUint256)).wait();
  }

  console.log("\nStep 1 — borrower opens 0.1 cirBTC and borrows 4,950 USDC");
  await (await lending.connect(borrower).openPositionWithCollateral(cir("0.1"))).wait();
  await (await lending.connect(borrower).takeLoan(0, usd(4_950))).wait();
  let h = hf(await lending.healthFactor(borrower.address, 0));
  check("gauge reads healthy", gaugeState(h) === "Healthy", `HF ${h.toFixed(3)} (0.1 cirBTC @ $100k backing $4,950)`);
  check("HF matches DEMO math", near(h, 1.616, 0.02), "expected ≈ 1.62 = 10000·0.8/4950");

  console.log("\nStep 2 — price drops; gauge sweeps green → amber → red");
  await (await oracle.setPrice(usd(75_000))).wait();
  h = hf(await lending.healthFactor(borrower.address, 0));
  check("amber at $75k", gaugeState(h) === "At risk", `HF ${h.toFixed(3)}`);
  await (await oracle.setPrice(usd(60_000))).wait();
  h = hf(await lending.healthFactor(borrower.address, 0));
  check("red / liquidatable at $60k", gaugeState(h) === "Liquidatable" && (await lending.isLiquidatable(borrower.address, 0)), `HF ${h.toFixed(3)} < 1.0`);

  console.log("\nStep 3 — liquidator repays 2,000 USDC, receives collateral + 8% bonus");
  const debtBefore = await lending.currentDebt(borrower.address, 0);
  const cirBefore = await cirBtc.balanceOf(liquidator.address);
  await (await lending.connect(liquidator).liquidate(borrower.address, 0, usd(2_000))).wait();
  const seized = (await cirBtc.balanceOf(liquidator.address)) - cirBefore;
  const seizedValue = Number(ethers.formatUnits(seized, DEC)) * 60_000; // USD at $60k
  const repaid = Number(ethers.formatUnits(debtBefore - (await lending.currentDebt(borrower.address, 0)), DEC));
  check("close factor cap (≤50% of debt)", repaid <= Number(ethers.formatUnits(debtBefore, DEC)) / 2 + 1, `repaid ${repaid.toFixed(2)} USDC`);
  check("liquidation bonus ≈ 8%", near(seizedValue / repaid, 1.08, 0.005), `received $${seizedValue.toFixed(2)} of cirBTC for $${repaid.toFixed(2)} repaid`);
  h = hf(await lending.healthFactor(borrower.address, 0));
  check("partial liquidation restores health", h >= 1, `HF recovered to ${h.toFixed(3)}`);
  const liq = await lending.credit(borrower.address);
  check("borrower credit records the liquidation", liq.liquidations === 1n && (await lending.creditScore(borrower.address)) === 300n, "score 500 → 300 (−200)");

  console.log("\nStep 4 — credit changes terms");
  await (await oracle.setPrice(usd(100_000))).wait(); // price back to normal after the liquidation drama
  // Reliability: a clean borrower repays in full and earns a better factor.
  await (await lending.connect(goodBorrower).openPositionWithCollateral(cir(1))).wait();
  await (await lending.connect(goodBorrower).takeLoan(0, usd(40_000))).wait();
  await (await lending.connect(goodBorrower).repayLoan(0, usd(41_000))).wait(); // capped at debt
  const score = await lending.creditScore(goodBorrower.address);
  const eff = await lending.effectiveCollateralFactorBps(goodBorrower.address);
  check("full repayment raises score", score === 740n, `score ${score} (500 + 40 repaid + 200 volume)`);
  check("higher personal collateral factor", eff === 5720n, `collateral factor 50% → ${(Number(eff) / 100).toFixed(1)}% (still < 80% liq. threshold)`);
  check("liquidation lowered the other borrower's terms", (await lending.creditScore(borrower.address)) < 500n, "liquidated borrower sits below the 500 baseline");

  console.log("\nStep 5 — utilization past the kink spikes the borrow APR");
  const aprLow = Number(ethers.formatUnits(await lending.borrowAPR(), 18)) * 100;
  await (await lending.connect(whale).openPositionWithCollateral(cir(10))).wait();
  await (await lending.connect(whale).takeLoan(0, usd(450_000))).wait();
  const util = Number(ethers.formatUnits(await lending.utilization(), 18));
  const aprHigh = Number(ethers.formatUnits(await lending.borrowAPR(), 18)) * 100;
  const kink = Number(ethers.formatUnits(await lending.kink(), 18));
  check("utilization pushed past the kink", util > kink, `utilization ${(util * 100).toFixed(1)}% > kink ${(kink * 100).toFixed(0)}%`);
  check("borrow APR jumps", aprHigh > aprLow + 5, `APR ${aprLow.toFixed(2)}% → ${aprHigh.toFixed(2)}%`);

  console.log("\n" + (failures === 0
    ? "ALL DEMO STEPS VERIFIED ✓ (on-chain behavior behind every click)"
    : `${failures} CHECK(S) FAILED ✗`));
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
