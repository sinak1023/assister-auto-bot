# Setup — running Arc Vault on your server

Turnkey steps to go from an unzipped project to a running app. Everything is
driven by `.env.local`; no secrets live in the code.

## Prerequisites

- Node.js 20+ and npm.
- A funded Arc Testnet wallet (testnet-only key). USDC is the native gas token;
  fund it from <https://faucet.circle.com/>.
- (Optional) Docker, only if you want local Supabase transaction history.

## 1. Install

```bash
npm install
```

## 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

| Variable | Set to |
| --- | --- |
| `PRIVATE_KEY` | Your **testnet-only** deployer key (64 hex chars). |
| `NEXT_PUBLIC_USE_MOCK_CIRBTC` | `true` to deploy mintable demo cirBTC (recommended so you can test without owning real cirBTC); `false` for the real cirBTC production path. |
| `NEXT_PUBLIC_RPC_URL` | *(optional)* A dedicated Arc RPC (e.g. Alchemy). The public endpoint rate-limits under polling; a dedicated URL is smoother for demos. |
| `NEXT_PUBLIC_CIRCLE_CLIENT_KEY` / `NEXT_PUBLIC_CIRCLE_CLIENT_URL` | *(optional)* Enable Circle Passkey wallet support. MetaMask works without these. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | *(optional)* Enable transaction history (see step 5). |

## 3. Compile & test the contracts

```bash
npm run compile
npm run test:contracts        # optional but recommended — 22 tests
```

## 4. Deploy to Arc Testnet

```bash
NEXT_PUBLIC_USE_MOCK_CIRBTC=true npm run deploy:lending
```

This deploys the oracle, (optional demo) cirBTC, mock USDC, and
`LendingBorrowingV2`, funds the pool, and **writes all contract addresses back
into `.env.local`** — no manual copying. Optionally stage a demo position:

```bash
npm run seed:demo             # requires demo cirBTC
```

## 5. (Optional) Local Supabase for history

```bash
npm run db:start              # starts Supabase + applies migrations via Docker
```

Copy the printed API URL and publishable/anon key into `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Skip this and the app
runs fine — the history panel simply shows a "not configured" note.

## 6. Run

```bash
npm run dev                   # development, http://localhost:3000
# or, for production:
npm run build && npm run start
```

## Notes

- Re-running `deploy:lending` deploys fresh contracts and overwrites the
  addresses in `.env.local`; restart the dev server to pick them up.
- Tune risk/interest parameters at deploy time via the optional env vars listed
  in `.env.example` (collateral factor, liquidation threshold, bonus, pool
  funding, initial price).
- The frontend expects Arc Testnet (chain id `5042002`); make sure your wallet
  is on that network.
