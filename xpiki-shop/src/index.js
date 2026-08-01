const { settings } = require("./db");
const { createLogger } = require("./lib/logger");
const web = require("./web/server");
const watcher = require("./services/watcher");
const auth = require("./web/auth");
const prices = require("./services/prices");

const log = createLogger("main");

async function main() {
  log.info(`Starting ${settings.get("shop_name", "xpiki api shop")}`);

  if (!auth.hasAnyAdmin()) {
    log.warn("No admin account exists yet — run: npm run create-admin");
  }
  if (!settings.get("alchemy_api_key", "").trim()) {
    log.warn("Alchemy API key is not set — crypto payments stay offline until it is");
  }

  // Loading the bot registers the notifier handlers the watcher depends on.
  require("./bot");

  web.start();
  watcher.start();

  prices.preload(["ETH", "SOL"]).catch(() => {});
}

process.on("unhandledRejection", (err) => {
  log.error(`Unhandled rejection: ${err && err.message ? err.message : err}`);
});
process.on("uncaughtException", (err) => {
  log.error(`Uncaught exception: ${err.message}`);
});
process.on("SIGTERM", () => {
  log.info("Shutting down");
  watcher.stop();
  process.exit(0);
});

main().catch((err) => {
  log.error(`Startup failed: ${err.message}`);
  process.exit(1);
});
