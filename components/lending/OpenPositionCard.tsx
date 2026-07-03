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
import { parseUnits } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TxStatus } from "@/components/trading/TxStatus";
import { useOpenPosition, useApproveCirBtc } from "@/hooks/lending/useLendingActions";
import { COLLATERAL_DECIMALS } from "@/lib/contracts/addresses";
import { formatCirBtc, formatUsd, priceToNumber, bpsToPct } from "@/lib/format";

const APPROVE_CIRBTC = parseUnits("1000000", COLLATERAL_DECIMALS);

export function OpenPositionCard({
  cirBtcBalance,
  cirBtcAllowance,
  price,
  priceDecimals,
  effectiveCollateralFactorBps,
  onSuccess,
}: {
  cirBtcBalance: bigint | undefined;
  cirBtcAllowance: bigint | undefined;
  price: bigint | undefined;
  priceDecimals: number | undefined;
  effectiveCollateralFactorBps: bigint | undefined;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const open = useOpenPosition();
  const approve = useApproveCirBtc();

  useEffect(() => { if (open.isSuccess) { setAmount(""); onSuccess(); } }, [open.isSuccess, onSuccess]);
  useEffect(() => { if (approve.isSuccess) onSuccess(); }, [approve.isSuccess, onSuccess]);

  const maxN = cirBtcBalance !== undefined ? Number(cirBtcBalance) / 10 ** COLLATERAL_DECIMALS : 0;
  const amtN = parseFloat(amount) || 0;
  const priceN = priceToNumber(price, priceDecimals);
  const collValue = Number.isFinite(priceN) ? amtN * priceN : 0;
  const maxBorrow = collValue * (bpsToPct(effectiveCollateralFactorBps) / 100);

  const amtBig = amount ? parseUnits(amount, COLLATERAL_DECIMALS) : 0n;
  const needApproval = cirBtcAllowance !== undefined && amtBig > 0n && amtBig > cirBtcAllowance;
  const busy = open.isPending || open.isConfirming || open.isSubmitted;
  const approveBusy = approve.isPending || approve.isConfirming || approve.isSubmitted;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Open a new position</CardTitle>
        <p className="text-xs text-muted-foreground">Deposit cirBTC as collateral to start a fresh, independent position.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Collateral (cirBTC)</span>
            <button onClick={() => setAmount(String(maxN))} className="text-xs font-medium text-primary hover:underline">Max</button>
          </div>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              setAmount(!Number.isNaN(n) && n > maxN ? String(maxN) : e.target.value);
            }}
            className="mt-1 font-mono"
          />
          <p className="mt-1 text-xs text-muted-foreground">Wallet {formatCirBtc(cirBtcBalance)} cirBTC</p>
        </div>

        {amtN > 0 && (
          <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Collateral value</span><span className="font-mono">{collValue > 0 ? formatUsd(BigInt(Math.round(collValue * 1e8))) : "—"}</span></div>
            <div className="mt-1 flex justify-between"><span className="text-muted-foreground">You could borrow up to</span><span className="font-mono text-primary">{maxBorrow > 0 ? formatUsd(BigInt(Math.round(maxBorrow * 1e8))) : "—"}</span></div>
          </div>
        )}

        {needApproval ? (
          <>
            <Button className="w-full" variant="outline" onClick={() => approve.approve(APPROVE_CIRBTC)} disabled={approveBusy}>
              {approveBusy ? "Approving…" : "Approve cirBTC"}
            </Button>
            <TxStatus {...approve} />
          </>
        ) : (
          <>
            <Button className="w-full" onClick={() => open.open(amount)} disabled={busy || !amount || amtN <= 0}>
              {busy ? "Opening…" : "Open position"}
            </Button>
            <TxStatus {...open} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
