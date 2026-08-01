PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- settings --
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------ admin logins --
CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- ------------------------------------------------------------- shop users --
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY,          -- telegram user id
  first_name     TEXT NOT NULL DEFAULT '',
  last_name      TEXT NOT NULL DEFAULT '',
  username       TEXT NOT NULL DEFAULT '',
  language_code  TEXT NOT NULL DEFAULT '',
  balance_micros INTEGER NOT NULL DEFAULT 0,   -- USD * 1e6
  referred_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  referral_code  TEXT UNIQUE,
  is_blocked     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

-- -------------------------------------------------------------- catalogue --
-- kind: 'account' (username/password products) or 'api' (API key products)
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'api',
  emoji      TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- delivery_type:
--   'auto'   -> a stock item is handed over the moment payment clears
--   'manual' -> the buyer is told to message `manual_contact` to collect
CREATE TABLE IF NOT EXISTS products (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id        INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  description_before TEXT NOT NULL DEFAULT '',
  description_after  TEXT NOT NULL DEFAULT '',
  price_micros       INTEGER NOT NULL DEFAULT 0,
  delivery_type      TEXT NOT NULL DEFAULT 'auto',
  manual_contact     TEXT NOT NULL DEFAULT '',
  sort_order         INTEGER NOT NULL DEFAULT 0,
  is_active          INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- One row per deliverable unit. `status` guarantees a key is never handed to
-- two different buyers: it moves available -> sold and records who got it.
CREATE TABLE IF NOT EXISTS stock_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  username     TEXT NOT NULL DEFAULT '',
  password     TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'available',
  order_id     INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  sold_to      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sold_at      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stock_product_status ON stock_items(product_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_sold_to ON stock_items(sold_to);

-- ----------------------------------------------------------------- orders --
-- status: pending_payment | paid | delivered | awaiting_manual | canceled | expired | refunded
CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name     TEXT NOT NULL,
  category_kind    TEXT NOT NULL DEFAULT 'api',
  price_micros     INTEGER NOT NULL,
  discount_code    TEXT NOT NULL DEFAULT '',
  discount_micros  INTEGER NOT NULL DEFAULT 0,
  total_micros     INTEGER NOT NULL,
  payment_method   TEXT NOT NULL DEFAULT 'wallet',
  status           TEXT NOT NULL DEFAULT 'pending_payment',
  delivered_text   TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at          TEXT,
  delivered_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- ------------------------------------------------------------ wallet ledger --
-- Every balance change is written here; users.balance_micros is the running sum.
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,        -- deposit | purchase | referral | admin_adjust | refund
  amount_micros  INTEGER NOT NULL,     -- signed
  balance_after  INTEGER NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  ref_type       TEXT NOT NULL DEFAULT '',
  ref_id         INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_transactions(user_id, id DESC);

-- --------------------------------------------------------------- invoices --
-- purpose: 'topup' (credit the wallet) or 'order' (pay for one order)
-- status:  pending | confirming | confirmed | expired | canceled
CREATE TABLE IF NOT EXISTS invoices (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose           TEXT NOT NULL DEFAULT 'topup',
  order_id          INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  asset_key         TEXT NOT NULL,
  network           TEXT NOT NULL,
  usd_micros        INTEGER NOT NULL,
  rate_micros       INTEGER NOT NULL,   -- USD per 1 whole unit, at creation time
  expected_units    TEXT NOT NULL,      -- smallest-unit amount, exact match target
  expected_display  TEXT NOT NULL,      -- same amount as a human readable decimal
  unique_tag        INTEGER NOT NULL,   -- the per-invoice tag baked into the amount
  address           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  tx_hash           TEXT NOT NULL DEFAULT '',
  received_units    TEXT NOT NULL DEFAULT '',
  confirmations     INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at        TEXT NOT NULL,
  seen_at           TEXT,
  confirmed_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_match ON invoices(asset_key, status, expected_units);

-- Incoming transfers that did not line up with any pending invoice. The admin
-- can review these and credit a user by hand, so a mistyped amount never
-- silently swallows a customer's money.
CREATE TABLE IF NOT EXISTS unmatched_deposits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_key     TEXT NOT NULL,
  network       TEXT NOT NULL,
  tx_hash       TEXT NOT NULL,
  from_address  TEXT NOT NULL DEFAULT '',
  amount_units  TEXT NOT NULL,
  amount_display TEXT NOT NULL,
  block_number  INTEGER,
  resolved      INTEGER NOT NULL DEFAULT 0,
  resolved_note TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(asset_key, tx_hash, amount_units)
);

-- Transfers already processed, so a restart or an overlapping scan window can
-- never credit the same transaction twice.
CREATE TABLE IF NOT EXISTS seen_transfers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_key   TEXT NOT NULL,
  tx_hash     TEXT NOT NULL,
  log_index   TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(asset_key, tx_hash, log_index)
);

-- How far each chain has been scanned.
CREATE TABLE IF NOT EXISTS chain_cursors (
  network     TEXT PRIMARY KEY,
  last_block  INTEGER NOT NULL DEFAULT 0,
  last_marker TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --------------------------------------------------------- discount codes --
CREATE TABLE IF NOT EXISTS discount_codes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE,
  type           TEXT NOT NULL DEFAULT 'percent',   -- percent | fixed
  value          INTEGER NOT NULL DEFAULT 0,        -- percent: 1..100, fixed: micros
  max_uses       INTEGER NOT NULL DEFAULT 0,        -- 0 = unlimited
  used_count     INTEGER NOT NULL DEFAULT 0,
  min_total_micros INTEGER NOT NULL DEFAULT 0,
  expires_at     TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discount_uses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id    INTEGER NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id   INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(code_id, order_id)
);

-- ------------------------------------------------------------- referrals --
CREATE TABLE IF NOT EXISTS referral_earnings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id      INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  amount_micros INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(order_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_referrer ON referral_earnings(referrer_id);
