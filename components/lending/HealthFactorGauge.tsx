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

// The signature element. A 180° arc from danger (left) through caution to
// positive (right); the fill and needle take the risk color at the current
// health factor, so the whole instrument changes color as a position slides
// toward liquidation. HF 1.0 is marked as a physical tick. The needle sweeps
// on change, respecting prefers-reduced-motion.

import { formatHFNumber } from "@/lib/format";

interface HealthFactorGaugeProps {
  hf: number; // Infinity when the position has no debt
  size?: number; // width in px
  className?: string;
}

// HF display range mapped across the dial.
const HF_MIN = 0.5;
const HF_MAX = 2.5;

function stateOf(hf: number): { color: string; label: string } {
  if (!Number.isFinite(hf)) return { color: "var(--positive)", label: "No debt" };
  if (hf < 1) return { color: "var(--danger)", label: "Liquidatable" };
  if (hf < 1.5) return { color: "var(--caution)", label: "At risk" };
  return { color: "var(--positive)", label: "Healthy" };
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 180) * Math.PI) / 180; // 180° = left, 0° = right
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}

export function HealthFactorGauge({ hf, size = 220, className }: HealthFactorGaugeProps) {
  const W = size;
  const H = size * 0.64;
  const cx = W / 2;
  const cy = H * 0.94;
  const r = W * 0.42;
  const stroke = Math.max(8, W * 0.055);

  const t = Number.isFinite(hf)
    ? Math.max(0, Math.min(1, (hf - HF_MIN) / (HF_MAX - HF_MIN)))
    : 1;
  const ang = 180 * t;
  const { color, label } = stateOf(hf);

  const tickT = (1 - HF_MIN) / (HF_MAX - HF_MIN); // HF 1.0 tick
  const [tx, ty] = polar(cx, cy, r + stroke / 2, 180 * tickT);
  const [tx2, ty2] = polar(cx, cy, r - stroke / 2 - 4, 180 * tickT);

  // Needle is drawn pointing right (screen angle 0°) and rotated into place, so
  // a CSS transition on `transform` produces the sweep. rotate(ang-180) maps the
  // dial: ang 0 -> points left, 90 -> up, 180 -> right.
  const needleLen = r - stroke / 2;
  const rotateDeg = ang - 180;

  const display = formatHFNumber(hf);

  return (
    <div className={`hf-gauge ${className ?? ""}`} style={{ width: W }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Health factor ${display}, ${label}`}>
        {/* Track */}
        <path d={arcPath(cx, cy, r, 0, 180)} fill="none" stroke="var(--secondary)" strokeWidth={stroke} strokeLinecap="round" />
        {/* Colored fill up to the current HF (with a soft glow — the signature moment) */}
        <path
          d={arcPath(cx, cy, r, 0, ang)}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${color})` }}
        />
        {/* HF = 1.0 tick */}
        <line x1={tx} y1={ty} x2={tx2} y2={ty2} stroke="var(--foreground)" strokeWidth={2} opacity={0.5} />
        <text x={tx} y={ty - 3} fill="var(--muted-foreground)" fontSize={W * 0.05} textAnchor="middle" fontFamily="var(--font-mono)">
          1.0
        </text>
        {/* Needle (the sweeping element) */}
        <line
          x1={cx}
          y1={cy}
          x2={cx + needleLen}
          y2={cy}
          stroke={color}
          strokeWidth={Math.max(3, W * 0.016)}
          strokeLinecap="round"
          className="hf-needle"
          style={{ transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${rotateDeg}deg)` }}
        />
        <circle cx={cx} cy={cy} r={Math.max(5, W * 0.03)} fill={color} />
      </svg>
      <div className="-mt-1 text-center">
        <div className="font-display font-bold leading-none" style={{ color, fontSize: W * 0.19 }}>
          {display}
        </div>
        <div className="mt-1 text-xs font-semibold uppercase tracking-wider" style={{ color }}>
          {label}
        </div>
      </div>
      <style jsx>{`
        .hf-needle {
          transition: transform 700ms cubic-bezier(0.34, 1.2, 0.64, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .hf-needle {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
