const crypto = require("crypto");
const { db } = require("../db");

const stmtFindUser = db.prepare("SELECT * FROM users WHERE id = ?");
const stmtFindByReferralCode = db.prepare("SELECT * FROM users WHERE referral_code = ?");
const stmtInsertUser = db.prepare(
  `INSERT INTO users (id, first_name, last_name, username, language_code, referral_code)
   VALUES (@id, @first_name, @last_name, @username, @language_code, @referral_code)`
);
const stmtTouchUser = db.prepare(
  `UPDATE users
      SET first_name = @first_name,
          last_name = @last_name,
          username = @username,
          language_code = @language_code,
          last_seen_at = datetime('now')
    WHERE id = @id`
);
const stmtSetReferrer = db.prepare("UPDATE users SET referred_by = ? WHERE id = ? AND referred_by IS NULL");
const stmtAdjustBalance = db.prepare("UPDATE users SET balance_micros = balance_micros + ? WHERE id = ?");
const stmtInsertWalletTx = db.prepare(
  `INSERT INTO wallet_transactions
     (user_id, type, amount_micros, balance_after, description, ref_type, ref_id)
   VALUES (@user_id, @type, @amount_micros, @balance_after, @description, @ref_type, @ref_id)`
);

function newReferralCode() {
  // Short, unambiguous, and safe inside a Telegram deep link payload.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.randomBytes(8);
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code;
}

function getUser(id) {
  return stmtFindUser.get(Number(id)) || null;
}

function getUserByReferralCode(code) {
  if (!code) return null;
  return stmtFindByReferralCode.get(String(code).toUpperCase()) || null;
}

/** Create the user on first contact, otherwise refresh their profile fields. */
function upsertUser(telegramUser) {
  const id = Number(telegramUser.id);
  const payload = {
    id,
    first_name: telegramUser.first_name || "",
    last_name: telegramUser.last_name || "",
    username: telegramUser.username || "",
    language_code: telegramUser.language_code || ""
  };

  const existing = stmtFindUser.get(id);
  if (existing) {
    stmtTouchUser.run(payload);
    return stmtFindUser.get(id);
  }

  let code = newReferralCode();
  while (stmtFindByReferralCode.get(code)) code = newReferralCode();
  stmtInsertUser.run({ ...payload, referral_code: code });
  return stmtFindUser.get(id);
}

/** Link a new user to their inviter. Ignored if they already have one. */
function attachReferrer(userId, referralCode) {
  const referrer = getUserByReferralCode(referralCode);
  if (!referrer) return null;
  if (Number(referrer.id) === Number(userId)) return null; // no self referrals
  const result = stmtSetReferrer.run(referrer.id, Number(userId));
  return result.changes > 0 ? referrer : null;
}

/**
 * Move money in or out of a wallet and write the matching ledger row.
 * Returns the new balance in micros.
 */
const creditWallet = db.transaction(
  ({ userId, amountMicros, type, description = "", refType = "", refId = null }) => {
    const amount = BigInt(amountMicros);
    const user = stmtFindUser.get(Number(userId));
    if (!user) throw new Error(`Unknown user ${userId}`);

    const balanceAfter = BigInt(user.balance_micros) + amount;
    if (balanceAfter < 0n) throw new Error("INSUFFICIENT_FUNDS");

    stmtAdjustBalance.run(Number(amount), Number(userId));
    stmtInsertWalletTx.run({
      user_id: Number(userId),
      type,
      amount_micros: Number(amount),
      balance_after: Number(balanceAfter),
      description,
      ref_type: refType,
      ref_id: refId
    });
    return balanceAfter;
  }
);

function getWalletHistory(userId, limit = 30) {
  return db
    .prepare(
      "SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?"
    )
    .all(Number(userId), limit);
}

function getReferralStats(userId) {
  const invited = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE referred_by = ?")
    .get(Number(userId)).count;
  const earned = db
    .prepare(
      "SELECT COALESCE(SUM(amount_micros), 0) AS total FROM referral_earnings WHERE referrer_id = ?"
    )
    .get(Number(userId)).total;
  return { invited, earnedMicros: BigInt(earned) };
}

module.exports = {
  getUser,
  getUserByReferralCode,
  upsertUser,
  attachReferrer,
  creditWallet,
  getWalletHistory,
  getReferralStats
};
