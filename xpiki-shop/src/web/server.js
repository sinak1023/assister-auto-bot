const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const config = require("../config");
const { createLogger } = require("../lib/logger");
const miniappRoutes = require("./routes/miniapp");
const adminRoutes = require("./routes/admin");

const log = createLogger("web");

function createServer() {
  const app = express();

  // Behind a reverse proxy (nginx, Cloudflare) so secure cookies work.
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use((req, res, next) => {
    // The Mini App runs inside Telegram's webview, which needs framing.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });

  app.get("/health", (req, res) => res.json({ ok: true }));

  // Order matters: the mini app router is mounted on the whole /api prefix and
  // requires Telegram init data, so the admin routes must be matched first.
  app.use("/api/admin", adminRoutes);
  app.use("/api", miniappRoutes);

  const publicDir = path.join(__dirname, "public");
  app.use("/app", express.static(path.join(publicDir, "miniapp")));
  app.use("/admin", express.static(path.join(publicDir, "admin")));

  // Both front-ends are single page apps, so unknown sub-paths fall back to
  // their index file rather than 404.
  app.get("/app/*", (req, res) =>
    res.sendFile(path.join(publicDir, "miniapp", "index.html"))
  );
  app.get("/admin/*", (req, res) =>
    res.sendFile(path.join(publicDir, "admin", "index.html"))
  );
  app.get("/", (req, res) => res.redirect("/app/"));

  app.use((err, req, res, next) => {
    log.error(`${req.method} ${req.path}: ${err.message}`);
    res.status(500).json({ error: "Internal server error." });
  });

  return app;
}

function start() {
  const app = createServer();
  const server = app.listen(config.port, () => {
    log.info(`Web server listening on port ${config.port}`);
    if (config.publicUrl) {
      log.info(`Mini App:     ${config.publicUrl}/app/`);
      log.info(`Admin panel:  ${config.publicUrl}/admin/`);
    }
  });
  return server;
}

module.exports = { createServer, start };
