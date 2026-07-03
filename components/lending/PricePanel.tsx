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

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TxStatus } from "@/components/trading/TxStatus";
import { useSetPrice } from "@/hooks/lending/useLendingActions";
import { priceToNumber } from "@/lib/format";

// Testnet/demo control: nudge the cirBTC price and watch positions' health
// factors react in real time. On mainnet this seam is a read-only Chainlink
// feed (see ARCHITECTURE.md § Oracle seam) and this panel would not ship.
export function PricePanel({
  price,
  priceDecimals,
  onSuccess,
}: {
  price: bigint | undefined;
  priceDecimals: number | undefined;
  onSuccess: () => void;
}) {
  const current = priceToNumber(price, priceDecimals);
  const [value, setValue] = useState("");
  const setPrice = useSetPrice();

  useEffect(() => {
    if (setPrice.isSuccess) onSuccess();
  }, [setPrice.isSuccess, onSuccess]);

  const busy = setPrice.isPending || setPrice.isConfirming || setPrice.isSubmitted;

  function submit(next: number) {
    if (priceDecimals === undefined || !Number.isFinite(next) || next <= 0) return;
    // Trim to the oracle's precision to avoid parseUnits overflow.
    setPrice.setPrice(next.toFixed(Math.min(priceDecimals, 8)), priceDecimals);
  }

  function nudge(pct: number) {
    if (!Number.isFinite(current)) return;
    submit(current * (1 + pct / 100));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          cirBTC price
          <Badge variant="secondary">demo oracle</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Move the price to watch health factors react. Testnet only — mainnet uses a live Chainlink feed.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Current</span>
          <span className="font-mono text-2xl font-semibold text-gold">
            {Number.isFinite(current) ? `$${current.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}
          </span>
        </div>

        <div className="flex gap-1">
          {[-10, -5, +5, +10].map((p) => (
            <button
              key={p}
              onClick={() => nudge(p)}
              disabled={busy || !Number.isFinite(current)}
              className="flex-1 rounded bg-secondary px-2 py-1.5 font-mono text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {p > 0 ? `+${p}` : p}%
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Set exact price"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="font-mono"
          />
          <Button
            onClick={() => {
              submit(parseFloat(value));
              setValue("");
            }}
            disabled={busy || !value || parseFloat(value) <= 0}
          >
            {busy ? "Setting…" : "Set"}
          </Button>
        </div>
        <TxStatus {...setPrice} />
      </CardContent>
    </Card>
  );
}
