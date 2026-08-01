const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const config = require("../config");
const { db } = require("../db");
const usersService = require("../services/users");

// ------------------------------------------------------- Telegram Mini App --

/**
 * Verify the `initData` string a Mini App sends, per Telegram's spec:
 * HMAC-SHA256 of the sorted data-check-string, keyed by SHA256("WebAppData", botToken).
 * Returns the parsed user object, or null when the signature does not match.
 */
function verifyInitData(initData, maxAgeSeconds = 24 * 60 * 60) {
  if (!initData || typeof initData !== "string") return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(config.botToken)
    .digest();
  const computed = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  // Constant-time compare so a wrong hash cannot be probed byte by byte.
  const expected = Buffer.from(computed, "hex");
  const provided = Buffer.from(hash, "hex");
  if (expected.length !== provided.length) return null;
  if (!crypto.timingSafeEqual(expected, provided)) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  try {
    return JSON.parse(params.get("user") || "null");
  } catch (err) {
    return null;
  }
}

/** Express middleware: resolves req.shopUser from the Mini App init data. */
function miniAppAuth(req, res, next) {
  const initData =
    req.get("x-telegram-init-data") || (req.body && req.body.initData) || "";
  const telegramUser = verifyInitData(initData);
  if (!telegramUser || !telegramUser.id) {
    return res.status(401).json({ error: "Invalid or missing Telegram session." });
  }
  const user = usersService.upsertUser(telegramUser);
  if (user.is_blocked) {
    return res.status(403).json({ error: "This account is blocked." });
  }
  req.shopUser = user;
  next();
}

// ------------------------------------------------------------ admin panel --

const ADMIN_COOKIE = "xpiki_admin";
const SESSION_HOURS = 12;

function createAdmin(username, password) {
  const hash = bcrypt.hashSync(password, 12);
  return db
    .prepare("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)")
    .run(String(username).trim().toLowerCase(), hash);
}

function setAdminPassword(username, password) {
  const hash = bcrypt.hashSync(password, 12);
  return db
    .prepare("UPDATE admin_users SET password_hash = ? WHERE username = ?")
    .run(hash, String(username).trim().toLowerCase());
}

function verifyAdmin(username, password) {
  const record = db
    .prepare("SELECT * FROM admin_users WHERE username = ?")
    .get(String(username || "").trim().toLowerCase());
  // Always run a hash comparison so a missing user and a wrong password take
  // the same amount of time.
  const hash = record ? record.password_hash : "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
  const ok = bcrypt.compareSync(String(password || ""), hash);
  if (!record || !ok) return null;
  db.prepare("UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?").run(record.id);
  return record;
}

function issueAdminToken(admin) {
  return jwt.sign({ sub: admin.id, username: admin.username }, config.jwtSecret, {
    expiresIn: `${SESSION_HOURS}h`
  });
}

function adminAuth(req, res, next) {
  const token =
    (req.cookies && req.cookies[ADMIN_COOKIE]) ||
    (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    req.admin = jwt.verify(token, config.jwtSecret);
    next();
  } catch (err) {
    res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}

function hasAnyAdmin() {
  return db.prepare("SELECT COUNT(*) AS count FROM admin_users").get().count > 0;
}

module.exports = {
  ADMIN_COOKIE,
  SESSION_HOURS,
  verifyInitData,
  miniAppAuth,
  createAdmin,
  setAdminPassword,
  verifyAdmin,
  issueAdminToken,
  adminAuth,
  hasAnyAdmin
};
