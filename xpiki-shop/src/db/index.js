const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("../config");
const { createLogger } = require("../lib/logger");

const log = createLogger("db");

fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });

const db = new Database(config.databaseFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

// -------------------------------------------------------------- settings --
const DEFAULT_SETTINGS = {
  shop_name: "xpiki api shop",
  support_username: "",
  // Receiving wallets. Empty means the matching payment option stays hidden.
  wallet_address_ethereum: "",
  wallet_address_bsc: "",
  wallet_address_tron: "",
  wallet_address_solana: "",
  // Providers
  alchemy_api_key: "",
  trongrid_api_key: "",
  // Confirmation thresholds
  confirmations_ethereum: "12",
  confirmations_bsc: "15",
  confirmations_tron: "19",
  // Payment behaviour
  invoice_ttl_minutes: "40",
  min_topup_usd: "1",
  payment_poll_seconds: "45",
  // Growth features
  referral_percent: "5",
  force_join_enabled: "0",
  required_channel: "",
  // Asset switches
  asset_enabled_eth_ethereum: "1",
  asset_enabled_usdt_ethereum: "1",
  asset_enabled_usdt_bsc: "1",
  asset_enabled_usdt_tron: "1",
  asset_enabled_sol_solana: "1",
  welcome_message: "Welcome to xpiki api shop — premium API keys and accounts, delivered instantly."
};

const settingsCache = new Map();

const stmtGetSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const stmtSetSetting = db.prepare(
  `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
);
const stmtAllSettings = db.prepare("SELECT key, value FROM settings");

const settings = {
  get(key, fallback = "") {
    if (settingsCache.has(key)) return settingsCache.get(key);
    const row = stmtGetSetting.get(key);
    const value =
      row !== undefined
        ? row.value
        : DEFAULT_SETTINGS[key] !== undefined
          ? DEFAULT_SETTINGS[key]
          : fallback;
    settingsCache.set(key, value);
    return value;
  },
  getNumber(key, fallback = 0) {
    const parsed = Number(settings.get(key, String(fallback)));
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  getBool(key, fallback = false) {
    return settings.get(key, fallback ? "1" : "0") === "1";
  },
  set(key, value) {
    stmtSetSetting.run(key, String(value ?? ""));
    settingsCache.set(key, String(value ?? ""));
  },
  setMany(entries) {
    const run = db.transaction((pairs) => {
      for (const [key, value] of Object.entries(pairs)) {
        stmtSetSetting.run(key, String(value ?? ""));
        settingsCache.set(key, String(value ?? ""));
      }
    });
    run(entries);
  },
  all() {
    const stored = Object.fromEntries(stmtAllSettings.all().map((r) => [r.key, r.value]));
    return { ...DEFAULT_SETTINGS, ...stored };
  },
  defaults: DEFAULT_SETTINGS
};

// Seed any default that has never been written, so the admin panel always has
// a full row set to edit.
const seed = db.transaction(() => {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (stmtGetSetting.get(key) === undefined) stmtSetSetting.run(key, value);
  }
});
seed();

log.info(`Database ready at ${config.databaseFile}`);

module.exports = { db, settings };
