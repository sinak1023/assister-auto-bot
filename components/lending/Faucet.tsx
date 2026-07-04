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

import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TxStatus } from "@/components/trading/TxStatus";
import { useMintUsdc, useMintCirBtc } from "@/hooks/lending/useLendingActions";
import { USE_MOCK_CIRBTC } from "@/lib/contracts/addresses";
import { formatUsdc, formatCirBtc } from "@/lib/format";

export function Faucet({
  usdcBalance,
  cirBtcBalance,
  onSuccess,
}: {
  usdcBalance: bigint | undefined;
  cirBtcBalance: bigint | undefined;
  onSuccess: () => void;
}) {
  const mintUsdc = useMintUsdc();
  const mintCirBtc = useMintCirBtc();

  useEffect(() => {
    if (mintUsdc.isSuccess) onSuccess();
  }, [mintUsdc.isSuccess, onSuccess]);
  useEffect(() => {
    if (mintCirBtc.isSuccess) onSuccess();
  }, [mintCirBtc.isSuccess, onSuccess]);

  const usdcBusy = mintUsdc.isPending || mintUsdc.isConfirming || mintUsdc.isSubmitted;
  const cirBusy = mintCirBtc.isPending || mintCirBtc.isConfirming || mintCirBtc.isSubmitted;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Test tokens
          <Badge variant="secondary">testnet faucet</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Fixed amounts, once every 24h per wallet. {USE_MOCK_CIRBTC ? "Demo cirBTC is claimable here." : "Real cirBTC comes from Circle's faucet."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">USDC balance</span>
            <span className="font-mono text-foreground">{formatUsdc(usdcBalance)}</span>
          </div>
          <Button className="w-full" variant="outline" onClick={() => mintUsdc.mint()} disabled={usdcBusy}>
            {usdcBusy ? "Claiming…" : "Claim 150 USDC"}
          </Button>
          <TxStatus {...mintUsdc} />
        </div>

        {USE_MOCK_CIRBTC && (
          <div>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">cirBTC balance</span>
              <span className="font-mono text-foreground">{formatCirBtc(cirBtcBalance)}</span>
            </div>
            <Button className="w-full" variant="outline" onClick={() => mintCirBtc.mint()} disabled={cirBusy}>
              {cirBusy ? "Claiming…" : "Claim 0.01 demo cirBTC"}
            </Button>
            <TxStatus {...mintCirBtc} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
