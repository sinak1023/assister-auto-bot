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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TxStatus } from "@/components/trading/TxStatus";
import { HealthFactorGauge } from "@/components/lending/HealthFactorGauge";
import type { PositionDetails } from "@/hooks/lending/useLendingState";
import {
  useTakeLoan,
  useRepayLoan,
  useDepositCollateral,
  useWithdrawCollateral,
  useApproveCirBtc,
  useApproveUsdc,
} from "@/hooks/lending/useLendingActions";
import { COLLATERAL_DECIMALS, LOAN_DECIMALS } from "@/lib/contracts/addresses";
import { simulate, simulateAfter, type SimInputs } from "@/lib/simulate";
import { hfToNumber, formatHFNumber, formatUsd, formatCirBtc } from "@/lib/format";

const APPROVE_CIRBTC = parseUnits("1000000", COLLATERAL_DECIMALS);
const APPROVE_USDC = parseUnits("100000000", LOAN_DECIMALS);

interface Ctx {
  price: bigint | undefined;
  priceDecimals: number | undefined;
  effectiveCollateralFactorBps: bigint | undefined;
  liquidationThresholdBps: bigint | undefined;
  cirBtcBalance: bigint | undefined;
  cirBtcAllowance: bigint | undefined;
  usdcBalance: bigint | undefined;
  usdcAllowance: bigint | undefined;
  poolLiquidity: bigint | undefined;
}

function num(x: bigint | undefined, decimals: number): number {
  if (x === undefined) return 0;
  return Number(x) / 10 ** decimals;
}

function clamp(value: string, max: number): string {
  if (!value) return value;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return value;
  return n > max ? String(max) : value;
}

function busyOf(a: { isPending: boolean; isConfirming: boolean; isSubmitted: boolean }): boolean {
  return a.isPending || a.isConfirming || a.isSubmitted;
}

// One line that previews the resulting position state before the user confirms.
function AfterPreview({ before, after }: { before: number; after: number; }) {
  const color = !Number.isFinite(after) ? "var(--positive)" : after < 1 ? "var(--danger)" : after < 1.5 ? "var(--caution)" : "var(--positive)";
  const fmt = formatHFNumber;
  return (
    <p className="text-xs text-muted-foreground">
      Health factor <span className="font-mono">{fmt(before)}</span>
      <span aria-hidden> → </span>
      <span className="font-mono font-semibold" style={{ color }}>{fmt(after)}</span>
    </p>
  );
}

export function PositionCard({
  position,
  ctx,
  onSuccess,
}: {
  position: PositionDetails;
  ctx: Ctx;
  onSuccess: () => void;
}) {
  const inputs: SimInputs = {
    collateralRaw: position.collateral,
    debtRaw: position.debt,
    priceRaw: ctx.price,
    priceDecimals: ctx.priceDecimals,
    effectiveFactorBps: ctx.effectiveCollateralFactorBps,
    liquidationThresholdBps: ctx.liquidationThresholdBps,
  };
  const cur = simulate(inputs);
  const curHf = hfToNumber(position.healthFactor);

  const [borrowAmt, setBorrowAmt] = useState("");
  const [repayAmt, setRepayAmt] = useState("");
  const [addAmt, setAddAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");

  const takeLoan = useTakeLoan();
  const repayLoan = useRepayLoan();
  const deposit = useDepositCollateral();
  const withdraw = useWithdrawCollateral();
  const approveCir = useApproveCirBtc();
  const approveUsdc = useApproveUsdc();

  useEffect(() => { if (takeLoan.isSuccess) { setBorrowAmt(""); onSuccess(); } }, [takeLoan.isSuccess, onSuccess]);
  useEffect(() => { if (repayLoan.isSuccess) { setRepayAmt(""); onSuccess(); } }, [repayLoan.isSuccess, onSuccess]);
  useEffect(() => { if (deposit.isSuccess) { setAddAmt(""); onSuccess(); } }, [deposit.isSuccess, onSuccess]);
  useEffect(() => { if (withdraw.isSuccess) { setWithdrawAmt(""); onSuccess(); } }, [withdraw.isSuccess, onSuccess]);
  useEffect(() => { if (approveCir.isSuccess) onSuccess(); }, [approveCir.isSuccess, onSuccess]);
  useEffect(() => { if (approveUsdc.isSuccess) onSuccess(); }, [approveUsdc.isSuccess, onSuccess]);

  // Maxes
  const priceN = num(ctx.price, ctx.priceDecimals ?? 8);
  const effFactor = ctx.effectiveCollateralFactorBps !== undefined ? Number(ctx.effectiveCollateralFactorBps) / 10_000 : 0;
  const poolUsd = num(ctx.poolLiquidity, LOAN_DECIMALS);
  const maxBorrow = Math.max(0, Math.min(cur.available, poolUsd));
  const maxRepay = Math.min(num(position.debt, LOAN_DECIMALS), num(ctx.usdcBalance, LOAN_DECIMALS));
  const maxAdd = num(ctx.cirBtcBalance, COLLATERAL_DECIMALS);
  const collTokens = num(position.collateral, COLLATERAL_DECIMALS);
  const debtUsd = num(position.debt, LOAN_DECIMALS);
  const requiredColl = priceN * effFactor > 0 ? debtUsd / (priceN * effFactor) : 0;
  const maxWithdraw = Math.max(0, collTokens - requiredColl);

  // Previews
  const afterBorrow = borrowAmt ? simulateAfter(inputs, 0n, parseUnits(borrowAmt || "0", LOAN_DECIMALS)).hf : cur.hf;
  // A full repay closes the debt → HF is effectively infinite; guard against a
  // dust remainder (from interest ticking) showing an astronomical number.
  const afterRepay = repayAmt
    ? parseFloat(repayAmt) >= num(position.debt, LOAN_DECIMALS) - 1e-9
      ? Infinity
      : simulateAfter(inputs, 0n, -parseUnits(repayAmt || "0", LOAN_DECIMALS)).hf
    : cur.hf;
  const afterAdd = addAmt ? simulateAfter(inputs, parseUnits(addAmt || "0", COLLATERAL_DECIMALS), 0n).hf : cur.hf;
  const afterWithdraw = withdrawAmt ? simulateAfter(inputs, -parseUnits(withdrawAmt || "0", COLLATERAL_DECIMALS), 0n).hf : cur.hf;

  const repayBig = repayAmt ? parseUnits(repayAmt, LOAN_DECIMALS) : 0n;
  const addBig = addAmt ? parseUnits(addAmt, COLLATERAL_DECIMALS) : 0n;
  const needUsdcApproval = ctx.usdcAllowance !== undefined && repayBig > 0n && repayBig > ctx.usdcAllowance;
  const needCirApproval = ctx.cirBtcAllowance !== undefined && addBig > 0n && addBig > ctx.cirBtcAllowance;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              Position #{position.id}
              {position.debt > 0n ? <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-400">Borrowing</Badge> : <Badge variant="secondary">Collateral only</Badge>}
            </CardTitle>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <span className="text-muted-foreground">Collateral</span>
              <span className="text-right font-mono text-gold">{formatCirBtc(position.collateral)} cirBTC</span>
              <span className="text-muted-foreground">Collateral value</span>
              <span className="text-right font-mono">{formatUsd(position.collateralValueLoan)}</span>
              <span className="text-muted-foreground">Debt</span>
              <span className="text-right font-mono text-primary">{formatUsd(position.debt)}</span>
              <span className="text-muted-foreground">Available to borrow</span>
              <span className="text-right font-mono">{formatUsd(position.maxAdditionalBorrow)}</span>
            </div>
          </div>
          <HealthFactorGauge hf={curHf} size={132} />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="borrow">
          <TabsList className="w-full">
            <TabsTrigger value="borrow" className="flex-1">Borrow</TabsTrigger>
            <TabsTrigger value="repay" className="flex-1">Repay</TabsTrigger>
            <TabsTrigger value="add" className="flex-1">Add</TabsTrigger>
            <TabsTrigger value="withdraw" className="flex-1">Withdraw</TabsTrigger>
          </TabsList>

          {/* Borrow */}
          <TabsContent value="borrow" className="space-y-3">
            <FormRow
              unit="USDC"
              value={borrowAmt}
              onChange={(v) => setBorrowAmt(clamp(v, maxBorrow))}
              onMax={() => setBorrowAmt(String(maxBorrow))}
              maxLabel={`Up to ${formatUsd(position.maxAdditionalBorrow)} · pool ${formatUsd(ctx.poolLiquidity)}`}
            />
            <AfterPreview before={cur.hf} after={afterBorrow} />
            <Button
              className="w-full"
              onClick={() => takeLoan.borrow(position.id, borrowAmt)}
              disabled={busyOf(takeLoan) || !borrowAmt || parseFloat(borrowAmt) <= 0}
            >
              {busyOf(takeLoan) ? "Borrowing…" : "Borrow USDC"}
            </Button>
            <TxStatus {...takeLoan} />
          </TabsContent>

          {/* Repay */}
          <TabsContent value="repay" className="space-y-3">
            {position.debt === 0n ? (
              <p className="py-2 text-center text-xs text-muted-foreground">No debt to repay on this position.</p>
            ) : (
              <>
                <FormRow
                  unit="USDC"
                  value={repayAmt}
                  onChange={(v) => setRepayAmt(clamp(v, maxRepay))}
                  onMax={() => setRepayAmt(String(maxRepay))}
                  maxLabel={`Owed ${formatUsd(position.debt)} · balance ${formatUsd(ctx.usdcBalance)}`}
                />
                <AfterPreview before={cur.hf} after={afterRepay} />
                {needUsdcApproval ? (
                  <>
                    <Button className="w-full" variant="outline" onClick={() => approveUsdc.approve(APPROVE_USDC)} disabled={busyOf(approveUsdc)}>
                      {busyOf(approveUsdc) ? "Approving…" : "Approve USDC"}
                    </Button>
                    <TxStatus {...approveUsdc} />
                  </>
                ) : (
                  <>
                    <Button
                      className="w-full bg-positive text-positive-foreground hover:opacity-90"
                      onClick={() => repayLoan.repay(position.id, repayAmt)}
                      disabled={busyOf(repayLoan) || !repayAmt || parseFloat(repayAmt) <= 0}
                    >
                      {busyOf(repayLoan) ? "Repaying…" : "Repay USDC"}
                    </Button>
                    <TxStatus {...repayLoan} />
                  </>
                )}
              </>
            )}
          </TabsContent>

          {/* Add collateral */}
          <TabsContent value="add" className="space-y-3">
            <FormRow
              unit="cirBTC"
              value={addAmt}
              onChange={(v) => setAddAmt(clamp(v, maxAdd))}
              onMax={() => setAddAmt(String(maxAdd))}
              maxLabel={`Wallet ${formatCirBtc(ctx.cirBtcBalance)} cirBTC`}
            />
            <AfterPreview before={cur.hf} after={afterAdd} />
            {needCirApproval ? (
              <>
                <Button className="w-full" variant="outline" onClick={() => approveCir.approve(APPROVE_CIRBTC)} disabled={busyOf(approveCir)}>
                  {busyOf(approveCir) ? "Approving…" : "Approve cirBTC"}
                </Button>
                <TxStatus {...approveCir} />
              </>
            ) : (
              <>
                <Button className="w-full" onClick={() => deposit.deposit(position.id, addAmt)} disabled={busyOf(deposit) || !addAmt || parseFloat(addAmt) <= 0}>
                  {busyOf(deposit) ? "Depositing…" : "Add cirBTC"}
                </Button>
                <TxStatus {...deposit} />
              </>
            )}
          </TabsContent>

          {/* Withdraw collateral */}
          <TabsContent value="withdraw" className="space-y-3">
            <FormRow
              unit="cirBTC"
              value={withdrawAmt}
              onChange={(v) => setWithdrawAmt(clamp(v, maxWithdraw))}
              onMax={() => setWithdrawAmt(String(maxWithdraw))}
              maxLabel={`Up to ${maxWithdraw.toLocaleString("en-US", { maximumFractionDigits: 8 })} cirBTC free`}
            />
            <AfterPreview before={cur.hf} after={afterWithdraw} />
            <Button className="w-full" variant="outline" onClick={() => withdraw.withdraw(position.id, withdrawAmt)} disabled={busyOf(withdraw) || !withdrawAmt || parseFloat(withdrawAmt) <= 0}>
              {busyOf(withdraw) ? "Withdrawing…" : "Withdraw cirBTC"}
            </Button>
            <TxStatus {...withdraw} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function FormRow({
  unit,
  value,
  onChange,
  onMax,
  maxLabel,
}: {
  unit: string;
  value: string;
  onChange: (v: string) => void;
  onMax: () => void;
  maxLabel: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Amount ({unit})</span>
        <button onClick={onMax} className="text-xs font-medium text-primary hover:underline">Max</button>
      </div>
      <Input type="number" inputMode="decimal" placeholder="0" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 font-mono" />
      <p className="mt-1 text-xs text-muted-foreground">{maxLabel}</p>
    </div>
  );
}
