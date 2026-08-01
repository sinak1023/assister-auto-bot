const { db, settings } = require("../db");
const { getAsset, enabledAssets } = require("./assets");
const prices = require("./prices");
const { formatUnits, roundUpToPrecision, USD_SCALE } = require("../lib/money");
const { createLogger } = require("../lib/logger");

const log = createLogger("invoices");

// The last three digits at the asset's quoted precision carry a per-invoice
// tag. Two open invoices for the same asset therefore never ask for the same
// amount, which is what makes a shared receiving address safe to match on.
const MAX_TAG = 999;

// A payment that lands after the invoice window closed is still honoured for
// this long. Customers do miss the timer, and their money should not vanish.
const LATE_PAYMENT_GRACE_HOURS = 48;

const stmtInvoice = db.prepare("SELECT * FROM invoices WHERE id = ?");
const stmtOpenTags = db.prepare(
  `SELECT unique_tag FROM invoices
    WHERE asset_key = ? AND status IN ('pending', 'confirming')`
);

function listPaymentOptions() {
  return enabledAssets(settings).map((asset) => ({
    key: asset.key,
    label: asset.label,
    network: asset.networkLabel,
    symbol: asset.symbol
  }));
}

function pickUniqueTag(assetKey) {
  const taken = new Set(stmtOpenTags.all(assetKey).map((row) => row.unique_tag));
  if (taken.size >= MAX_TAG) {
    throw new Error("Too many open invoices for this asset. Please try again shortly.");
  }
  // Randomised rather than sequential so the amount does not leak order volume.
  let tag;
  do {
    tag = 1 + Math.floor(Math.random() * MAX_TAG);
  } while (taken.has(tag));
  return tag;
}

/**
 * Convert a USD amount into the exact crypto amount to request.
 * The base amount is always rounded UP so the shop is never short-changed by
 * rounding, then the unique tag is added on top.
 */
function computeAmount(asset, usdMicros, rateMicros, tag) {
  const scale = 10n ** BigInt(asset.decimals);
  // units = usd / rate, carried at full token precision.
  const rawUnits = (BigInt(usdMicros) * scale) / BigInt(rateMicros);
  const rounded = roundUpToPrecision(rawUnits, asset.decimals, asset.precision);
  const tagStep = 10n ** BigInt(asset.decimals - asset.precision);
  return rounded + BigInt(tag) * tagStep;
}

/**
 * Open a payment window.
 * `purpose` is 'topup' to credit the wallet or 'order' to pay for one order.
 */
async function createInvoice({ userId, assetKey, usdMicros, purpose = "topup", orderId = null }) {
  const asset = getAsset(assetKey);
  if (!asset) throw new Error("Unknown payment option.");

  const address = settings.get(asset.settingsAddressKey, "").trim();
  if (!address) throw new Error(`${asset.label} payments are not configured yet.`);
  if (settings.get(`asset_enabled_${asset.key}`, "1") !== "1") {
    throw new Error(`${asset.label} payments are currently disabled.`);
  }

  const rateMicros = await prices.getUsdPriceMicros(asset.priceSymbol);
  const tag = pickUniqueTag(asset.key);
  const expectedUnits = computeAmount(asset, usdMicros, rateMicros, tag);
  const ttlMinutes = Math.max(5, settings.getNumber("invoice_ttl_minutes", 40));

  const result = db
    .prepare(
      `INSERT INTO invoices
         (user_id, purpose, order_id, asset_key, network, usd_micros, rate_micros,
          expected_units, expected_display, unique_tag, address, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`
    )
    .run(
      Number(userId),
      purpose,
      orderId,
      asset.key,
      asset.network,
      Number(usdMicros),
      Number(rateMicros),
      expectedUnits.toString(),
      formatUnits(expectedUnits, asset.decimals),
      tag,
      address,
      `+${ttlMinutes} minutes`
    );

  const invoice = stmtInvoice.get(Number(result.lastInsertRowid));
  log.info(
    `Invoice #${invoice.id} ${asset.label} ${invoice.expected_display} for user ${userId}`
  );
  return invoice;
}

function getInvoice(id) {
  return stmtInvoice.get(Number(id)) || null;
}

function listOpenInvoices() {
  return db
    .prepare("SELECT * FROM invoices WHERE status IN ('pending', 'confirming') ORDER BY id")
    .all();
}

function listUserInvoices(userId, limit = 20) {
  return db
    .prepare("SELECT * FROM invoices WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(Number(userId), limit);
}

/**
 * Assets worth polling for right now.
 *
 * Recently expired invoices are included on purpose: a customer who paid after
 * the timer ran out is still credited, which can only happen if the watcher
 * keeps looking at that chain for the length of the grace window.
 */
function assetsNeedingScan() {
  return db
    .prepare(
      `SELECT DISTINCT asset_key FROM invoices
        WHERE status IN ('pending', 'confirming')
           OR (status = 'expired' AND datetime(created_at) > datetime('now', ?))`
    )
    .all(`-${LATE_PAYMENT_GRACE_HOURS} hours`)
    .map((row) => row.asset_key);
}

function expireStaleInvoices() {
  const result = db
    .prepare(
      `UPDATE invoices SET status = 'expired'
        WHERE status = 'pending' AND datetime(expires_at) < datetime('now')`
    )
    .run();
  return result.changes;
}

function cancelInvoice(id, userId) {
  const result = db
    .prepare(
      `UPDATE invoices SET status = 'canceled'
        WHERE id = ? AND user_id = ? AND status = 'pending'`
    )
    .run(Number(id), Number(userId));
  return result.changes > 0;
}

/** Human friendly line for the payment screen, e.g. "0.01234567 ETH". */
function describeAmount(invoice) {
  const asset = getAsset(invoice.asset_key);
  return `${invoice.expected_display} ${asset ? asset.symbol : ""}`.trim();
}

/** USD value of one whole unit, as it was quoted when the invoice opened. */
function describeRate(invoice) {
  const asset = getAsset(invoice.asset_key);
  const rate = BigInt(invoice.rate_micros);
  const whole = rate / USD_SCALE;
  const frac = (rate % USD_SCALE).toString().padStart(6, "0").slice(0, 2);
  return `1 ${asset ? asset.symbol : ""} ≈ $${whole}.${frac}`;
}

module.exports = {
  listPaymentOptions,
  createInvoice,
  getInvoice,
  listOpenInvoices,
  listUserInvoices,
  assetsNeedingScan,
  LATE_PAYMENT_GRACE_HOURS,
  expireStaleInvoices,
  cancelInvoice,
  describeAmount,
  describeRate,
  computeAmount
};
