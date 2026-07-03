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
 * Stage a near-liquidation position so a reviewer sees the drama immediately.
 *
 * Requires a deployment with a mintable demo cirBTC (NEXT_PUBLIC_USE_MOCK_CIRBTC=true),
 * since the real cirBTC has no faucet. Run after `npm run deploy:lending`:
 *
 *     NEXT_PUBLIC_USE_MOCK_CIRBTC=true npm run deploy:lending
 *     npm run seed:demo
 *
 * The script opens a position collateralized with demo cirBTC, borrows near the
 * limit, then nudges the oracle price down so the position's health factor sits
 * just above 1.0 — one more small price drop makes it liquidatable.
 */

import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const DEC = 8;
const WAD = 10n ** 18n;

// Demo shape: 0.1 cirBTC collateral, borrow $4,950, then price -> $65,000.
const COLLATERAL = ethers.parseUnits("0.1", DEC);
const BORROW = ethers.parseUnits("4950", DEC);
const STAGED_PRICE_USD = "65000";

function fmtHF(hf: bigint): string {
  if (hf === ethers.MaxUint256) return "∞ (no debt)";
  return (Number(hf) / Number(WAD)).toFixed(4);
}

async function main() {
  const lendingAddr = process.env.NEXT_PUBLIC_LENDING_ADDRESS;
  const cirBtcAddr = process.env.NEXT_PUBLIC_CIRBTC_ADDRESS;
  const oracleAddr = process.env.NEXT_PUBLIC_ORACLE_ADDRESS;
  const useMock = (process.env.NEXT_PUBLIC_USE_MOCK_CIRBTC ?? "false").toLowerCase() === "true";

  if (!lendingAddr || !cirBtcAddr || !oracleAddr) {
    throw new Error("Missing addresses in .env.local. Run `npm run deploy:lending` first.");
  }
  if (!useMock) {
    throw new Error(
      "seed:demo needs a mintable demo cirBTC. Redeploy with NEXT_PUBLIC_USE_MOCK_CIRBTC=true."
    );
  }

  const [signer] = await ethers.getSigners();
  console.log("=== Seeding a near-liquidation demo position ===\n");
  console.log("Borrower:", signer.address, "\n");

  const lending = await ethers.getContractAt("LendingBorrowingV2", lendingAddr);
  const cirBtc = await ethers.getContractAt("TestnetERC20", cirBtcAddr);
  const oracle = await ethers.getContractAt("MockPriceOracle", oracleAddr);

  // 1. Mint + approve demo cirBTC.
  console.log(`1. Minting ${ethers.formatUnits(COLLATERAL, DEC)} demo cirBTC...`);
  await (await cirBtc.allocateTo(signer.address, COLLATERAL)).wait();
  await (await cirBtc.approve(lendingAddr, COLLATERAL)).wait();

  // 2. Open a position with collateral.
  console.log("2. Opening a position and depositing collateral...");
  await (await lending.openPositionWithCollateral(COLLATERAL)).wait();
  const positionId = (await lending.positionCount(signer.address)) - 1n;

  // 3. Borrow near the limit.
  console.log(`3. Borrowing ${ethers.formatUnits(BORROW, DEC)} USDC...`);
  await (await lending.takeLoan(positionId, BORROW)).wait();

  let hf = await lending.healthFactor(signer.address, positionId);
  console.log(`   Health factor after borrow: ${fmtHF(hf)}`);

  // 4. Nudge the price down to stage the drama.
  console.log(`4. Moving cirBTC price to $${Number(STAGED_PRICE_USD).toLocaleString()}...`);
  const oracleDecimals = await oracle.decimals();
  await (await oracle.setPrice(ethers.parseUnits(STAGED_PRICE_USD, oracleDecimals))).wait();

  hf = await lending.healthFactor(signer.address, positionId);
  const debt = await lending.currentDebt(signer.address, positionId);

  console.log("\n=== Staged ===\n");
  console.log(`  Position id:     ${positionId}`);
  console.log(`  Collateral:      ${ethers.formatUnits(COLLATERAL, DEC)} cirBTC`);
  console.log(`  Debt:            ${ethers.formatUnits(debt, DEC)} USDC`);
  console.log(`  Health factor:   ${fmtHF(hf)}  (liquidatable below 1.0000)`);
  console.log("\nTo trigger a liquidation from the UI (or another wallet):");
  console.log("  • Open the price panel and drop cirBTC below ~$61,000, or");
  console.log("  • call oracle.setPrice() with a lower value.");
  console.log("Then anyone can liquidate the position from the Liquidations view.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
