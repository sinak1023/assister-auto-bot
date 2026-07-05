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
import { isAddress, parseUnits, type Address } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TxStatus } from "@/components/trading/TxStatus";
import { useLendingState, type PositionDetails } from "@/hooks/lending/useLendingState";
import { useAtRiskPositions } from "@/hooks/lending/useAtRiskPositions";
import { useLiquidate, useApproveUsdc } from "@/hooks/lending/useLendingActions";
import { LOAN_DECIMALS } from "@/lib/contracts/addresses";
import { formatUsd, formatCirBtc, formatHF, hfToNumber, priceToNumber, bpsToPct } from "@/lib/format";

const APPROVE_USDC = parseUnits("100000000", LOAN_DECIMALS);

interface Market {
  price: bigint | undefined;
  priceDecimals: number | undefined;
  closeFactorBps: bigint | undefined;
  liquidationBonusBps: bigint | undefined;
}

export function LiquidationsView({
  connectedAddress,
  usdcBalance,
  usdcAllowance,
  price,
  priceDecimals,
  closeFactorBps,
  liquidationBonusBps,
  onSuccess,
}: {
  connectedAddress: Address | undefined;
  usdcBalance: bigint | undefined;
  usdcAllowance: bigint | undefined;
  price: bigint | undefined;
  priceDecimals: number | undefined;
  closeFactorBps: bigint | undefined;
  liquidationBonusBps: bigint | undefined;
  onSuccess: () => void;
}) {
  const market: Market = { price, priceDecimals, closeFactorBps, liquidationBonusBps };
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<Address | undefined>(undefined);

  // Auto feed of at-risk positions across all known borrowers.
  const feed = useAtRiskPositions();
  const liquidatableNow = feed.positions.filter((p) => p.liquidatable);
  const nearRisk = feed.positions.filter((p) => !p.liquidatable);

  const scan = useLendingState(target);
  const scanAtRisk = scan.positions.filter((p) => p.debt > 0n && hfToNumber(p.healthFactor) < 1);
  const scanOther = scan.positions.filter((p) => p.debt > 0n && hfToNumber(p.healthFactor) >= 1);

  return (
    <div className="space-y-4">
      {/* ── Auto feed ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">At-risk positions</CardTitle>
          <p className="text-xs text-muted-foreground">
            Positions closest to (or past) liquidation, most urgent first. Any position below health factor 1.0 can be
            liquidated by anyone — repay part of its USDC debt and receive its cirBTC plus a{" "}
            {bpsToPct(liquidationBonusBps).toFixed(0)}% bonus.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!feed.configured ? (
            <p className="text-xs text-muted-foreground">
              Auto-discovery needs Supabase (to list borrowers). Use the lookup below to check a specific address.
            </p>
          ) : feed.positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No positions are near liquidation right now.</p>
          ) : (
            <>
              {liquidatableNow.map((p) => (
                <LiquidatableRow
                  key={`${p.user}-${p.id}`}
                  user={p.user}
                  position={p}
                  {...market}
                  usdcBalance={usdcBalance}
                  usdcAllowance={usdcAllowance}
                  canAct={!!connectedAddress}
                  onSuccess={() => { feed && onSuccess(); }}
                />
              ))}
              {nearRisk.map((p) => (
                <MonitorRow key={`${p.user}-${p.id}`} user={p.user} id={p.id} debt={p.debt} collateral={p.collateral} hf={p.healthFactor} />
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Manual lookup ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Look up an address</CardTitle>
          <p className="text-xs text-muted-foreground">Check any borrower&apos;s positions directly.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Borrower address (0x…)" value={input} onChange={(e) => setInput(e.target.value.trim())} className="font-mono" />
            <Button onClick={() => isAddress(input) && setTarget(input as Address)} disabled={!isAddress(input)}>Scan</Button>
            {connectedAddress && (
              <Button variant="outline" onClick={() => { setInput(connectedAddress); setTarget(connectedAddress); }}>My positions</Button>
            )}
          </div>
          {input && !isAddress(input) && <p className="text-xs text-danger">That doesn&apos;t look like a valid address.</p>}
        </CardContent>
      </Card>

      {target && (
        <>
          {scanAtRisk.length === 0 && scanOther.length === 0 && (
            <p className="rounded-lg border border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
              No borrowing positions found for this address.
            </p>
          )}
          {scanAtRisk.map((p) => (
            <LiquidatableRow
              key={p.id}
              user={target}
              position={p}
              price={scan.price}
              priceDecimals={scan.priceDecimals}
              closeFactorBps={scan.closeFactorBps}
              liquidationBonusBps={scan.liquidationBonusBps}
              usdcBalance={usdcBalance}
              usdcAllowance={usdcAllowance}
              canAct={!!connectedAddress}
              onSuccess={() => { scan.refetch(); onSuccess(); }}
            />
          ))}
          {scanOther.map((p) => (
            <MonitorRow key={p.id} user={target} id={p.id} debt={p.debt} collateral={p.collateral} hf={p.healthFactor} healthy />
          ))}
        </>
      )}
    </div>
  );
}

// Compact read-only row for positions that are near-risk or healthy.
function MonitorRow({
  id,
  debt,
  collateral,
  hf,
  healthy,
}: {
  user: Address;
  id: number;
  debt: bigint;
  collateral: bigint;
  hf: bigint;
  healthy?: boolean;
}) {
  const n = hfToNumber(hf);
  const color = healthy || n >= 1.5 ? "var(--positive)" : n >= 1 ? "var(--caution)" : "var(--danger)";
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <p className="text-sm font-medium">Position #{id}</p>
          <p className="text-xs text-muted-foreground">Debt {formatUsd(debt)} · collateral {formatCirBtc(collateral)} cirBTC</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm" style={{ color }}>HF {formatHF(hf)}</p>
          <Badge variant="secondary">{healthy ? "Healthy" : "At risk"}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function LiquidatableRow({
  user,
  position,
  price,
  priceDecimals,
  closeFactorBps,
  liquidationBonusBps,
  usdcBalance,
  usdcAllowance,
  canAct,
  onSuccess,
}: {
  user: Address;
  position: Pick<PositionDetails, "id" | "collateral" | "debt" | "collateralValueLoan" | "healthFactor">;
  price: bigint | undefined;
  priceDecimals: number | undefined;
  closeFactorBps: bigint | undefined;
  liquidationBonusBps: bigint | undefined;
  usdcBalance: bigint | undefined;
  usdcAllowance: bigint | undefined;
  canAct: boolean;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const liquidate = useLiquidate();
  const approve = useApproveUsdc();

  useEffect(() => { if (liquidate.isSuccess) { setAmount(""); onSuccess(); } }, [liquidate.isSuccess, onSuccess]);
  useEffect(() => { if (approve.isSuccess) onSuccess(); }, [approve.isSuccess, onSuccess]);

  const debtUsd = Number(position.debt) / 10 ** LOAN_DECIMALS;
  const closeFactor = bpsToPct(closeFactorBps) / 100;
  const maxByClose = debtUsd * closeFactor;
  const walletUsd = usdcBalance !== undefined ? Number(usdcBalance) / 10 ** LOAN_DECIMALS : 0;
  const maxRepay = Math.max(0, Math.min(maxByClose, walletUsd));

  const amtN = parseFloat(amount) || 0;
  const priceN = priceToNumber(price, priceDecimals);
  const bonus = bpsToPct(liquidationBonusBps) / 100;
  const seizeCir = Number.isFinite(priceN) && priceN > 0 ? (amtN * (1 + bonus)) / priceN : 0;

  const amtBig = amount ? parseUnits(amount, LOAN_DECIMALS) : 0n;
  const needApproval = usdcAllowance !== undefined && amtBig > 0n && amtBig > usdcAllowance;
  const busy = liquidate.isPending || liquidate.isConfirming || liquidate.isSubmitted;
  const approveBusy = approve.isPending || approve.isConfirming || approve.isSubmitted;

  return (
    <Card className="border-danger/40">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            Position #{position.id}
            <Badge className="border-danger/40 bg-danger/15 text-danger">Liquidatable</Badge>
          </CardTitle>
          <span className="font-mono text-sm font-semibold text-danger">HF {formatHF(position.healthFactor)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Debt {formatUsd(position.debt)} · collateral {formatCirBtc(position.collateral)} cirBTC ({formatUsd(position.collateralValueLoan)})
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!canAct ? (
          <p className="text-xs text-muted-foreground">Connect a wallet to liquidate this position.</p>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Repay (USDC)</span>
                <button onClick={() => setAmount(String(maxRepay))} className="text-xs font-medium text-primary hover:underline">Max</button>
              </div>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  setAmount(!Number.isNaN(n) && n > maxRepay ? String(maxRepay) : e.target.value);
                }}
                className="mt-1 font-mono"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Up to {formatUsd(BigInt(Math.round(maxByClose * 1e8)))} (close factor) · your balance {formatUsd(usdcBalance)}
              </p>
            </div>
            {amtN > 0 && (
              <p className="text-xs text-muted-foreground">
                You receive ≈ <span className="font-mono text-gold">{seizeCir.toLocaleString("en-US", { maximumFractionDigits: 8 })} cirBTC</span> (repay + {(bonus * 100).toFixed(0)}% bonus)
              </p>
            )}
            {needApproval ? (
              <>
                <Button className="w-full" variant="outline" onClick={() => approve.approve(APPROVE_USDC)} disabled={approveBusy}>
                  {approveBusy ? "Approving…" : "Approve USDC"}
                </Button>
                <TxStatus {...approve} />
              </>
            ) : (
              <>
                <Button
                  className="w-full bg-danger text-danger-foreground hover:opacity-90"
                  onClick={() => liquidate.liquidate(user, position.id, amount)}
                  disabled={busy || !amount || amtN <= 0}
                >
                  {busy ? "Liquidating…" : "Liquidate"}
                </Button>
                <TxStatus {...liquidate} />
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
