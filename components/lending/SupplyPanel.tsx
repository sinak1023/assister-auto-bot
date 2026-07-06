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
import { parseUnits, maxUint256 } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TxStatus } from "@/components/trading/TxStatus";
import { StatCard } from "@/components/lending/StatCard";
import { useSupply, useWithdrawSupply, useApproveUsdc } from "@/hooks/lending/useLendingActions";
import { LOAN_DECIMALS } from "@/lib/contracts/addresses";
import { formatUsd, formatUsdc, formatRatePct, compactUsd } from "@/lib/format";

const APPROVE_USDC = parseUnits("100000000", LOAN_DECIMALS);

function num(x: bigint | undefined): number {
  return x === undefined ? 0 : Number(x) / 10 ** LOAN_DECIMALS;
}

export function SupplyPanel({
  usdcBalance,
  usdcAllowance,
  supplyBalance,
  totalSupplied,
  supplyAPY,
  connected,
  onSuccess,
}: {
  usdcBalance: bigint | undefined;
  usdcAllowance: bigint | undefined;
  supplyBalance: bigint | undefined;
  totalSupplied: bigint | undefined;
  supplyAPY: bigint | undefined;
  connected: boolean;
  onSuccess: () => void;
}) {
  const [supplyAmt, setSupplyAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");

  const supply = useSupply();
  const withdraw = useWithdrawSupply();
  const approve = useApproveUsdc();

  useEffect(() => { if (supply.isSuccess) { setSupplyAmt(""); onSuccess(); } }, [supply.isSuccess, onSuccess]);
  useEffect(() => { if (withdraw.isSuccess) { setWithdrawAmt(""); onSuccess(); } }, [withdraw.isSuccess, onSuccess]);
  useEffect(() => { if (approve.isSuccess) onSuccess(); }, [approve.isSuccess, onSuccess]);

  const busy = (a: { isPending: boolean; isConfirming: boolean; isSubmitted: boolean }) =>
    a.isPending || a.isConfirming || a.isSubmitted;

  const maxSupply = num(usdcBalance);
  const maxWithdraw = num(supplyBalance);
  const supplyBig = supplyAmt ? parseUnits(supplyAmt, LOAN_DECIMALS) : 0n;
  const needApproval = usdcAllowance !== undefined && supplyBig > 0n && supplyBig > usdcAllowance;

  function clamp(v: string, max: number): string {
    const n = parseFloat(v);
    if (Number.isNaN(n)) return v;
    return n > max ? String(max) : v;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Supply APY" value={formatRatePct(supplyAPY)} accent="var(--positive)" sub="Paid by borrowers" />
        <StatCard label="Your Supply" value={connected ? formatUsd(supplyBalance) : "—"} />
        <StatCard label="Total Supply (USDC)" value={compactUsd(totalSupplied)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Earn
            <Badge variant="secondary">USDC</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Supply USDC and earn from borrowers. (Withdraw anytime, up to available liquidity)
          </p>
        </CardHeader>
        <CardContent>
          {!connected ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Connect your wallet to supply and earn.</p>
          ) : (
            <Tabs defaultValue="supply">
              <TabsList className="w-full">
                <TabsTrigger value="supply" className="flex-1">Supply</TabsTrigger>
                <TabsTrigger value="withdraw" className="flex-1">Withdraw</TabsTrigger>
              </TabsList>

              <TabsContent value="supply" className="space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Amount (USDC)</span>
                    <button onClick={() => setSupplyAmt(String(maxSupply))} className="text-xs font-medium text-primary hover:underline">Max</button>
                  </div>
                  <Input type="number" inputMode="decimal" placeholder="0" value={supplyAmt} onChange={(e) => setSupplyAmt(clamp(e.target.value, maxSupply))} className="mt-1 font-mono" />
                  <p className="mt-1 text-xs text-muted-foreground">Wallet {formatUsdc(usdcBalance)} USDC</p>
                </div>
                {needApproval ? (
                  <>
                    <Button className="w-full" variant="outline" onClick={() => approve.approve(APPROVE_USDC)} disabled={busy(approve)}>
                      {busy(approve) ? "Approving…" : "Approve USDC"}
                    </Button>
                    <TxStatus {...approve} />
                  </>
                ) : (
                  <>
                    <Button className="w-full bg-positive text-positive-foreground hover:opacity-90" onClick={() => supply.supply(supplyAmt)} disabled={busy(supply) || !supplyAmt || parseFloat(supplyAmt) <= 0}>
                      {busy(supply) ? "Supplying…" : "Supply USDC"}
                    </Button>
                    <TxStatus {...supply} />
                  </>
                )}
              </TabsContent>

              <TabsContent value="withdraw" className="space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Amount (USDC)</span>
                    <button onClick={() => setWithdrawAmt(String(maxWithdraw))} className="text-xs font-medium text-primary hover:underline">Max</button>
                  </div>
                  <Input type="number" inputMode="decimal" placeholder="0" value={withdrawAmt} onChange={(e) => setWithdrawAmt(clamp(e.target.value, maxWithdraw))} className="mt-1 font-mono" />
                  <p className="mt-1 text-xs text-muted-foreground">Supplied {formatUsd(supplyBalance)}</p>
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  // Full withdraw uses maxUint so the contract burns all shares exactly.
                  onClick={() => withdraw.withdrawSupply(withdrawAmt, parseFloat(withdrawAmt) >= maxWithdraw ? maxUint256 : undefined)}
                  disabled={busy(withdraw) || !withdrawAmt || parseFloat(withdrawAmt) <= 0}
                >
                  {busy(withdraw) ? "Withdrawing…" : "Withdraw USDC"}
                </Button>
                <TxStatus {...withdraw} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
