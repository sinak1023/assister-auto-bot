const { db } = require("../db");

const stmtByCode = db.prepare("SELECT * FROM discount_codes WHERE code = ?");
const stmtUsedByUser = db.prepare(
  "SELECT COUNT(*) AS count FROM discount_uses WHERE code_id = ? AND user_id = ?"
);

/**
 * Validate a code against a cart total.
 * Returns { ok: true, code, discountMicros } or { ok: false, reason }.
 */
function evaluate(rawCode, userId, totalMicros) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, reason: "No code provided." };

  const record = stmtByCode.get(code);
  if (!record || !record.is_active) {
    return { ok: false, reason: "This discount code is not valid." };
  }
  if (record.expires_at && new Date(record.expires_at) < new Date()) {
    return { ok: false, reason: "This discount code has expired." };
  }
  if (record.max_uses > 0 && record.used_count >= record.max_uses) {
    return { ok: false, reason: "This discount code has reached its usage limit." };
  }
  if (BigInt(record.min_total_micros) > BigInt(totalMicros)) {
    return { ok: false, reason: "Order total is below the minimum for this code." };
  }
  if (stmtUsedByUser.get(record.id, Number(userId)).count > 0) {
    return { ok: false, reason: "You have already used this discount code." };
  }

  const total = BigInt(totalMicros);
  let discount =
    record.type === "percent"
      ? (total * BigInt(record.value)) / 100n
      : BigInt(record.value);

  // Never let a code push an order below zero.
  if (discount > total) discount = total;

  return { ok: true, code: record, discountMicros: discount };
}

/** Record that a code was spent on an order. Called inside the order transaction. */
function consume(codeId, userId, orderId) {
  db.prepare("UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?").run(codeId);
  db.prepare(
    "INSERT OR IGNORE INTO discount_uses (code_id, user_id, order_id) VALUES (?, ?, ?)"
  ).run(codeId, Number(userId), orderId);
}

module.exports = { evaluate, consume };
