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

import { formatUnits } from "viem";
import { COLLATERAL_DECIMALS, LOAN_DECIMALS } from "@/lib/contracts/addresses";

/**
 * Client-side mirror of the contract's position math, used only to PREVIEW the
 * result of an action before the user confirms. The contract remains the source
 * of truth and enforces every limit exactly; this is display-only.
 */
export interface PositionSim {
  collateralValue: number; // USD
  debt: number; // USD
  hf: number; // 1.0 = at the liquidation edge; Infinity when debt-free
  maxBorrow: number; // USD borrow capacity
  available: number; // USD still borrowable
}

export interface SimInputs {
  collateralRaw: bigint;
  debtRaw: bigint;
  priceRaw: bigint | undefined;
  priceDecimals: number | undefined;
  effectiveFactorBps: bigint | undefined; // borrow capacity factor
  liquidationThresholdBps: bigint | undefined; // health-factor threshold
}

function toNum(raw: bigint, decimals: number): number {
  return parseFloat(formatUnits(raw, decimals));
}

export function simulate(inputs: SimInputs): PositionSim {
  const { collateralRaw, debtRaw, priceRaw, priceDecimals, effectiveFactorBps, liquidationThresholdBps } = inputs;

  const collateralTokens = toNum(collateralRaw, COLLATERAL_DECIMALS);
  const price = priceRaw !== undefined && priceDecimals !== undefined ? toNum(priceRaw, priceDecimals) : 0;
  const debt = toNum(debtRaw, LOAN_DECIMALS);

  const collateralValue = collateralTokens * price;
  const effFactor = effectiveFactorBps !== undefined ? Number(effectiveFactorBps) / 10_000 : 0;
  const liqFactor = liquidationThresholdBps !== undefined ? Number(liquidationThresholdBps) / 10_000 : 0;

  const maxBorrow = collateralValue * effFactor;
  const hf = debt <= 0 ? Infinity : (collateralValue * liqFactor) / debt;
  const available = Math.max(maxBorrow - debt, 0);

  return { collateralValue, debt, hf, maxBorrow, available };
}

/** Apply a signed collateral delta (tokens) and USD debt delta, then re-simulate. */
export function simulateAfter(
  inputs: SimInputs,
  collateralDeltaRaw: bigint,
  debtDeltaRaw: bigint,
): PositionSim {
  const collateralRaw = inputs.collateralRaw + collateralDeltaRaw;
  const debtRaw = inputs.debtRaw + debtDeltaRaw > 0n ? inputs.debtRaw + debtDeltaRaw : 0n;
  return simulate({ ...inputs, collateralRaw, debtRaw });
}
