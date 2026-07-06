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

import { useSyncExternalStore } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TransactionHistory } from "@/components/transactions/TransactionHistory";
import { useWallet } from "@/contexts/WalletContext";
import { useLendingState } from "@/hooks/lending/useLendingState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/lending/StatCard";
import { PricePanel } from "@/components/lending/PricePanel";
import { PositionCard } from "@/components/lending/PositionCard";
import { OpenPositionCard } from "@/components/lending/OpenPositionCard";
import { TreasuryDashboard } from "@/components/lending/TreasuryDashboard";
import { SupplyPanel } from "@/components/lending/SupplyPanel";
import { RateCurve } from "@/components/lending/RateCurve";
import { CreditTab } from "@/components/lending/CreditTab";
import { LiquidationsView } from "@/components/lending/LiquidationsView";
import { LENDING_ADDRESS } from "@/lib/contracts/addresses";
import { formatPrice, compactUsd, formatRatePct } from "@/lib/format";

function Ticker({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-lg font-semibold" style={accent ? { color: accent } : undefined}>{value}</p>
    </div>
  );
}

const ZERO = "0x0000000000000000000000000000000000000000";

export default function LendingPage() {
  const { address, isConnected, isWrongChain, switchToArc, isSwitchingChain } = useWallet();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const connected = mounted && isConnected;

  const s = useLendingState(connected ? address : undefined);
  const notDeployed = LENDING_ADDRESS === ZERO;

  // Positions that were opened but are no longer active = fully repaid or fully
  // liquidated. Their details can't be read (the contract guards inactive reads),
  // so we derive their ids from the total count minus the active ones.
  const activeIds = new Set(s.positions.map((p) => p.id));
  const closedIds = Array.from({ length: s.positionCount }, (_, i) => i).filter((i) => !activeIds.has(i));

  const ctx = {
    price: s.price,
    priceDecimals: s.priceDecimals,
    effectiveCollateralFactorBps: s.effectiveCollateralFactorBps,
    liquidationThresholdBps: s.liquidationThresholdBps,
    cirBtcBalance: s.cirBtcBalance,
    cirBtcAllowance: s.cirBtcAllowance,
    usdcBalance: s.usdcBalance,
    usdcAllowance: s.usdcAllowance,
    poolLiquidity: s.poolLiquidity,
  };

  return (
    <div className="container mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
      {/* Hero */}
      <header className="mb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Institutional lending · Arc Testnet
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">LendArc</h1>
        <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
          Lendarc is a lending protocol on Arc allowing users to borrow USDC against cirBTC.
        </p>

        {/* Live market ticker (hairline grid) */}
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/[0.06] sm:grid-cols-4">
          <Ticker label="cirBTC / USD" value={formatPrice(s.price, s.priceDecimals)} accent="var(--gold)" />
          <Ticker label="Total supplied" value={compactUsd(s.totalSupplied)} />
          <Ticker label="Borrow APR" value={formatRatePct(s.borrowAPR)} accent="var(--primary)" />
          <Ticker
            label="Utilization"
            value={s.utilization !== undefined ? `${((Number(s.utilization) / 1e18) * 100).toFixed(1)}%` : "—"}
          />
        </div>
      </header>

      {connected && isWrongChain && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-caution/30 bg-caution/10 px-4 py-3 text-sm text-caution">
          <span>
            <span className="font-medium">Wrong network.</span> Switch your wallet to Arc Testnet (chain id 5042002) to transact.
          </span>
          <button
            onClick={switchToArc}
            disabled={isSwitchingChain}
            className="rounded-md bg-caution px-3 py-1.5 text-xs font-semibold text-caution-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSwitchingChain ? "Switching…" : "Switch to Arc"}
          </button>
        </div>
      )}

      {notDeployed && (
        <div className="mb-6 rounded-lg border border-caution/30 bg-caution/10 px-4 py-3 text-sm text-caution">
          <p className="font-medium">Contracts not deployed yet</p>
          <p className="mt-0.5 opacity-90">
            Run <code className="rounded bg-caution/20 px-1 font-mono">npm run deploy:lending</code>, then restart the dev server.
          </p>
        </div>
      )}

      <Tabs defaultValue="portfolio">
        <TabsList className="mb-5">
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="earn">Earn</TabsTrigger>
          <TabsTrigger value="markets">Markets</TabsTrigger>
          <TabsTrigger value="liquidations">Liquidations</TabsTrigger>
          <TabsTrigger value="credit">Credit</TabsTrigger>
        </TabsList>

        {/* Portfolio */}
        <TabsContent value="portfolio" className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <PricePanel price={s.price} priceDecimals={s.priceDecimals} onSuccess={s.refetch} />
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Total Lend - Borrow</CardTitle>
                <p className="text-xs text-muted-foreground">Across all users on this market.</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Total Lend" value={compactUsd(s.poolLiquidity)} sub="Available to borrow" accent="var(--positive)" />
                  <StatCard label="Total Borrow" value={compactUsd(s.totalBorrows)} sub="Currently borrowed" accent="var(--primary)" />
                </div>
              </CardContent>
            </Card>
          </div>

          {connected && (
            <>
              {/* Active positions and the open-position card share one grid, so a
                  single position sits next to "Open" with no empty placeholder. */}
              <div className="grid items-start gap-4 lg:grid-cols-2">
                {s.positions.map((p) => (
                  <PositionCard key={p.id} position={p} ctx={ctx} onSuccess={s.refetch} />
                ))}
                <OpenPositionCard
                  cirBtcBalance={s.cirBtcBalance}
                  cirBtcAllowance={s.cirBtcAllowance}
                  price={s.price}
                  priceDecimals={s.priceDecimals}
                  effectiveCollateralFactorBps={s.effectiveCollateralFactorBps}
                  onSuccess={s.refetch}
                />
              </div>

              {closedIds.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Closed Positions</CardTitle>
                    <p className="text-xs text-muted-foreground">Fully repaid or fully liquidated.</p>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {closedIds.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-xs">
                        Position #{id}
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">Closed</Badge>
                      </span>
                    ))}
                  </CardContent>
                </Card>
              )}

              {address && <TransactionHistory wallet={address} />}
            </>
          )}
        </TabsContent>

        {/* Earn (supply side) */}
        <TabsContent value="earn">
          <SupplyPanel
            usdcBalance={s.usdcBalance}
            usdcAllowance={s.usdcAllowance}
            supplyBalance={s.supplyBalance}
            totalSupplied={s.totalSupplied}
            supplyAPY={s.supplyAPY}
            connected={connected}
            onSuccess={s.refetch}
          />
        </TabsContent>

        {/* Markets */}
        <TabsContent value="markets" className="space-y-4">
          <TreasuryDashboard
            poolLiquidity={s.poolLiquidity}
            totalBorrows={s.totalBorrows}
            utilization={s.utilization}
            borrowAPR={s.borrowAPR}
            supplyAPY={s.supplyAPY}
            totalCollateralValue={s.totalCollateralValue}
            totalDebt={s.totalDebt}
            accountHealthFactor={s.accountHealthFactor}
            connected={connected}
          />
          <RateCurve
            baseRatePerYear={s.baseRatePerYear}
            slope1={s.slope1}
            slope2={s.slope2}
            kink={s.kink}
            utilization={s.utilization}
            borrowAPR={s.borrowAPR}
            supplyAPY={s.supplyAPY}
          />
        </TabsContent>

        {/* Liquidations */}
        <TabsContent value="liquidations">
          <LiquidationsView
            connectedAddress={connected ? address : undefined}
            usdcBalance={s.usdcBalance}
            usdcAllowance={s.usdcAllowance}
            price={s.price}
            priceDecimals={s.priceDecimals}
            closeFactorBps={s.closeFactorBps}
            liquidationBonusBps={s.liquidationBonusBps}
            onSuccess={s.refetch}
          />
        </TabsContent>

        {/* Credit */}
        <TabsContent value="credit">
          {connected ? (
            <CreditTab
              creditScore={s.creditScore}
              credit={s.credit}
              collateralFactorBps={s.collateralFactorBps}
              maxCollateralFactorBps={s.maxCollateralFactorBps}
              effectiveCollateralFactorBps={s.effectiveCollateralFactorBps}
            />
          ) : (
            <div className="rounded-lg border border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              Connect your wallet to see your on-chain credit score.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
