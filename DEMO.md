# Demo script

A 5-minute click-path that reproduces a liquidation and shows the credit score
changing a borrower's terms. Assumes you've run the
[60-second quickstart](README.md#60-second-reviewer-quickstart) with
`NEXT_PUBLIC_USE_MOCK_CIRBTC=true`, so demo cirBTC is mintable in-app.

Two browser profiles make the liquidation vivid: one **borrower**, one
**liquidator**. A single wallet also works (you can liquidate your own
position).

## 0. Setup (once)

```bash
cp .env.example .env.local          # set PRIVATE_KEY + NEXT_PUBLIC_USE_MOCK_CIRBTC=true
NEXT_PUBLIC_USE_MOCK_CIRBTC=true npm run deploy:lending
npm run seed:demo                   # stages a position at HF ≈ 1.05
npm run dev                         # http://localhost:3000
```

`seed:demo` prints the borrower address and the staged health factor — keep it
handy for the Liquidations step.

## 1. See a live position (Portfolio tab)

1. Connect a wallet (MetaMask or "Passkey wallet" — both work).
2. In **Test tokens**, click **Mint 1 demo cirBTC** and **Mint 10,000 USDC**.
3. In **Open a new position**, enter `0.1` cirBTC → **Approve cirBTC** → **Open
   position**. The card shows a **Health Factor gauge** (green, ∞ — no debt yet).
4. On the position, open **Borrow**, enter an amount near the max. Note the
   live preview: *"Health factor ∞ → 1.9"* before you confirm. Click **Borrow
   USDC**. The gauge settles into the green.

## 2. Watch it slide toward liquidation (the money shot)

1. In the **cirBTC price** panel, click **−10%** once or twice, or set an exact
   price. Each update refetches state and the **gauge needle sweeps** — green →
   amber → red — as the position's health factor falls.
2. Drop the price until HF crosses **1.0**. The gauge turns red and reads
   "Liquidatable".

Prefer the pre-staged position? It's already at HF ≈ 1.05 — a single **−10%**
tips it under 1.0.

## 3. Liquidate (Liquidations tab)

1. Switch to the **Liquidations** tab (use the liquidator profile, or the same
   wallet).
2. Paste the borrower address (or click **My positions**) → **Scan**. Positions
   below HF 1.0 appear flagged red with their gauge.
3. Enter a **Repay (USDC)** amount — the preview shows the cirBTC you'll receive
   (repay + the liquidation bonus). **Approve USDC** if prompted → **Liquidate**.
4. The borrower's position debt and collateral drop; its HF recovers above 1.0
   (partial liquidation), and the liquidator's cirBTC balance rises by the
   seized amount + bonus.

## 4. Credit changes the terms (Credit tab)

Two contrasting stories:

- **Reliability raises terms.** As the borrower, borrow and then fully **Repay**
  a loan (pass a generous amount — it's capped at the debt). Open the **Credit**
  tab: the score rises above the 500 baseline and the **benefit** line shows the
  personal collateral factor increasing (e.g. `50% → 55.7%`). Open a new position
  and see the higher borrow capacity on the same collateral.
- **Liquidation lowers terms.** The position you liquidated in step 3 recorded a
  liquidation against that borrower — their Credit tab shows the score dropped
  (−200) and "Times liquidated: 1".

## 5. The rest (Markets tab)

The **Markets** tab shows the pool: TVL, available liquidity, total borrowed,
utilization, and the **interest-rate curve** with a live marker at the current
utilization — borrow more (raising utilization past the kink) and watch the
borrow APR jump.

## What each step demonstrates

| Step | Pillar |
| --- | --- |
| 1 | Multi-position, collateral valuation via oracle |
| 2 | Live health factor + price oracle (the signature gauge) |
| 3 | Liquidation engine (close factor + bonus) |
| 4 | On-chain credit score modulating terms |
| 5 | Dynamic interest-rate model + treasury view |
