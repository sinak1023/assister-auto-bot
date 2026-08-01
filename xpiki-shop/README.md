# xpiki api shop

A complete digital goods shop for Telegram: a bot, a Mini App storefront, and a
web admin panel — with crypto payments detected and delivered automatically.

Sell API keys and accounts. A customer picks a product, pays from their wallet
balance or directly in crypto, and the moment the payment confirms on-chain the
key is delivered to them. Each key is handed to exactly one buyer, ever.

---

## What it does

### For the customer
- **Two ways to shop** — inline buttons inside the bot, or the Mini App
  storefront. Both show the same balance, orders and purchased keys.
- **Wallet balance** — top up once in crypto, then buy instantly with no
  further on-chain waiting.
- **Direct crypto checkout** — pay for a single order without topping up.
- **Automatic delivery** — the key or account appears in the chat and in
  "My Orders" as soon as the payment clears.
- **Referrals** — every customer gets an invite link and earns a percentage of
  what the people they invite spend.
- **Discount codes**, and an optional **join our channel** gate before buying.

### For the shop owner (web panel)
- **KPI dashboard** — revenue for today / 7 days / 30 days, sales counts, new
  customers, a 14-day revenue chart, best sellers, low-stock warnings, wallet
  liability, and a list of anything needing attention.
- **Two product types** — API keys and accounts (username/password), organised
  into categories you define.
- **Stock management** — paste keys one per line; the panel shows what is left
  and exactly which customer received each sold item.
- **Two delivery modes** — automatic from stock, or *manual*, where the buyer is
  told to message a contact you choose.
- **Orders** — filter by status, retry a delivery that failed for lack of
  stock, or refund a customer to their wallet.
- **Customers** — search, inspect their orders and wallet ledger, adjust a
  balance by hand, block an abuser.
- **Payments** — live provider health, every invoice, and a review queue for
  deposits that did not match any invoice.
- **Settings** — receiving wallet per network, Alchemy and TronGrid keys,
  confirmation depths, invoice lifetime, referral percentage, channel gate.
- **Broadcast** to every customer.

---

## Supported payment methods

| Currency | Network | Watched via |
|---|---|---|
| ETH | Ethereum Mainnet | Alchemy |
| USDT (ERC20) | Ethereum Mainnet | Alchemy |
| USDT (BEP20) | BNB Smart Chain | Alchemy |
| USDT (TRC20) | Tron | TronGrid |
| SOL | Solana | Alchemy |

Each can be switched on or off independently in Settings.

> **Why TronGrid?** Alchemy does not support the Tron network at all, so TRC20
> payments have to be watched through TronGrid. Everything else runs on Alchemy,
> which also supplies the live USD prices.

---

## How payment detection works

Products are priced in **USD**. At checkout the price is converted to the chosen
currency at the live rate, and the customer is asked to send that exact amount to
your own receiving wallet.

To tell two simultaneous payments apart, every invoice gets a **unique tag baked
into the final digits** of the amount. Two customers both buying a $25 product
are asked for `25.000418` and `25.000913` USDT — so an incoming transfer
identifies its invoice unambiguously, without needing a separate address per
order.

This design means **no private keys ever live on the server**. Money goes
straight into the wallets you control; the app only ever reads the chain.

The watcher polls each network that has something to watch, waits for the
confirmation depth you configured, and then credits the wallet or delivers the
order. It is safe against double-crediting (every transfer is claimed exactly
once), it honours payments that arrive up to 48 hours after the invoice expired,
and any transfer it cannot match is parked in **Payments → Unmatched deposits**
for you to resolve by hand rather than being silently swallowed.

---

## Setup

### 1. Create the bot
Message [@BotFather](https://t.me/BotFather), send `/newbot`, and copy the token.

### 2. Install
```bash
cd xpiki-shop
npm install
cp .env.example .env
```

### 3. Fill in `.env`
```ini
BOT_TOKEN=123456:ABC-your-token
ADMIN_TELEGRAM_IDS=123456789        # your numeric id, from @userinfobot
PUBLIC_URL=https://shop.example.com # HTTPS, required for the Mini App
PORT=3000
JWT_SECRET=<a long random string>
DATABASE_FILE=./data/xpiki.db
```

Generate a secret with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Create your panel login
```bash
npm run create-admin
```

### 5. Start
```bash
npm start
```

The bot goes live, the Mini App is served at `/app/`, and the panel at `/admin/`.

### 6. Configure the shop
Sign in at `https://your-domain/admin/` and open **Settings**:

1. Paste your **receiving wallet address** for each network you want to accept.
   Money lands in these wallets directly — check every character.
2. Add your **Alchemy API key** ([dashboard.alchemy.com](https://dashboard.alchemy.com)),
   with the Ethereum, BNB Smart Chain and Solana networks enabled on the app.
3. Add a **TronGrid API key** ([trongrid.io](https://www.trongrid.io)) if you
   accept USDT-TRC20.
4. Save, then open **Payments** and confirm every provider shows green.

Then create a category, add a product, paste some stock, and you are trading.

### 7. Register the Mini App (optional but recommended)
In @BotFather: `/mybots` → your bot → *Bot Settings* → *Menu Button* → set the
URL to `https://your-domain/app/`.

---

## Running in production

`PUBLIC_URL` must be HTTPS — Telegram refuses to open a Mini App over plain
HTTP. Put nginx or Caddy in front and terminate TLS there.

```bash
npm install -g pm2
pm2 start src/index.js --name xpiki-shop
pm2 save && pm2 startup
```

Minimal nginx block:
```nginx
server {
  listen 443 ssl;
  server_name shop.example.com;

  # ssl_certificate ... (certbot will fill these in)

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Back up `data/xpiki.db` regularly — it holds every order, key and balance.

---

## Tests

```bash
npm test
```

Runs two suites against throwaway databases:

- `selftest.js` — money maths, catalogue, wallet checkout, referral payout,
  discount rules, invoice amount tagging, Mini App signature verification, and
  the admin HTTP API end to end.
- `test-payments.js` — the real payment watcher driven by a simulated
  blockchain: confirmation depth, crediting, order delivery, replay protection,
  unmatched deposits, late payments, and concurrent invoices.

---

## Project layout

```
src/
  index.js              startup
  config.js             environment
  lib/
    money.js            USD micros and token unit maths (no floats)
    logger.js
  db/
    index.js            SQLite connection and settings store
    schema.sql          full schema
  services/
    assets.js           the payment catalogue (currency + network)
    prices.js           Alchemy USD prices
    chains/
      evm.js            Ethereum and BNB Chain
      solana.js         Solana
      tron.js           Tron via TronGrid
    invoices.js         invoice creation and unique amount tagging
    watcher.js          the payment detection loop
    orders.js           checkout, delivery, referral payout
    catalog.js          categories, products, stock
    users.js            customers and the wallet ledger
    discounts.js
    notifier.js         lets background jobs message customers
  bot/                  Telegram bot
  web/
    server.js
    auth.js             Mini App initData + admin sessions
    routes/
      miniapp.js        customer API
      admin.js          panel API
    public/
      miniapp/          Mini App storefront
      admin/            admin panel
scripts/
  create-admin.js
  selftest.js
  test-payments.js
```

---

## Security notes

- The server holds **no private keys**. It reads the chain and nothing more.
- Mini App requests are authenticated by verifying Telegram's `initData` HMAC
  signature, so a customer cannot impersonate another.
- Panel passwords are bcrypt hashed; sessions are httpOnly JWT cookies.
- All money is integer arithmetic — USD in millionths, tokens in their smallest
  unit. No floating point anywhere in a balance.
- Wallet debits are refused if they would go negative, and stock is claimed with
  a conditional update so a key cannot be delivered twice.

### One thing to tell your customers
They must send the **exact amount**, with network fees paid *on top*. Some
exchanges deduct the withdrawal fee from the amount sent — that arrives as a
different number and lands in **Unmatched deposits** instead of crediting
automatically. It is not lost; you resolve it from the panel in a few clicks.
