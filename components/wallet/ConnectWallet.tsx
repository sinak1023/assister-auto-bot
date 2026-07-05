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

import { useEffect, useSyncExternalStore } from "react";
import { useReadContract, useReadContracts, useAccount } from "wagmi";
import { formatUnits } from "viem";
import { LIVE_STATE_REFETCH_INTERVAL } from "@/lib/wagmi";
import { useWallet } from "@/contexts/WalletContext";
import { useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CIRBTC_ADDRESS,
  USDC_ADDRESS,
  FAUCET_ADDRESS,
  ERC20_ABI,
  COLLATERAL_DECIMALS,
  LOAN_DECIMALS,
  USE_MOCK_CIRBTC,
} from "@/lib/contracts";
import { FAUCET_ABI } from "@/lib/contracts/abis/faucet";
import { useMintUsdc, useMintCirBtc } from "@/hooks/lending";
import { CopyableText } from "./CopyableText";
import { ConnectDialog } from "./ConnectDialog";

const ZERO = "0x0000000000000000000000000000000000000000";

function fmtBalance(value: bigint, decimals: number, maxFractionDigits: number): string {
  if (value === 0n) return "0";
  return parseFloat(formatUnits(value, decimals)).toLocaleString("en-US", {
    maximumFractionDigits: maxFractionDigits,
  });
}

export function ConnectWallet() {
  const { address, isConnected, walletType, disconnect, isWrongChain, switchToArc, isSwitchingChain } = useWallet();
  const { connector } = useAccount();
  const mounted = useSyncExternalStore(() => () => { }, () => true, () => false);
  const queryClient = useQueryClient();

  const balanceQuery = (token: `0x${string}`) => ({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf" as const,
    args: address ? ([address] as const) : undefined,
    query: {
      enabled: !!address && token !== ZERO,
      refetchInterval: LIVE_STATE_REFETCH_INTERVAL,
      refetchIntervalInBackground: false,
      placeholderData: keepPreviousData,
    },
  });

  const { data: cirBtcBalance, isLoading: isCirBtcLoading } = useReadContract(balanceQuery(CIRBTC_ADDRESS));
  const { data: usdcBalance, isLoading: isUsdcLoading } = useReadContract(balanceQuery(USDC_ADDRESS));

  // Faucet cooldowns — 0 means claimable now, >0 means recently claimed.
  const { data: cooldowns } = useReadContracts({
    contracts: address
      ? [
          { address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "claimableIn", args: [USDC_ADDRESS, address] },
          { address: FAUCET_ADDRESS, abi: FAUCET_ABI, functionName: "claimableIn", args: [CIRBTC_ADDRESS, address] },
        ]
      : [],
    query: {
      enabled: !!address && FAUCET_ADDRESS !== ZERO,
      refetchInterval: LIVE_STATE_REFETCH_INTERVAL,
      placeholderData: keepPreviousData,
    },
  });
  const usdcCooldown = (cooldowns?.[0]?.result as bigint | undefined) ?? 0n;
  const cirBtcCooldown = (cooldowns?.[1]?.result as bigint | undefined) ?? 0n;

  const mintUsdc = useMintUsdc();
  const mintCirBtc = useMintCirBtc();

  useEffect(() => {
    if (mintUsdc.isSuccess || mintCirBtc.isSuccess) {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "readContract" || q.queryKey[0] === "readContracts" });
    }
  }, [mintUsdc.isSuccess, mintCirBtc.isSuccess, queryClient]);

  if (!mounted) return null;
  if (!isConnected) return <ConnectDialog />;

  const cirBtcFmt = cirBtcBalance !== undefined ? fmtBalance(cirBtcBalance as bigint, COLLATERAL_DECIMALS, 8) : null;
  const usdcFmt = usdcBalance !== undefined ? fmtBalance(usdcBalance as bigint, LOAN_DECIMALS, 2) : null;

  // Real connector name (MetaMask, Rabby, OKX, …); "Passkey" for Circle.
  const walletLabel = walletType === "circle" ? "Passkey" : connector?.name ?? "Wallet";

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:justify-end sm:gap-3">
      <span className="inline-flex items-center">
        <span className="mr-1 text-muted-foreground">cirBTC:</span>
        {isCirBtcLoading && cirBtcFmt === null ? (
          <Skeleton className="inline-block h-4 w-16 align-middle" />
        ) : (
          <span className="font-mono font-medium">{cirBtcFmt ?? "0"}</span>
        )}
        {USE_MOCK_CIRBTC && (
          <FaucetChip
            onClaim={() => mintCirBtc.mint()}
            busy={mintCirBtc.isPending || mintCirBtc.isConfirming || mintCirBtc.isSubmitted}
            claimed={cirBtcCooldown > 0n || mintCirBtc.isSuccess}
            error={!!mintCirBtc.error}
          />
        )}
      </span>

      <span className="hidden text-muted-foreground/40 sm:inline">|</span>
      <span className="inline-flex items-center">
        <span className="mr-1 text-muted-foreground">USDC:</span>
        {isUsdcLoading && usdcFmt === null ? (
          <Skeleton className="inline-block h-4 w-16 align-middle" />
        ) : (
          <span className="font-mono font-medium">{usdcFmt ?? "0"}</span>
        )}
        <FaucetChip
          onClaim={() => mintUsdc.mint()}
          busy={mintUsdc.isPending || mintUsdc.isConfirming || mintUsdc.isSubmitted}
          claimed={usdcCooldown > 0n || mintUsdc.isSuccess}
          error={!!mintUsdc.error}
        />
      </span>

      <span className="hidden text-muted-foreground/40 sm:inline">|</span>
      <span>
        <CopyableText value={address!}>
          <code className="font-mono text-sm">
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </code>
        </CopyableText>
        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{walletLabel}</span>
      </span>

      {isWrongChain && (
        <>
          <span className="hidden text-muted-foreground/40 sm:inline">|</span>
          <Button size="sm" onClick={switchToArc} disabled={isSwitchingChain} className="bg-caution text-caution-foreground hover:opacity-90">
            {isSwitchingChain ? "Switching…" : "Switch to Arc"}
          </Button>
        </>
      )}
      <Button variant="outline" size="sm" onClick={disconnect}>
        Disconnect
      </Button>
    </div>
  );
}

// A compact faucet button that flips to "Claimed" (disabled) once claimed until
// the 24h cooldown elapses.
function FaucetChip({
  onClaim,
  busy,
  claimed,
  error,
}: {
  onClaim: () => void;
  busy: boolean;
  claimed: boolean;
  error: boolean;
}) {
  const label = busy ? "Claiming…" : error ? "Failed" : claimed ? "Claimed" : "Faucet";
  const tone = error
    ? "bg-danger/15 text-danger hover:bg-danger/25"
    : claimed
      ? "bg-muted text-muted-foreground"
      : "bg-positive/15 text-positive hover:bg-positive/25";
  return (
    <button
      onClick={onClaim}
      disabled={busy || claimed}
      title={claimed ? "Already claimed — try again in 24h" : "Claim test tokens"}
      className={`ml-1.5 rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${tone}`}
    >
      {label}
    </button>
  );
}
