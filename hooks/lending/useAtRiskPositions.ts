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

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { type Abi, type Address, maxUint256 } from "viem";
import { LENDING_ABI } from "@/lib/contracts/abis/lending";
import { LENDING_ADDRESS } from "@/lib/contracts/addresses";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { listBorrowers } from "@/lib/supabase/transactions";

const ZERO = "0x0000000000000000000000000000000000000000";
// Show positions at or below this HF ("near liquidation"); liquidatable = HF < 1.
const AT_RISK_HF = 1.25;

export interface AtRiskPosition {
  user: Address;
  id: number;
  collateral: bigint;
  debt: bigint;
  collateralValueLoan: bigint;
  healthFactor: bigint;
  hf: number;
  liquidatable: boolean;
}

function hfNum(x: bigint): number {
  if (x >= maxUint256 / 2n) return Infinity;
  return Number(x) / 1e18;
}

/**
 * Automatically surfaces at-risk positions across all known borrowers, sorted
 * most-at-risk first. Borrower discovery comes from Supabase history (there's no
 * on-chain enumeration); the rest is read live from the contract.
 */
export function useAtRiskPositions() {
  const lending = { address: LENDING_ADDRESS, abi: LENDING_ABI as Abi } as const;
  const deployed = LENDING_ADDRESS !== ZERO;
  const configured = isSupabaseConfigured();

  const { data: borrowers = [] } = useQuery({
    queryKey: ["borrowers"],
    queryFn: () => listBorrowers(40),
    enabled: configured,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Position count per borrower.
  const countRead = useReadContracts({
    contracts: borrowers.map((b) => ({ ...lending, functionName: "positionCount", args: [b as Address] })),
    query: { enabled: deployed && borrowers.length > 0, refetchInterval: 15_000, placeholderData: keepPreviousData },
  });

  // Expand to (borrower, positionId) pairs.
  const pairs = useMemo(() => {
    const out: { user: Address; id: number }[] = [];
    borrowers.forEach((b, i) => {
      const count = Number((countRead.data?.[i]?.result as bigint | undefined) ?? 0n);
      for (let j = 0; j < count; j++) out.push({ user: b as Address, id: j });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowers, countRead.data]);

  const detailRead = useReadContracts({
    contracts: pairs.map((p) => ({ ...lending, functionName: "getPositionDetails", args: [p.user, BigInt(p.id)] })),
    query: { enabled: deployed && pairs.length > 0, refetchInterval: 15_000, placeholderData: keepPreviousData },
  });

  const positions: AtRiskPosition[] = useMemo(() => {
    if (!detailRead.data) return [];
    const rows: AtRiskPosition[] = [];
    pairs.forEach((p, i) => {
      const r = detailRead.data?.[i]?.result as
        | readonly [bigint, bigint, bigint, bigint, bigint, boolean]
        | undefined;
      if (!r) return;
      const [collateral, debt, collateralValueLoan, healthFactor, , active] = r;
      if (!active || debt <= 0n) return;
      const hf = hfNum(healthFactor);
      if (hf >= AT_RISK_HF) return;
      rows.push({ user: p.user, id: p.id, collateral, debt, collateralValueLoan, healthFactor, hf, liquidatable: hf < 1 });
    });
    return rows.sort((a, b) => a.hf - b.hf); // most at-risk first
  }, [pairs, detailRead.data]);

  return {
    configured,
    isLoading: countRead.isLoading || detailRead.isLoading,
    borrowerCount: borrowers.length,
    positions,
  };
}
