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

/**
 * Parse raw blockchain/wallet errors into user-friendly messages.
 */
// LendingBorrowingV2 custom errors → plain-language explanations. The V2 ABI
// includes these errors, so viem decodes the revert name into the message.
const CUSTOM_ERRORS: Record<string, { title: string; detail: string }> = {
  ExceedsBorrowLimit: {
    title: "Over the borrow limit",
    detail: "This would borrow more than your collateral allows. Lower the amount or add collateral.",
  },
  InsufficientLiquidity: {
    title: "Not enough pool liquidity",
    detail: "The pool doesn't have enough USDC to cover this borrow right now. Try a smaller amount.",
  },
  InsufficientCollateral: {
    title: "Not enough collateral",
    detail: "You're trying to withdraw more collateral than this position holds.",
  },
  WouldBeUndercollateralized: {
    title: "Withdrawal blocked",
    detail: "Withdrawing this much would push the position past its borrow limit. Repay some debt first.",
  },
  ExceedsDebt: {
    title: "Nothing to repay",
    detail: "This position has no outstanding debt.",
  },
  PositionHealthy: {
    title: "Position is healthy",
    detail: "Its health factor is at or above 1.0, so it can't be liquidated.",
  },
  NotLiquidatable: {
    title: "Position is healthy",
    detail: "Its health factor is at or above 1.0, so it can't be liquidated.",
  },
  NoSuchPosition: { title: "Position not found", detail: "That position id doesn't exist for this account." },
  PositionInactive: { title: "Position closed", detail: "This position has been closed." },
  ZeroAmount: { title: "Enter an amount", detail: "The amount must be greater than zero." },
  InvalidParam: { title: "Invalid parameter", detail: "One of the values is out of the allowed range." },
};

export function parseTxError(error: Error): { title: string; detail?: string } {
  const msg = error.message || "";

  // Named custom errors from the lending contract.
  for (const [name, mapped] of Object.entries(CUSTOM_ERRORS)) {
    if (msg.includes(name)) return mapped;
  }

  // Public RPC rate limiting under polling.
  if (
    msg.includes("429") ||
    msg.includes("Too Many Requests") ||
    msg.toLowerCase().includes("rate limit")
  ) {
    return {
      title: "Network is rate-limiting requests",
      detail:
        "The public Arc RPC is throttling. It should recover shortly — or set NEXT_PUBLIC_RPC_URL to a dedicated provider for smoother demos.",
    };
  }

  // No wallet connected (raw wagmi/viem message).
  if (msg.includes("Connector not connected") || msg.includes("connector not connected")) {
    return { title: "Wallet not connected", detail: "Connect your wallet to continue." };
  }

  // User rejected the transaction in their wallet
  if (
    msg.includes("User rejected") ||
    msg.includes("user rejected") ||
    msg.includes("ACTION_REJECTED") ||
    msg.includes("UserRejectedRequestError")
  ) {
    return { title: "Transaction rejected", detail: "You declined the transaction in your wallet." };
  }

  // Insufficient funds for gas
  if (
    msg.includes("insufficient funds") ||
    msg.includes("exceeds the balance")
  ) {
    return {
      title: "Insufficient funds",
      detail: "Your wallet doesn't have enough ETH to cover gas fees. Please add funds and try again.",
    };
  }

  // Allowance / approval issues
  if (msg.includes("insufficient allowance") || msg.includes("ERC20: insufficient allowance")) {
    return { title: "Approval required", detail: "You need to approve token spending before this transaction." };
  }

  // Transfer exceeds balance (trying to spend more tokens than owned)
  if (msg.includes("transfer amount exceeds balance") || msg.includes("exceeds balance")) {
    return { title: "Insufficient token balance", detail: "You don't have enough tokens for this transaction." };
  }

  // Generic contract revert
  if (msg.includes("reverted") || msg.includes("execution reverted")) {
    // Try to extract a reason string
    const reasonMatch = msg.match(/reason:\s*(.+?)(?:\n|$)/i) || msg.match(/reverted with reason string '(.+?)'/);
    const reason = reasonMatch?.[1]?.trim();
    return {
      title: "Transaction failed",
      detail: reason || "The contract rejected this transaction. The market state may have changed.",
    };
  }

  // Network / RPC errors
  if (
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("could not detect network") ||
    msg.includes("failed to fetch")
  ) {
    return { title: "Network error", detail: "Could not reach the blockchain. Check your connection and try again." };
  }

  // Nonce issues
  if (msg.includes("nonce") && (msg.includes("too low") || msg.includes("already known"))) {
    return { title: "Transaction conflict", detail: "A pending transaction is blocking this one. Try again shortly." };
  }

  // Fallback - show a trimmed version of the raw message
  const short = msg.length > 150 ? msg.slice(0, 147) + "..." : msg;
  return { title: "Transaction failed", detail: short };
}
