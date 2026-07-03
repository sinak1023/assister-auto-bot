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

import { useEffect, useRef } from "react";
import { parseUnits, type Address } from "viem";
import { useContractWrite } from "@/hooks/useContractWrite";
import { ERC20_ABI, TESTNET_ERC20_ABI, LENDING_ABI } from "@/lib/contracts";
import { ORACLE_ABI } from "@/lib/contracts/abis/oracle";
import {
  LENDING_ADDRESS,
  ORACLE_ADDRESS,
  USDC_ADDRESS,
  CIRBTC_ADDRESS,
  COLLATERAL_DECIMALS,
  LOAN_DECIMALS,
} from "@/lib/contracts/addresses";
import { useWallet } from "@/contexts/WalletContext";
import { useLogTransaction } from "@/hooks/useTransactions";
import type { TxAction, TxToken } from "@/lib/supabase/transactions";

interface PendingLog {
  action: TxAction;
  token: TxToken;
  amountRaw: bigint;
  amountFormatted: string;
}

// Log to Supabase once a write confirms. Shared by every action hook.
function useLogOnConfirm(
  isSuccess: boolean,
  hash: `0x${string}` | undefined,
  pending: { current: PendingLog | null },
) {
  const { address } = useWallet();
  const { mutate } = useLogTransaction();
  const loggedHash = useRef<string | null>(null);

  useEffect(() => {
    if (!isSuccess || !hash || !address || !pending.current) return;
    if (loggedHash.current === hash) return;
    loggedHash.current = hash;
    const p = pending.current;
    mutate({
      tx_hash: hash,
      wallet_address: address,
      action: p.action,
      token: p.token,
      amount: p.amountRaw.toString(),
      amount_formatted: p.amountFormatted,
    });
  }, [isSuccess, hash, address, mutate, pending]);
}

// ─── Token faucets ────────────────────────────────────────────────────────────

export function useMintUsdc() {
  const w = useContractWrite();
  const { address } = useWallet();
  const pending = useRef<PendingLog | null>(null);
  useLogOnConfirm(w.isSuccess, w.hash, pending);

  const mint = (amount: string) => {
    if (!address) return;
    const raw = parseUnits(amount, LOAN_DECIMALS);
    pending.current = { action: "mint_usdc", token: "USDC", amountRaw: raw, amountFormatted: amount };
    w.write({ address: USDC_ADDRESS, abi: TESTNET_ERC20_ABI, functionName: "allocateTo", args: [address, raw] });
  };
  return { mint, ...w };
}

// Only usable when cirBTC is the mintable demo token (NEXT_PUBLIC_USE_MOCK_CIRBTC).
export function useMintCirBtc() {
  const w = useContractWrite();
  const { address } = useWallet();
  const pending = useRef<PendingLog | null>(null);
  useLogOnConfirm(w.isSuccess, w.hash, pending);

  const mint = (amount: string) => {
    if (!address) return;
    const raw = parseUnits(amount, COLLATERAL_DECIMALS);
    pending.current = { action: "mint_cirbtc", token: "cirBTC", amountRaw: raw, amountFormatted: amount };
    w.write({ address: CIRBTC_ADDRESS, abi: TESTNET_ERC20_ABI, functionName: "allocateTo", args: [address, raw] });
  };
  return { mint, ...w };
}

// ─── Approvals ──────────────────────────────────────────────────────────────

export function useApproveCirBtc() {
  const w = useContractWrite();
  const approve = (amount: bigint) =>
    w.write({ address: CIRBTC_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [LENDING_ADDRESS, amount] });
  return { approve, ...w };
}

export function useApproveUsdc() {
  const w = useContractWrite();
  const approve = (amount: bigint) =>
    w.write({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "approve", args: [LENDING_ADDRESS, amount] });
  return { approve, ...w };
}

// ─── Position lifecycle ───────────────────────────────────────────────────────

export function useOpenPosition() {
  const w = useContractWrite();
  const pending = useRef<PendingLog | null>(null);
  useLogOnConfirm(w.isSuccess, w.hash, pending);

  const open = (amount: string) => {
    const raw = parseUnits(amount, COLLATERAL_DECIMALS);
    pending.current = { action: "open", token: "cirBTC", amountRaw: raw, amountFormatted: amount };
    w.write({ address: LENDING_ADDRESS, abi: LENDING_ABI, functionName: "openPositionWithCollateral", args: [raw] });
  };
  return { open, ...w };
}

export function useDepositCollateral() {
  const w = useContractWrite();
  const pending = useRef<PendingLog | null>(null);
  useLogOnConfirm(w.isSuccess, w.hash, pending);

  const deposit = (positionId: number, amount: string) => {
    const raw = parseUnits(amount, COLLATERAL_DECIMALS);
    pending.current = { action: "deposit", token: "cirBTC", amountRaw: raw, amountFormatted: amount };
    w.write({ address: LENDING_ADDRESS, abi: LENDING_ABI, functionName: "depositCollateral", args: [BigInt(positionId), raw] });
  };
  return { deposit, ...w };
}

export function useWithdrawCollateral() {
  const w = useContractWrite();
  const pending = useRef<PendingLog | null>(null);
  useLogOnConfirm(w.isSuccess, w.hash, pending);

  const withdraw = (positionId: number, amount: string) => {
    const raw = parseUnits(amount, COLLATERAL_DECIMALS);
    pending.current = { action: "withdraw", token: "cirBTC", amountRaw: raw, amountFormatted: amount };
    w.write({ address: LENDING_ADDRESS, abi: LENDING_ABI, functionName: "withdrawCollateral", args: [BigInt(positionId), raw] });
  };
  return { withdraw, ...w };
}

export function useTakeLoan() {
  const w = useContractWrite();
  const pending = useRef<PendingLog | null>(null);
  useLogOnConfirm(w.isSuccess, w.hash, pending);

  const borrow = (positionId: number, amount: string) => {
    const raw = parseUnits(amount, LOAN_DECIMALS);
    pending.current = { action: "borrow", token: "USDC", amountRaw: raw, amountFormatted: amount };
    w.write({ address: LENDING_ADDRESS, abi: LENDING_ABI, functionName: "takeLoan", args: [BigInt(positionId), raw] });
  };
  return { borrow, ...w };
}

export function useRepayLoan() {
  const w = useContractWrite();
  const pending = useRef<PendingLog | null>(null);
  useLogOnConfirm(w.isSuccess, w.hash, pending);

  const repay = (positionId: number, amount: string) => {
    const raw = parseUnits(amount, LOAN_DECIMALS);
    pending.current = { action: "repay", token: "USDC", amountRaw: raw, amountFormatted: amount };
    w.write({ address: LENDING_ADDRESS, abi: LENDING_ABI, functionName: "repayLoan", args: [BigInt(positionId), raw] });
  };
  return { repay, ...w };
}

// ─── Liquidation ──────────────────────────────────────────────────────────────

export function useLiquidate() {
  const w = useContractWrite();
  const pending = useRef<PendingLog | null>(null);
  useLogOnConfirm(w.isSuccess, w.hash, pending);

  const liquidate = (user: Address, positionId: number, amount: string) => {
    const raw = parseUnits(amount, LOAN_DECIMALS);
    pending.current = { action: "liquidate", token: "USDC", amountRaw: raw, amountFormatted: amount };
    w.write({ address: LENDING_ADDRESS, abi: LENDING_ABI, functionName: "liquidate", args: [user, BigInt(positionId), raw] });
  };
  return { liquidate, ...w };
}

// ─── Oracle (demo/owner) ────────────────────────────────────────────────────────

export function useSetPrice() {
  const w = useContractWrite();
  const setPrice = (priceHuman: string, priceDecimals: number) => {
    const raw = parseUnits(priceHuman, priceDecimals);
    w.write({ address: ORACLE_ADDRESS, abi: ORACLE_ABI, functionName: "setPrice", args: [raw] });
  };
  return { setPrice, ...w };
}
