const path = require("path");
require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const config = {
  botToken: required("BOT_TOKEN"),
  jwtSecret: required("JWT_SECRET"),
  publicUrl: (process.env.PUBLIC_URL || "").replace(/\/+$/, ""),
  port: Number(process.env.PORT || 3000),
  databaseFile: path.resolve(process.env.DATABASE_FILE || "./data/xpiki.db"),
  adminTelegramIds: (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map(Number)
};

module.exports = config;
