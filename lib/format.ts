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

import { formatUnits, maxUint256 } from "viem";
import { COLLATERAL_DECIMALS, LOAN_DECIMALS } from "@/lib/contracts/addresses";

/** Health factor is WAD-scaled (1e18 = 1.0); debt-free positions report maxUint256. */
export function hfToNumber(hf: bigint | undefined): number {
  if (hf === undefined) return NaN;
  if (hf >= maxUint256 / 2n) return Infinity;
  return Number(formatUnits(hf, 18));
}

// Very large HF means a tiny debt relative to collateral — effectively "safe".
// Cap the display so a near-zero debt doesn't render an astronomical number.
const HF_DISPLAY_MAX = 999;

export function formatHFNumber(n: number): string {
  if (Number.isNaN(n)) return "—";
  if (!Number.isFinite(n) || n > HF_DISPLAY_MAX) return "∞";
  return n.toFixed(2);
}

export function formatHF(hf: bigint | undefined): string {
  return formatHFNumber(hfToNumber(hf));
}

/** WAD-scaled per-year rate (1e18 = 100%) → percentage string. */
export function formatRatePct(rate: bigint | undefined, digits = 2): string {
  if (rate === undefined) return "—";
  return `${(Number(formatUnits(rate, 18)) * 100).toFixed(digits)}%`;
}

export function rateToPct(rate: bigint | undefined): number {
  if (rate === undefined) return 0;
  return Number(formatUnits(rate, 18)) * 100;
}

/** Basis points (10000 = 100%) → percentage number. */
export function bpsToPct(bps: bigint | undefined): number {
  if (bps === undefined) return 0;
  return Number(bps) / 100;
}

/** cirBTC collateral amount (8 decimals) → compact token string. */
export function formatCirBtc(amount: bigint | undefined, digits = 6): string {
  if (amount === undefined) return "—";
  const n = parseFloat(formatUnits(amount, COLLATERAL_DECIMALS));
  return n === 0 ? "0" : n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** USDC / USD value (loan token is 8-decimal, $1-pegged) → "$1,234.56". */
export function formatUsd(amount: bigint | undefined, digits = 2): string {
  if (amount === undefined) return "—";
  const n = parseFloat(formatUnits(amount, LOAN_DECIMALS));
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Bare USDC amount without the $ prefix (for input maxes and secondary text). */
export function formatUsdc(amount: bigint | undefined, digits = 2): string {
  if (amount === undefined) return "—";
  const n = parseFloat(formatUnits(amount, LOAN_DECIMALS));
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** Oracle price is scaled by 10**priceDecimals → "$100,000". */
export function formatPrice(price: bigint | undefined, priceDecimals: number | undefined): string {
  if (price === undefined || priceDecimals === undefined) return "—";
  const n = parseFloat(formatUnits(price, priceDecimals));
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function priceToNumber(price: bigint | undefined, priceDecimals: number | undefined): number {
  if (price === undefined || priceDecimals === undefined) return NaN;
  return parseFloat(formatUnits(price, priceDecimals));
}

/** Compact large USD figures for stat headlines ("$1.2M"). */
export function compactUsd(amount: bigint | undefined): string {
  if (amount === undefined) return "—";
  const n = parseFloat(formatUnits(amount, LOAN_DECIMALS));
  return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n)}`;
}
