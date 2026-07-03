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
import { PricePanel } from "@/components/lending/PricePanel";
import { Faucet } from "@/components/lending/Faucet";
import { PositionCard } from "@/components/lending/PositionCard";
import { OpenPositionCard } from "@/components/lending/OpenPositionCard";
import { TreasuryDashboard } from "@/components/lending/TreasuryDashboard";
import { RateCurve } from "@/components/lending/RateCurve";
import { CreditTab } from "@/components/lending/CreditTab";
import { LiquidationsView } from "@/components/lending/LiquidationsView";
import { LENDING_ADDRESS } from "@/lib/contracts/addresses";
import { formatPrice } from "@/lib/format";

const ZERO = "0x0000000000000000000000000000000000000000";

export default function LendingPage() {
  const { address, isConnected } = useWallet();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const connected = mounted && isConnected;

  const s = useLendingState(connected ? address : undefined);
  const notDeployed = LENDING_ADDRESS === ZERO;

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
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Arc Vault</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Borrow USDC against cirBTC on Arc — with live risk, dynamic rates, and on-chain credit.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">cirBTC / USD</p>
          <p className="font-mono text-lg font-semibold text-gold">{formatPrice(s.price, s.priceDecimals)}</p>
        </div>
      </div>

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
          <TabsTrigger value="markets">Markets</TabsTrigger>
          <TabsTrigger value="liquidations">Liquidations</TabsTrigger>
          <TabsTrigger value="credit">Credit</TabsTrigger>
        </TabsList>

        {/* Portfolio */}
        <TabsContent value="portfolio" className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <PricePanel price={s.price} priceDecimals={s.priceDecimals} onSuccess={s.refetch} />
            {connected ? (
              <Faucet usdcBalance={s.usdcBalance} cirBtcBalance={s.cirBtcBalance} onSuccess={s.refetch} />
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
                Connect your wallet to mint test tokens and open positions.
              </div>
            )}
          </div>

          {connected && (
            <>
              {s.positions.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                  {s.positions.map((p) => (
                    <PositionCard key={p.id} position={p} ctx={ctx} onSuccess={s.refetch} />
                  ))}
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <OpenPositionCard
                  cirBtcBalance={s.cirBtcBalance}
                  cirBtcAllowance={s.cirBtcAllowance}
                  price={s.price}
                  priceDecimals={s.priceDecimals}
                  effectiveCollateralFactorBps={s.effectiveCollateralFactorBps}
                  onSuccess={s.refetch}
                />
                {s.positions.length === 0 && (
                  <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
                    No open positions yet. Deposit cirBTC to open your first one.
                  </div>
                )}
              </div>

              {address && <TransactionHistory wallet={address} />}
            </>
          )}
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
