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

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/lending/StatCard";
import { compactUsd, formatRatePct, formatUsd, formatHF, hfToNumber } from "@/lib/format";

export function TreasuryDashboard({
  poolLiquidity,
  totalBorrows,
  utilization,
  borrowAPR,
  supplyAPY,
  totalCollateralValue,
  totalDebt,
  accountHealthFactor,
  connected,
}: {
  poolLiquidity: bigint | undefined;
  totalBorrows: bigint | undefined;
  utilization: bigint | undefined;
  borrowAPR: bigint | undefined;
  supplyAPY: bigint | undefined;
  totalCollateralValue: bigint | undefined;
  totalDebt: bigint | undefined;
  accountHealthFactor: bigint | undefined;
  connected: boolean;
}) {
  const tvl =
    poolLiquidity !== undefined && totalBorrows !== undefined ? poolLiquidity + totalBorrows : undefined;
  const util = utilization !== undefined ? Number(utilization) / 1e18 : undefined;
  const aggHf = hfToNumber(accountHealthFactor);
  const aggColor = !Number.isFinite(aggHf) ? "var(--positive)" : aggHf < 1 ? "var(--danger)" : aggHf < 1.5 ? "var(--caution)" : "var(--positive)";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pool overview</CardTitle>
          <p className="text-xs text-muted-foreground">USDC market backed by cirBTC collateral on Arc.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Total supplied (TVL)" value={compactUsd(tvl)} sub="cash + borrows" />
            <StatCard label="Available to borrow" value={compactUsd(poolLiquidity)} sub="idle pool cash" />
            <StatCard label="Total borrowed" value={compactUsd(totalBorrows)} sub="incl. accrued interest" />
            <StatCard label="Utilization" value={util !== undefined ? `${(util * 100).toFixed(1)}%` : "—"} sub={`borrow ${formatRatePct(borrowAPR)} · supply ${formatRatePct(supplyAPY)}`} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your portfolio</CardTitle>
          <p className="text-xs text-muted-foreground">Aggregated across all your positions.</p>
        </CardHeader>
        <CardContent>
          {!connected ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Connect your wallet to see your portfolio.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Collateral value" value={formatUsd(totalCollateralValue)} sub="cirBTC at oracle price" />
              <StatCard label="Total debt" value={formatUsd(totalDebt)} sub="USDC owed" />
              <StatCard label="Net exposure" value={formatUsd(totalCollateralValue !== undefined && totalDebt !== undefined ? (totalCollateralValue > totalDebt ? totalCollateralValue - totalDebt : 0n) : undefined)} sub="collateral − debt" />
              <StatCard label="Account health" value={formatHF(accountHealthFactor)} sub="aggregate HF" accent={aggColor} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
