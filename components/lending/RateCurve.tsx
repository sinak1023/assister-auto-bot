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

import { formatUnits } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRatePct } from "@/lib/format";

const wad = (x: bigint | undefined) => (x === undefined ? 0 : Number(formatUnits(x, 18)));

// Kinked borrow-rate curve: base + slope1 up to the kink, base + slope1 + slope2
// above it. Mirrors LendingBorrowingV2._borrowRatePerYear for display.
function rateAt(u: number, base: number, s1: number, s2: number, kink: number): number {
  if (u <= kink) return base + (u * s1) / kink;
  return base + s1 + ((u - kink) * s2) / (1 - kink);
}

export function RateCurve({
  baseRatePerYear,
  slope1,
  slope2,
  kink,
  utilization,
  borrowAPR,
  supplyAPY,
}: {
  baseRatePerYear: bigint | undefined;
  slope1: bigint | undefined;
  slope2: bigint | undefined;
  kink: bigint | undefined;
  utilization: bigint | undefined;
  borrowAPR: bigint | undefined;
  supplyAPY: bigint | undefined;
}) {
  const base = wad(baseRatePerYear);
  const s1 = wad(slope1);
  const s2 = wad(slope2);
  const k = kink !== undefined ? wad(kink) : 0.8;
  const u = wad(utilization);
  const ready = kink !== undefined && baseRatePerYear !== undefined;

  const W = 320;
  const H = 150;
  const pad = { l: 8, r: 8, t: 10, b: 18 };
  const maxRate = (ready ? rateAt(1, base, s1, s2, k) : 1) || 1; // avoid /0 if rates are all zero

  const x = (uu: number) => pad.l + uu * (W - pad.l - pad.r);
  const y = (r: number) => H - pad.b - (r / maxRate) * (H - pad.t - pad.b);

  const N = 60;
  const pts = ready
    ? Array.from({ length: N + 1 }, (_, i) => {
        const uu = i / N;
        return [x(uu), y(rateAt(uu, base, s1, s2, k))];
      })
    : [];
  const line = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const area = ready ? `${line} L ${x(1).toFixed(1)} ${(H - pad.b).toFixed(1)} L ${x(0).toFixed(1)} ${(H - pad.b).toFixed(1)} Z` : "";

  const curX = x(u);
  const curY = ready ? y(rateAt(u, base, s1, s2, k)) : 0;
  const kinkX = x(k);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Interest rate model</CardTitle>
        <p className="text-xs text-muted-foreground">
          Borrow APR rises with utilization, steepening past the {(k * 100).toFixed(0)}% kink.
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Borrow APR</p>
            <p className="font-mono text-lg font-semibold text-primary">{formatRatePct(borrowAPR)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Supply APY</p>
            <p className="font-mono text-lg font-semibold text-positive">{formatRatePct(supplyAPY)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Utilization</p>
            <p className="font-mono text-lg font-semibold text-foreground">{(u * 100).toFixed(1)}%</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Borrow rate versus utilization curve">
            {/* baseline grid */}
            <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--border)" strokeWidth={1} />
            {/* kink marker */}
            {ready && (
              <line x1={kinkX} y1={pad.t} x2={kinkX} y2={H - pad.b} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 3" />
            )}
            <path d={area} fill="var(--primary)" opacity={0.12} />
            <path d={line} fill="none" stroke="var(--primary)" strokeWidth={2} />
            {/* current utilization */}
            {ready && (
              <>
                <line x1={curX} y1={pad.t} x2={curX} y2={H - pad.b} stroke="var(--foreground)" strokeWidth={1} opacity={0.25} />
                <circle cx={curX} cy={curY} r={4} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} />
              </>
            )}
            <text x={pad.l} y={H - 4} fontSize={9} fill="var(--muted-foreground)" fontFamily="var(--font-mono)">0%</text>
            <text x={kinkX} y={H - 4} fontSize={9} fill="var(--muted-foreground)" textAnchor="middle" fontFamily="var(--font-mono)">
              kink
            </text>
            <text x={W - pad.r} y={H - 4} fontSize={9} fill="var(--muted-foreground)" textAnchor="end" fontFamily="var(--font-mono)">
              100%
            </text>
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
