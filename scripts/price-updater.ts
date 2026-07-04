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
 * Keeper that syncs the demo oracle to the real BTC/USD price (cirBTC ≈ BTC).
 * On mainnet this role is a read-only Chainlink feed behind {IPriceOracle};
 * on testnet — where no live feed exists — this off-chain updater fills the gap.
 *
 *     npm run price:updater            # push once
 *     PRICE_LOOP=true npm run price:updater   # keep pushing every PRICE_INTERVAL_SEC
 *
 * `setPrice` is permissionless, so any funded wallet can run this. During a
 * scripted liquidation demo, stop the keeper (or don't run it) so you can move
 * the price by hand from the UI.
 */

import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const INTERVAL_SEC = Number(process.env.PRICE_INTERVAL_SEC ?? 60);
const LOOP = (process.env.PRICE_LOOP ?? "false").toLowerCase() === "true";

// Fetch spot BTC/USD from a couple of public, key-less sources (with fallback).
async function fetchBtcUsd(): Promise<number> {
  const sources = [
    async () => {
      const r = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot");
      const j = (await r.json()) as { data?: { amount?: string } };
      return parseFloat(j.data?.amount ?? "");
    },
    async () => {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      const j = (await r.json()) as { bitcoin?: { usd?: number } };
      return Number(j.bitcoin?.usd);
    },
  ];
  for (const src of sources) {
    try {
      const price = await src();
      if (Number.isFinite(price) && price > 0) return price;
    } catch {
      /* try next source */
    }
  }
  throw new Error("Could not fetch BTC/USD from any source.");
}

async function pushOnce(oracle: Awaited<ReturnType<typeof ethers.getContractAt>>, decimals: number) {
  const btc = await fetchBtcUsd();
  const scaled = ethers.parseUnits(btc.toFixed(Math.min(decimals, 8)), decimals);
  const tx = await oracle.getFunction("setPrice")(scaled);
  await tx.wait();
  console.log(`[${new Date().toISOString()}] cirBTC price set to $${btc.toLocaleString()} (tx ${tx.hash})`);
}

async function main() {
  const oracleAddr = process.env.NEXT_PUBLIC_ORACLE_ADDRESS;
  if (!oracleAddr) throw new Error("NEXT_PUBLIC_ORACLE_ADDRESS missing — run `npm run deploy:lending` first.");

  const oracle = await ethers.getContractAt("MockPriceOracle", oracleAddr);
  const decimals = Number(await oracle.decimals());

  await pushOnce(oracle, decimals);
  if (!LOOP) return;

  console.log(`Looping every ${INTERVAL_SEC}s. Ctrl+C to stop.`);
  // Simple interval loop; each tick fetches and pushes the latest price.
  await new Promise<void>(() => {
    setInterval(() => {
      pushOnce(oracle, decimals).catch((e) => console.error("update failed:", e.message));
    }, INTERVAL_SEC * 1000);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
