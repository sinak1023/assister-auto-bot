# Architecture

How Arc Vault extends Circle's `arc-defi-lend-borrow` sample into a risk-aware
credit market, and the math behind each pillar.

## Overview

```
                    ┌─────────────────────┐
   cirBTC (8 dec)   │                     │   USDC (8 dec, native gas)
   collateral  ───▶ │  LendingBorrowingV2 │ ◀─── loan token / pool
                    │                     │
   MockPriceOracle  │  • positions[user][]│   TestnetERC20 (mock USDC,
   (IPriceOracle) ─▶│  • borrowIndex      │   optional demo cirBTC)
   swappable        │  • credit[user]     │
                    └─────────────────────┘
                              ▲
        wagmi/viem reads ─────┤ useContractWrite (MetaMask + Circle Passkey)
        hooks/lending/* ──────┘ every write goes through the unified hook
```

`LendingBorrowingV2` is a **versioned successor**, not an edit of the deployed
sample: every original concept (deposit cirBTC, borrow USDC, repay, withdraw,
owner-funded pool, collateral factor) is preserved, and five capabilities are
layered on. Units: ratio parameters are **basis points** (10000 = 100%); rates
and utilization are **WAD** (1e18 = 100%); health factor is **WAD** (1e18 = 1.0).

## Pillar 1 — Price oracle, health factor, liquidation

### Collateral valuation

The sample valued cirBTC 1:1 with USDC. Arc Vault values it at an oracle price.
For collateral amount `c` (base units), oracle price `p` scaled by `10^pDec`:

```
collateralValue (USDC base units) = c · p · 10^loanDec / (10^collDec · 10^pDec)
```

With all-8-decimal tokens and an 8-decimal price this reduces to `c · p / 1e8`.
The inverse (used by liquidation to convert a repaid USDC value into cirBTC to
seize) is `loanValue · 10^collDec · 10^pDec / (10^loanDec · p)`.

### Health factor

```
HF = collateralValue · liquidationThreshold / debt        (WAD-scaled)
```

Debt-free positions report `type(uint256).max`. A position is liquidatable when
`HF < 1e18`. Borrow **capacity** uses the (credit-adjusted) *collateral factor*;
the health factor uses the global *liquidation threshold* — the standard
LTV-vs-threshold separation, so a freshly-maxed borrow still opens above 1.0.

### Liquidation

`liquidate(user, positionId, repayAmount)` is callable by anyone when
`HF < 1e18`:

1. Repay is capped at `debt · closeFactor` (Aave-style partial liquidation).
2. Collateral seized = `repay · (1 + liquidationBonus)` converted to cirBTC at
   the oracle price; if the position can't cover the bonus, all its collateral
   is seized.
3. The liquidator's USDC repays the debt; the seized cirBTC transfers out.
4. The borrower's `credit.liquidations` increments (lowering their score).

Oracle updates, price-driven, are what make this legible: drop the price and a
position's HF visibly crosses 1.0.

### Oracle seam (mainnet path)

The protocol depends only on `IPriceOracle { getPrice(); decimals(); }`. On
testnet that's `MockPriceOracle` (owner-settable). On mainnet, a thin adapter
over Chainlink's `AggregatorV3Interface` — returning `uint256(latestRoundData().answer)`
from `getPrice()` and forwarding `decimals()` — satisfies the interface with
**zero protocol changes**. `setOracle(address)` swaps it in. That's the entire
seam: no valuation code references a concrete feed.

## Pillar 2 — Dynamic interest (kinked curve + borrow index)

Utilization is `borrows / (borrows + cash)`. The borrow rate per year (WAD):

```
u ≤ kink :  base + u·slope1/kink
u > kink :  base + slope1 + (u−kink)·slope2/(1−kink)
```

Defaults: 2% base, +8% to an 80% kink, +100% above — cheap capital until the
pool tightens, then a steep penalty that pulls in repayments. Interest accrues
through a **global borrow index** (Compound-style): each interaction advances
`borrowIndex *= 1 + ratePerYear · Δt / yearSeconds`, and a position stores
`scaledDebt = amount / index_at_borrow`, so `debt = scaledDebt · index`. View
functions project the index to the current block, so debt and HF tick live
without a transaction. `supplyAPY = borrowAPR · utilization · (1 − reserveFactor)`.

## Pillar 3 — On-chain credit score

`creditScore(user) ∈ [0, 1000]`, from on-chain facts only:

```
score = 500 (baseline)
      + min(loansFullyRepaid · 40, 300)        // reliability
      + volumeBonus(totalRepaidVolume)          // 60 / 120 / 200 tiers
      − liquidations · 200                       // risk
   clamped to [0, 1000]
```

The caps are chosen so a spotless borrower can actually reach 1000
(500 + 300 + 200). The score modulates a **personal collateral factor**, linear
from the base at score 500 to the ceiling at 1000:

```
effectiveFactor = base + (maxFactor − base) · (score − 500) / 500
```

Bounded by construction: `setRiskParams` requires `maxFactor < liquidationThreshold`,
so credit can never let a borrower open a position that's already liquidatable.
The credit benefit is the collateral factor only — real and enforced on-chain,
deliberately conservative (no undercollateralized lending).

## Pillar 4 — Multiple positions

Storage is `mapping(address => Position[])`, `Position { collateral, scaledDebt,
active }`. Every action takes a `positionId`; each position has its own
collateral, debt, and HF, and is liquidated independently. `getPositionDetails`
returns a fully-derived snapshot (collateral, debt, value, HF, remaining borrow)
for the UI in one call.

## Pillar 5 — Portfolio / treasury

`accountSummary` aggregates collateral, debt, and collateral value across a
user's positions; `accountHealthFactor` returns a collateral-weighted aggregate
HF. Market views (`poolLiquidity`, `totalBorrows`, `utilization`, `borrowAPR`,
`supplyAPY`) drive the treasury dashboard.

## Safety

- OpenZeppelin `Ownable`, `ReentrancyGuard`, `SafeERC20`; checks-effects-interactions
  on every mutating path; custom errors with natspec on all externals.
- All owner risk levers are bounds-checked (`_setRiskParams`,
  `setInterestRateParams`).
- 8-decimal invariant preserved for both tokens.
- Full Hardhat coverage in `test/LendingBorrowingV2.test.ts`: HF boundaries,
  liquidation eligibility/execution/bonus/close-factor, interest accrual over
  time and across the kink, credit transitions and the bounded ceiling,
  multi-position isolation, access control, and the oracle swap.

## Frontend

`hooks/useContractWrite.ts` (unchanged from the sample) abstracts MetaMask and
Circle Passkey wallets; **every** Arc Vault write routes through it, so both
wallet types work across all new actions. `hooks/lending/useLendingState`
batches reads (market + oracle + per-user + per-position) and polls at a
public-RPC-friendly cadence; `useLendingActions` exposes one hook per operation.
`lib/simulate.ts` mirrors the contract math client-side for the "after this…"
previews (display only — the contract enforces every limit). `lib/errors.ts`
maps V2 custom errors and RPC 429s to plain-language messages.
