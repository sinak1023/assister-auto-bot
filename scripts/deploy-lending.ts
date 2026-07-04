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

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── Configuration ──────────────────────────────────────────────────
//
// Every value can be overridden from the environment so operators tune the
// deployment without editing code. Defaults are demo-friendly.

const TOKEN_DECIMALS = 8; // cirBTC and USDC both 8 decimals — preserves exact percentage math.

// Demo cirBTC: cirBTC has no public faucet, so a reviewer can't test against the
// real token. Set NEXT_PUBLIC_USE_MOCK_CIRBTC=true to deploy a mintable mock
// (8 decimals) with an in-app mint button; leave it unset for the production
// path against Circle's real cirBTC.
const USE_MOCK_CIRBTC = (process.env.NEXT_PUBLIC_USE_MOCK_CIRBTC ?? "false").toLowerCase() === "true";

const CONFIG = {
  // Real cirBTC collateral on Arc Testnet (used when USE_MOCK_CIRBTC is false).
  cirBtcAddress: process.env.CIRBTC_ADDRESS ?? "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",

  // Mock token parameters (USDC loan token, and optional demo cirBTC).
  usdcName: "USD Coin",
  usdcSymbol: "USDC",
  cirBtcName: "Circle BTC (Demo)",
  cirBtcSymbol: "cirBTC",

  // Oracle: initial cirBTC price in USD, scaled by 10**priceDecimals (Chainlink-style).
  priceDecimals: 8,
  cirBtcPriceUsd: process.env.CIRBTC_PRICE_USD ?? "100000", // $100,000 per cirBTC

  // Risk parameters (basis points, 10000 = 100%).
  collateralFactorBps: Number(process.env.COLLATERAL_FACTOR_BPS ?? 5000), // borrow up to 50%
  maxCollateralFactorBps: Number(process.env.MAX_COLLATERAL_FACTOR_BPS ?? 6500), // credit ceiling 65%
  liquidationThresholdBps: Number(process.env.LIQ_THRESHOLD_BPS ?? 8000), // liquidatable above 80%
  liquidationBonusBps: Number(process.env.LIQ_BONUS_BPS ?? 800), // 8% liquidator bonus
  closeFactorBps: Number(process.env.CLOSE_FACTOR_BPS ?? 5000), // repay up to 50% per liquidation

  // Pool seeding (8 decimals). Seeded via the supply side so the deployer is
  // the initial liquidity provider (share-backed) and the pool is borrowable
  // before any external supplier arrives.
  poolFunding: ethers.parseUnits(process.env.POOL_FUNDING ?? "500000", TOKEN_DECIMALS),
  deployerUsdc: ethers.parseUnits(process.env.DEPLOYER_USDC ?? "1000000", TOKEN_DECIMALS),
  deployerCirBtc: ethers.parseUnits(process.env.DEPLOYER_CIRBTC ?? "10", TOKEN_DECIMALS), // only for mock cirBTC

  // Faucet: fixed per-claim amounts + cooldown.
  faucetCooldown: Number(process.env.FAUCET_COOLDOWN_SECONDS ?? 24 * 60 * 60), // 24h
  faucetUsdcDrip: ethers.parseUnits(process.env.FAUCET_USDC_DRIP ?? "150", TOKEN_DECIMALS),
  faucetCirBtcDrip: ethers.parseUnits(process.env.FAUCET_CIRBTC_DRIP ?? "0.01", TOKEN_DECIMALS),
};

// ─── Helpers ────────────────────────────────────────────────────────

function writeEnvFile(envPath: string, vars: Record<string, string>) {
  const envContent: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, "utf-8");
    for (const line of existing.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        envContent[match[1].trim()] = match[2].trim();
      }
    }
  }
  Object.assign(envContent, vars);
  const output =
    Object.entries(envContent)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n";
  fs.writeFileSync(envPath, output);
}

async function clearStuckNonces(deployer: Awaited<ReturnType<typeof ethers.getSigners>>[number]) {
  const [latestNonce, pendingNonce] = await Promise.all([
    ethers.provider.getTransactionCount(deployer.address, "latest"),
    ethers.provider.getTransactionCount(deployer.address, "pending"),
  ]);
  if (pendingNonce <= latestNonce) return;

  const stuckCount = pendingNonce - latestNonce;
  console.log(
    `Found ${stuckCount} stuck pending tx(s) at nonce ${latestNonce}..${pendingNonce - 1}. Clearing with bumped-gas self-transfers...`
  );

  const feeData = await ethers.provider.getFeeData();
  const baseGasPrice = feeData.gasPrice ?? ethers.parseUnits("1", "gwei");
  const bumpedGasPrice = baseGasPrice * 5n;

  for (let nonce = latestNonce; nonce < pendingNonce; nonce++) {
    const tx = await deployer.sendTransaction({
      to: deployer.address,
      value: 0n,
      nonce,
      gasPrice: bumpedGasPrice,
    });
    await tx.wait();
    console.log(`  Replaced stuck tx at nonce ${nonce}: ${tx.hash}`);
  }
  console.log();
}

async function deployMockToken(name: string, symbol: string): Promise<{ address: string; contract: any }> {
  const factory = await ethers.getContractFactory("TestnetERC20");
  const token = await factory.deploy(name, symbol, TOKEN_DECIMALS);
  await token.waitForDeployment();
  return { address: await token.getAddress(), contract: token };
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No deployer account found. Set PRIVATE_KEY in .env.local (64 hex chars, with or without 0x prefix)."
    );
  }
  const [deployer] = signers;
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=== LendingBorrowingV2 Deployment ===\n");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatUnits(balance, 18), "(native gas)");
  console.log("Demo cirBTC:", USE_MOCK_CIRBTC ? "ON (mintable mock)" : "OFF (real cirBTC)");
  console.log();

  if (balance === 0n) {
    throw new Error("Deployer has no balance. Fund your wallet from https://faucet.circle.com/");
  }

  await clearStuckNonces(deployer);

  const envPath = path.resolve(__dirname, "../.env.local");

  // ─── Phase 1: Loan token (mock USDC) ────────────────────────────
  console.log("Phase 1: Deploying mock USDC loan token...");
  const usdc = await deployMockToken(CONFIG.usdcName, CONFIG.usdcSymbol);
  console.log(`  USDC: ${usdc.address}`);
  await (await usdc.contract.allocateTo(deployer.address, CONFIG.deployerUsdc)).wait();
  console.log(`  Minted ${ethers.formatUnits(CONFIG.deployerUsdc, TOKEN_DECIMALS)} USDC to deployer.\n`);

  // ─── Phase 2: Collateral token (real cirBTC or demo mock) ───────
  console.log("Phase 2: Resolving cirBTC collateral token...");
  let cirBtcAddr: string;
  let cirBtcMock: Awaited<ReturnType<typeof deployMockToken>>["contract"] | null = null;
  if (USE_MOCK_CIRBTC) {
    const cirBtc = await deployMockToken(CONFIG.cirBtcName, CONFIG.cirBtcSymbol);
    cirBtcAddr = cirBtc.address;
    cirBtcMock = cirBtc.contract;
    console.log(`  Demo cirBTC (mintable): ${cirBtcAddr}`);
    await (await cirBtc.contract.allocateTo(deployer.address, CONFIG.deployerCirBtc)).wait();
    console.log(`  Minted ${ethers.formatUnits(CONFIG.deployerCirBtc, TOKEN_DECIMALS)} cirBTC to deployer.\n`);
  } else {
    cirBtcAddr = CONFIG.cirBtcAddress;
    if (!ethers.isAddress(cirBtcAddr)) throw new Error(`cirBTC address is not valid: "${cirBtcAddr}"`);
    console.log(`  Using real cirBTC: ${cirBtcAddr}\n`);
  }

  // ─── Phase 3: Price oracle ──────────────────────────────────────
  console.log("Phase 3: Deploying MockPriceOracle...");
  const initialPrice = ethers.parseUnits(CONFIG.cirBtcPriceUsd, CONFIG.priceDecimals);
  const oracleFactory = await ethers.getContractFactory("MockPriceOracle");
  const oracle = await oracleFactory.deploy(initialPrice, CONFIG.priceDecimals);
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();
  console.log(`  MockPriceOracle: ${oracleAddr}`);
  console.log(`  Initial cirBTC price: $${Number(CONFIG.cirBtcPriceUsd).toLocaleString()}\n`);

  // ─── Phase 4: LendingBorrowingV2 ────────────────────────────────
  console.log("Phase 4: Deploying LendingBorrowingV2...");
  const lendingFactory = await ethers.getContractFactory("LendingBorrowingV2");
  const lending = await lendingFactory.deploy(
    cirBtcAddr,
    usdc.address,
    oracleAddr,
    CONFIG.collateralFactorBps,
    CONFIG.maxCollateralFactorBps,
    CONFIG.liquidationThresholdBps,
    CONFIG.liquidationBonusBps,
    CONFIG.closeFactorBps
  );
  await lending.waitForDeployment();
  const lendingAddr = await lending.getAddress();
  console.log(`  LendingBorrowingV2: ${lendingAddr}\n`);

  // ─── Phase 5: Seed liquidity via the supply side ────────────────
  console.log("Phase 5: Seeding liquidity (deployer supplies)...");
  await (await usdc.contract.approve(lendingAddr, CONFIG.poolFunding)).wait();
  await (await lending.supply(CONFIG.poolFunding)).wait();
  console.log(`  Supplied ${ethers.formatUnits(CONFIG.poolFunding, TOKEN_DECIMALS)} USDC as initial liquidity.\n`);

  // ─── Phase 6: Deploy the rate-limited faucet ────────────────────
  console.log("Phase 6: Deploying TokenFaucet...");
  const faucetFactory = await ethers.getContractFactory("TokenFaucet");
  const faucet = await faucetFactory.deploy(CONFIG.faucetCooldown);
  await faucet.waitForDeployment();
  const faucetAddr = await faucet.getAddress();
  console.log(`  TokenFaucet: ${faucetAddr}`);

  // Authorize the faucet to mint, and set fixed drip amounts.
  await (await usdc.contract.setMinter(faucetAddr, true)).wait();
  await (await faucet.setDrip(usdc.address, CONFIG.faucetUsdcDrip)).wait();
  console.log(`  USDC drip: ${ethers.formatUnits(CONFIG.faucetUsdcDrip, TOKEN_DECIMALS)} per ${CONFIG.faucetCooldown / 3600}h`);
  if (cirBtcMock) {
    await (await cirBtcMock.setMinter(faucetAddr, true)).wait();
    await (await faucet.setDrip(cirBtcAddr, CONFIG.faucetCirBtcDrip)).wait();
    console.log(`  cirBTC drip: ${ethers.formatUnits(CONFIG.faucetCirBtcDrip, TOKEN_DECIMALS)} per ${CONFIG.faucetCooldown / 3600}h`);
  } else {
    console.log("  (real cirBTC — no faucet drip; use Circle's faucet)");
  }
  console.log();

  // ─── Phase 7: Write .env.local ──────────────────────────────────
  writeEnvFile(envPath, {
    NEXT_PUBLIC_LENDING_ADDRESS: lendingAddr,
    NEXT_PUBLIC_USDC_ADDRESS: usdc.address,
    NEXT_PUBLIC_CIRBTC_ADDRESS: cirBtcAddr,
    NEXT_PUBLIC_ORACLE_ADDRESS: oracleAddr,
    NEXT_PUBLIC_FAUCET_ADDRESS: faucetAddr,
    NEXT_PUBLIC_USE_MOCK_CIRBTC: String(USE_MOCK_CIRBTC),
  });

  // ─── Summary ────────────────────────────────────────────────────
  console.log("=== Deployment Summary ===\n");
  console.log(`  cirBTC (collateral):        ${cirBtcAddr}${USE_MOCK_CIRBTC ? "  [demo mock]" : ""}`);
  console.log(`  USDC (loan token):          ${usdc.address}`);
  console.log(`  MockPriceOracle:            ${oracleAddr}`);
  console.log(`  TokenFaucet:                ${faucetAddr}`);
  console.log(`  LendingBorrowingV2:         ${lendingAddr}`);
  console.log(`  Collateral factor:          ${CONFIG.collateralFactorBps / 100}%  (credit ceiling ${CONFIG.maxCollateralFactorBps / 100}%)`);
  console.log(`  Liquidation threshold:      ${CONFIG.liquidationThresholdBps / 100}%  (bonus ${CONFIG.liquidationBonusBps / 100}%)`);
  console.log(`  Pool liquidity:             ${ethers.formatUnits(CONFIG.poolFunding, TOKEN_DECIMALS)} USDC`);
  console.log(`\nUpdated ${envPath} with deployed addresses.`);
  console.log("\nNext steps:");
  console.log("  1. (optional) Seed a near-liquidation demo:  npm run seed:demo");
  console.log("  2. Start the frontend:                       npm run dev");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
