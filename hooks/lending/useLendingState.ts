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

import { useCallback, useMemo, useRef } from "react";
import { useReadContracts } from "wagmi";
import { keepPreviousData } from "@tanstack/react-query";
import { type Abi, type Address } from "viem";
import { LENDING_ABI } from "@/lib/contracts/abis/lending";
import { ORACLE_ABI } from "@/lib/contracts/abis/oracle";
import { FAUCET_ABI } from "@/lib/contracts/abis/faucet";
import { ERC20_ABI } from "@/lib/contracts/abis/erc20";
import {
  LENDING_ADDRESS,
  ORACLE_ADDRESS,
  FAUCET_ADDRESS,
  USDC_ADDRESS,
  CIRBTC_ADDRESS,
} from "@/lib/contracts/addresses";

const ZERO = "0x0000000000000000000000000000000000000000";

export interface PositionDetails {
  id: number;
  collateral: bigint;
  debt: bigint;
  collateralValueLoan: bigint;
  healthFactor: bigint;
  maxAdditionalBorrow: bigint;
  active: boolean;
}

export interface CreditData {
  loansFullyRepaid: bigint;
  totalRepaidVolume: bigint;
  liquidations: bigint;
  loansOpened: bigint;
}

// Public-RPC-friendly cadence: fast enough that the gauge feels live, gentle
// enough to avoid tripping the public endpoint's rate limit. Callers also
// refetch() immediately after their own actions and after a price change.
const REFETCH_INTERVAL = 12_000;

export function useLendingState(userAddress: Address | undefined) {
  // ABIs typed as `Abi` (not the full literal): the V2 ABI is large enough that
  // wagmi's deep result-type inference over many contracts hits "type
  // instantiation is excessively deep". Results are cast explicitly below.
  const lending = { address: LENDING_ADDRESS, abi: LENDING_ABI as Abi } as const;
  const oracle = { address: ORACLE_ADDRESS, abi: ORACLE_ABI as Abi } as const;
  const faucet = { address: FAUCET_ADDRESS, abi: FAUCET_ABI as Abi } as const;
  const deployed = LENDING_ADDRESS !== ZERO;
  const faucetDeployed = FAUCET_ADDRESS !== ZERO;

  // ── Market-wide + (optional) per-user aggregate reads (all on the lending contract) ──
  const marketRead = useReadContracts({
    contracts: [
      { ...lending, functionName: "collateralFactorBps" },
      { ...lending, functionName: "maxCollateralFactorBps" },
      { ...lending, functionName: "liquidationThresholdBps" },
      { ...lending, functionName: "liquidationBonusBps" },
      { ...lending, functionName: "closeFactorBps" },
      { ...lending, functionName: "poolLiquidity" },
      { ...lending, functionName: "totalBorrows" },
      { ...lending, functionName: "utilization" },
      { ...lending, functionName: "borrowAPR" },
      { ...lending, functionName: "supplyAPY" },
      { ...lending, functionName: "baseRatePerYear" },
      { ...lending, functionName: "slope1" },
      { ...lending, functionName: "slope2" },
      { ...lending, functionName: "kink" },
      ...(userAddress
        ? [
            { ...lending, functionName: "positionCount", args: [userAddress] },
            { ...lending, functionName: "creditScore", args: [userAddress] },
            { ...lending, functionName: "effectiveCollateralFactorBps", args: [userAddress] },
            { ...lending, functionName: "credit", args: [userAddress] },
            { ...lending, functionName: "accountSummary", args: [userAddress] },
            { ...lending, functionName: "accountHealthFactor", args: [userAddress] },
          ]
        : []),
    ],
    query: { enabled: deployed, refetchInterval: REFETCH_INTERVAL, placeholderData: keepPreviousData },
  });

  // ── Oracle reads (separate call: different ABI) ──
  const oracleRead = useReadContracts({
    contracts: [
      { ...oracle, functionName: "getPrice" },
      { ...oracle, functionName: "decimals" },
    ],
    query: { enabled: ORACLE_ADDRESS !== ZERO, refetchInterval: REFETCH_INTERVAL, placeholderData: keepPreviousData },
  });

  const d = marketRead.data;

  // Position count is "sticky": if a single call in the batch transiently fails
  // (common on the public RPC), the raw read is undefined — falling back to 0
  // would disable the position read and make ALL positions vanish. We keep the
  // last known count per address instead, so positions don't flicker away.
  const rawCount = userAddress ? (d?.[14]?.result as bigint | undefined) : undefined;
  const stickyCount = useRef<{ addr: Address | undefined; count: number }>({ addr: undefined, count: 0 });
  if (stickyCount.current.addr !== userAddress) {
    stickyCount.current = { addr: userAddress, count: rawCount !== undefined ? Number(rawCount) : 0 };
  } else if (rawCount !== undefined) {
    stickyCount.current.count = Number(rawCount);
  }
  const positionCount = userAddress ? stickyCount.current.count : 0;

  // ── Per-position details (depends on positionCount) ──
  const positionRead = useReadContracts({
    contracts:
      userAddress && positionCount > 0
        ? Array.from({ length: positionCount }, (_, i) => ({
            ...lending,
            functionName: "getPositionDetails",
            args: [userAddress, BigInt(i)],
          }))
        : [],
    query: { enabled: deployed && positionCount > 0, refetchInterval: REFETCH_INTERVAL, placeholderData: keepPreviousData },
  });

  // ── Token balances + allowances ──
  const tokenRead = useReadContracts({
    contracts: userAddress
      ? [
          { address: CIRBTC_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: [userAddress] },
          { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: [userAddress] },
          { address: CIRBTC_ADDRESS, abi: ERC20_ABI, functionName: "allowance", args: [userAddress, LENDING_ADDRESS] },
          { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "allowance", args: [userAddress, LENDING_ADDRESS] },
        ]
      : [],
    query: { enabled: deployed && !!userAddress, refetchInterval: REFETCH_INTERVAL, placeholderData: keepPreviousData },
  });

  // ── Supply side (separate call to keep the market read's indices stable) ──
  const supplyRead = useReadContracts({
    contracts: [
      { ...lending, functionName: "totalSupplied" },
      { ...lending, functionName: "totalReserves" },
      { ...lending, functionName: "supplyAPY" },
      ...(userAddress ? [{ ...lending, functionName: "supplyBalanceOf", args: [userAddress] }] : []),
    ],
    query: { enabled: deployed, refetchInterval: REFETCH_INTERVAL, placeholderData: keepPreviousData },
  });

  // ── Faucet cooldowns (separate ABI) ──
  const faucetRead = useReadContracts({
    contracts:
      userAddress && faucetDeployed
        ? [
            { ...faucet, functionName: "claimableIn", args: [USDC_ADDRESS, userAddress] },
            { ...faucet, functionName: "claimableIn", args: [CIRBTC_ADDRESS, userAddress] },
          ]
        : [],
    query: { enabled: faucetDeployed && !!userAddress, refetchInterval: REFETCH_INTERVAL, placeholderData: keepPreviousData },
  });

  const positions: PositionDetails[] = useMemo(() => {
    if (!positionRead.data) return [];
    return positionRead.data
      .map((r, i) => {
        const res = r.result as
          | readonly [bigint, bigint, bigint, bigint, bigint, boolean]
          | undefined;
        if (!res) return null;
        return {
          id: i,
          collateral: res[0],
          debt: res[1],
          collateralValueLoan: res[2],
          healthFactor: res[3],
          maxAdditionalBorrow: res[4],
          active: res[5],
        } satisfies PositionDetails;
      })
      .filter((p): p is PositionDetails => p !== null && p.active);
  }, [positionRead.data]);

  const creditRaw = userAddress
    ? (d?.[17]?.result as readonly [bigint, bigint, bigint, bigint] | undefined)
    : undefined;
  const summaryRaw = userAddress
    ? (d?.[18]?.result as readonly [bigint, bigint, bigint] | undefined)
    : undefined;

  const refetch = useCallback(() => {
    marketRead.refetch();
    oracleRead.refetch();
    positionRead.refetch();
    tokenRead.refetch();
    supplyRead.refetch();
    faucetRead.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketRead.refetch, oracleRead.refetch, positionRead.refetch, tokenRead.refetch, supplyRead.refetch, faucetRead.refetch]);

  return {
    deployed,
    isLoading: marketRead.isLoading,
    refetch,

    // Market
    collateralFactorBps: d?.[0]?.result as bigint | undefined,
    maxCollateralFactorBps: d?.[1]?.result as bigint | undefined,
    liquidationThresholdBps: d?.[2]?.result as bigint | undefined,
    liquidationBonusBps: d?.[3]?.result as bigint | undefined,
    closeFactorBps: d?.[4]?.result as bigint | undefined,
    poolLiquidity: d?.[5]?.result as bigint | undefined,
    totalBorrows: d?.[6]?.result as bigint | undefined,
    utilization: d?.[7]?.result as bigint | undefined,
    borrowAPR: d?.[8]?.result as bigint | undefined,
    supplyAPY: d?.[9]?.result as bigint | undefined,
    baseRatePerYear: d?.[10]?.result as bigint | undefined,
    slope1: d?.[11]?.result as bigint | undefined,
    slope2: d?.[12]?.result as bigint | undefined,
    kink: d?.[13]?.result as bigint | undefined,

    // Oracle
    price: oracleRead.data?.[0]?.result as bigint | undefined,
    priceDecimals: oracleRead.data?.[1]?.result as number | undefined,

    // User
    positionCount,
    creditScore: userAddress ? (d?.[15]?.result as bigint | undefined) : undefined,
    effectiveCollateralFactorBps: userAddress ? (d?.[16]?.result as bigint | undefined) : undefined,
    credit: creditRaw
      ? {
          loansFullyRepaid: creditRaw[0],
          totalRepaidVolume: creditRaw[1],
          liquidations: creditRaw[2],
          loansOpened: creditRaw[3],
        }
      : undefined,
    totalCollateral: summaryRaw?.[0],
    totalDebt: summaryRaw?.[1],
    totalCollateralValue: summaryRaw?.[2],
    accountHealthFactor: userAddress ? (d?.[19]?.result as bigint | undefined) : undefined,

    positions,

    // Tokens
    cirBtcBalance: tokenRead.data?.[0]?.result as bigint | undefined,
    usdcBalance: tokenRead.data?.[1]?.result as bigint | undefined,
    cirBtcAllowance: tokenRead.data?.[2]?.result as bigint | undefined,
    usdcAllowance: tokenRead.data?.[3]?.result as bigint | undefined,

    // Supply side
    totalSupplied: supplyRead.data?.[0]?.result as bigint | undefined,
    totalReserves: supplyRead.data?.[1]?.result as bigint | undefined,
    supplyAPYValue: supplyRead.data?.[2]?.result as bigint | undefined,
    supplyBalance: userAddress ? (supplyRead.data?.[3]?.result as bigint | undefined) : undefined,

    // Faucet cooldowns (seconds until claimable; 0 = now)
    usdcClaimableIn: userAddress ? (faucetRead.data?.[0]?.result as bigint | undefined) : undefined,
    cirBtcClaimableIn: userAddress ? (faucetRead.data?.[1]?.result as bigint | undefined) : undefined,
  };
}
