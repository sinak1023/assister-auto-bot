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
import type { CreditData } from "@/hooks/lending/useLendingState";
import { bpsToPct, formatUsdc } from "@/lib/format";

function scoreColor(score: number): string {
  if (score >= 750) return "var(--positive)";
  if (score >= 500) return "var(--gold)";
  return "var(--danger)";
}

export function CreditTab({
  creditScore,
  credit,
  collateralFactorBps,
  maxCollateralFactorBps,
  effectiveCollateralFactorBps,
}: {
  creditScore: bigint | undefined;
  credit: CreditData | undefined;
  collateralFactorBps: bigint | undefined;
  maxCollateralFactorBps: bigint | undefined;
  effectiveCollateralFactorBps: bigint | undefined;
}) {
  const score = creditScore !== undefined ? Number(creditScore) : undefined;
  const base = bpsToPct(collateralFactorBps);
  const max = bpsToPct(maxCollateralFactorBps);
  const eff = bpsToPct(effectiveCollateralFactorBps);
  const unlocked = eff > base + 0.001;

  const factors = [
    {
      label: "Loans repaid in full",
      value: credit ? credit.loansFullyRepaid.toString() : "—",
      effect: "raises score",
      good: true,
    },
    {
      label: "Total repaid volume",
      value: credit ? formatUsdc(credit.totalRepaidVolume) + " USDC" : "—",
      effect: "raises score",
      good: true,
    },
    {
      label: "Times liquidated",
      value: credit ? credit.liquidations.toString() : "—",
      effect: "lowers score",
      good: credit ? credit.liquidations === 0n : true,
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">On-Chain Credit Score</CardTitle>
          <p className="text-xs text-muted-foreground">
            Derived purely from your on-chain history on this protocol. A higher score unlocks a better personal
            collateral factor — always kept safely below the liquidation threshold.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-4xl font-bold" style={{ color: score !== undefined ? scoreColor(score) : "var(--muted-foreground)" }}>
                {score ?? "—"}
              </span>
              <span className="text-xs text-muted-foreground">out of 1000</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${score !== undefined ? (score / 1000) * 100 : 0}%`,
                  background: score !== undefined ? scoreColor(score) : "var(--muted)",
                }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>0</span>
              <span>500 · baseline</span>
              <span>1000</span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-secondary/40 p-3">
            <p className="text-xs text-muted-foreground">Benefit Unlocked</p>
            <p className="mt-1 text-sm">
              Collateral factor{" "}
              <span className="font-mono text-muted-foreground line-through">{base.toFixed(0)}%</span>{" "}
              <span className="font-mono font-semibold text-foreground">→ {eff.toFixed(1)}%</span>
              {unlocked ? (
                <span className="text-positive"> — you can borrow more against the same collateral.</span>
              ) : (
                <span className="text-muted-foreground"> — repay loans in full to raise this toward {max.toFixed(0)}%.</span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What Shapes Your Score</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {factors.map((f) => (
            <div key={f.label} className="flex items-center justify-between border-b border-border/60 py-2 last:border-0">
              <div>
                <p className="text-sm">{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.effect}</p>
              </div>
              <span className="font-mono text-sm font-medium" style={{ color: f.good ? "var(--foreground)" : "var(--danger)" }}>
                {f.value}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
