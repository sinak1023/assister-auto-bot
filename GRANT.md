# Grant narrative

**Arc Vault turns Circle's lending sample into a credible, risk-aware USDC credit
market on Arc** — the kind of collateralized-finance primitive the Arc Developer
Grant program is meant to seed.

## Why this fits the program

The grant rewards teams that *"extend the flow for credit, treasury, or
collateralized finance use cases"* and *"expand USDC utility and make the Arc
ecosystem stronger."* Arc Vault does exactly that, starting from Circle's own
sample and closing the gaps Circle itself documented (no liquidation, no rates,
one loan per user, fixed collateral factor). It's an extension, not a rewrite:
same wagmi/viem stack, same unified `useContractWrite` hook, same dual MetaMask +
Circle Passkey support, same shadcn/ui and Supabase history — so it reads as a
natural next step for the ecosystem, not a detour.

## How it expands USDC utility

- **USDC as the unit of credit.** Every loan, repayment, interest accrual, and
  liquidation is denominated in USDC. A dynamic interest-rate model means USDC
  liquidity is *priced* — suppliers earn a yield that tracks demand, borrowers
  pay a rate that defends pool solvency. That's the difference between parked
  USDC and productive USDC.
- **Bitcoin-backed dollar credit.** Users unlock USDC liquidity against cirBTC
  without selling it — the core collateralized-finance use case, now safe to run
  because liquidation and a live health factor protect the pool.
- **A treasury lens.** The portfolio/treasury dashboard aggregates collateral
  value, debt, net exposure, and health across positions — the view an
  institution needs to manage a USDC credit book on Arc.
- **On-chain credit as a growth primitive.** A reputation signal built purely
  from on-chain repayment history lets terms improve for proven borrowers,
  conservatively and transparently — a foundation others on Arc can build richer
  credit products on.

## What's shipped (this submission)

- `LendingBorrowingV2` + `MockPriceOracle` (+ `IPriceOracle` seam), Solidity
  0.8.17 / OpenZeppelin v4, with a Hardhat suite covering HF boundaries,
  liquidation, interest accrual over time, credit transitions, multi-position
  isolation, and access control (22 tests, all passing).
- A turnkey deploy script (oracle + optional mintable demo cirBTC + USDC +
  protocol, pool seeding, addresses written to `.env.local`) and a
  `seed:demo` that stages a near-liquidation position for instant review.
- A complete frontend: the signature Health Factor gauge, a price panel, a
  borrow simulator with live "after this…" previews, a liquidations view, a
  credit tab, a multi-position portfolio, and a treasury dashboard — all
  routed through the unified dual-wallet write hook.

## What's next (milestones)

1. **Mainnet oracle.** Swap `MockPriceOracle` for a Chainlink adapter behind the
   existing `IPriceOracle` seam (no protocol changes) and run on Arc mainnet.
2. **Liquidator tooling.** A keeper bot + indexed at-risk feed so liquidations
   don't depend on manual scanning; event-sourced history beyond the demo
   Supabase table.
3. **Multi-collateral & isolated markets.** Generalize beyond cirBTC/USDC to
   additional Arc assets with per-market risk parameters.
4. **Deeper credit.** Extend the reputation signal (cross-market history,
   time-weighting) toward conservative, partially-undercollateralized lines for
   high-score borrowers — with the same bounded, explainable guardrails.

## Why it strengthens Arc

Arc Vault gives the ecosystem a reference implementation of *safe* USDC lending —
one a reviewer can clone, deploy, and watch manage risk in sixty seconds. It
raises the ceiling on what a Circle-sample fork can be, and leaves reusable
pieces (the oracle seam, the kinked-rate model, the on-chain credit primitive)
that other Arc builders can adopt.
