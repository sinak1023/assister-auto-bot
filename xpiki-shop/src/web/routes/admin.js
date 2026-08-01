const express = require("express");
const { db, settings } = require("../../db");
const auth = require("../auth");
const catalog = require("../../services/catalog");
const usersService = require("../../services/users");
const notifier = require("../../services/notifier");
const ordersService = require("../../services/orders");
const { ASSET_LIST } = require("../../services/assets");
const evm = require("../../services/chains/evm");
const solana = require("../../services/chains/solana");
const tron = require("../../services/chains/tron");
const prices = require("../../services/prices");
const { microsToUsd, usdToMicros, formatUsd } = require("../../lib/money");
const { createLogger } = require("../../lib/logger");

const log = createLogger("admin");
const router = express.Router();

// ------------------------------------------------------------------- auth --

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const admin = auth.verifyAdmin(username, password);
  if (!admin) return res.status(401).json({ error: "Wrong username or password." });

  const token = auth.issueAdminToken(admin);
  res.cookie(auth.ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure || req.get("x-forwarded-proto") === "https",
    maxAge: auth.SESSION_HOURS * 60 * 60 * 1000
  });
  log.info(`Admin ${admin.username} signed in`);
  res.json({ ok: true, username: admin.username });
});

router.post("/logout", (req, res) => {
  res.clearCookie(auth.ADMIN_COOKIE);
  res.json({ ok: true });
});

// Everything below requires a valid session.
router.use(auth.adminAuth);

router.get("/session", (req, res) => res.json({ username: req.admin.username }));

router.post("/password", (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }
  if (!auth.verifyAdmin(req.admin.username, currentPassword)) {
    return res.status(400).json({ error: "Current password is wrong." });
  }
  auth.setAdminPassword(req.admin.username, newPassword);
  res.json({ ok: true });
});

// ------------------------------------------------------------- dashboard --

router.get("/stats", (req, res) => {
  const revenue = (since) =>
    BigInt(
      db
        .prepare(
          `SELECT COALESCE(SUM(total_micros), 0) AS total FROM orders
            WHERE status IN ('delivered', 'awaiting_manual', 'paid')
              AND datetime(created_at) >= datetime('now', ?)`
        )
        .get(since).total
    );

  const countOrders = (since) =>
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM orders
          WHERE status IN ('delivered', 'awaiting_manual', 'paid')
            AND datetime(created_at) >= datetime('now', ?)`
      )
      .get(since).count;

  const totalRevenue = BigInt(
    db
      .prepare(
        `SELECT COALESCE(SUM(total_micros), 0) AS total FROM orders
          WHERE status IN ('delivered', 'awaiting_manual', 'paid')`
      )
      .get().total
  );

  const topProducts = db
    .prepare(
      `SELECT product_name,
              COUNT(*) AS sales,
              COALESCE(SUM(total_micros), 0) AS revenue_micros
         FROM orders
        WHERE status IN ('delivered', 'awaiting_manual', 'paid')
        GROUP BY product_name
        ORDER BY revenue_micros DESC
        LIMIT 8`
    )
    .all()
    .map((row) => ({
      name: row.product_name,
      sales: row.sales,
      revenueUsd: microsToUsd(BigInt(row.revenue_micros))
    }));

  // Daily revenue for the last 14 days, zero-filled so the chart has no gaps.
  const rows = db
    .prepare(
      `SELECT date(created_at) AS day,
              COALESCE(SUM(total_micros), 0) AS revenue_micros,
              COUNT(*) AS sales
         FROM orders
        WHERE status IN ('delivered', 'awaiting_manual', 'paid')
          AND datetime(created_at) >= datetime('now', '-14 days')
        GROUP BY day ORDER BY day`
    )
    .all();
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const daily = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const day = new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
    const row = byDay.get(day);
    daily.push({
      day,
      revenueUsd: microsToUsd(BigInt(row ? row.revenue_micros : 0)),
      sales: row ? row.sales : 0
    });
  }

  const lowStock = db
    .prepare(
      `SELECT id, name, stock FROM (
         SELECT p.id, p.name,
                (SELECT COUNT(*) FROM stock_items s
                  WHERE s.product_id = p.id AND s.status = 'available') AS stock
           FROM products p
          WHERE p.is_active = 1 AND p.delivery_type = 'auto'
       )
        WHERE stock <= 3
        ORDER BY stock ASC LIMIT 10`
    )
    .all();

  res.json({
    revenue: {
      totalUsd: microsToUsd(totalRevenue),
      todayUsd: microsToUsd(revenue("-1 day")),
      weekUsd: microsToUsd(revenue("-7 days")),
      monthUsd: microsToUsd(revenue("-30 days"))
    },
    sales: {
      total: db
        .prepare(
          `SELECT COUNT(*) AS count FROM orders
            WHERE status IN ('delivered', 'awaiting_manual', 'paid')`
        )
        .get().count,
      today: countOrders("-1 day"),
      week: countOrders("-7 days"),
      month: countOrders("-30 days")
    },
    users: {
      total: db.prepare("SELECT COUNT(*) AS count FROM users").get().count,
      today: db
        .prepare("SELECT COUNT(*) AS count FROM users WHERE datetime(created_at) >= datetime('now', '-1 day')")
        .get().count,
      week: db
        .prepare("SELECT COUNT(*) AS count FROM users WHERE datetime(created_at) >= datetime('now', '-7 days')")
        .get().count,
      withBalance: db
        .prepare("SELECT COUNT(*) AS count FROM users WHERE balance_micros > 0")
        .get().count
    },
    pending: {
      invoices: db
        .prepare("SELECT COUNT(*) AS count FROM invoices WHERE status IN ('pending','confirming')")
        .get().count,
      unmatchedDeposits: db
        .prepare("SELECT COUNT(*) AS count FROM unmatched_deposits WHERE resolved = 0")
        .get().count,
      undeliveredOrders: db
        .prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'paid'")
        .get().count
    },
    liabilityUsd: microsToUsd(
      BigInt(db.prepare("SELECT COALESCE(SUM(balance_micros),0) AS total FROM users").get().total)
    ),
    stock: {
      available: db
        .prepare("SELECT COUNT(*) AS count FROM stock_items WHERE status = 'available'")
        .get().count,
      sold: db.prepare("SELECT COUNT(*) AS count FROM stock_items WHERE status = 'sold'").get().count
    },
    topProducts,
    daily,
    lowStock
  });
});

// ------------------------------------------------------------- categories --

router.get("/categories", (req, res) => {
  res.json({ categories: catalog.listCategories({ includeHidden: true }) });
});

router.post("/categories", (req, res) => {
  const { name, kind, emoji, sortOrder } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Category name is required." });
  }
  const result = db
    .prepare(
      "INSERT INTO categories (name, kind, emoji, sort_order) VALUES (?, ?, ?, ?)"
    )
    .run(
      String(name).trim(),
      kind === "account" ? "account" : "api",
      String(emoji || ""),
      Number(sortOrder || 0)
    );
  res.json({ id: Number(result.lastInsertRowid) });
});

router.put("/categories/:id", (req, res) => {
  const { name, kind, emoji, sortOrder, isActive } = req.body || {};
  db.prepare(
    `UPDATE categories SET name = ?, kind = ?, emoji = ?, sort_order = ?, is_active = ?
      WHERE id = ?`
  ).run(
    String(name || "").trim(),
    kind === "account" ? "account" : "api",
    String(emoji || ""),
    Number(sortOrder || 0),
    isActive ? 1 : 0,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

router.delete("/categories/:id", (req, res) => {
  db.prepare("DELETE FROM categories WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

// --------------------------------------------------------------- products --

router.get("/products", (req, res) => {
  res.json({
    products: catalog.listAllProducts().map((product) => ({
      ...product,
      priceUsd: microsToUsd(BigInt(product.price_micros))
    }))
  });
});

function productPayload(body) {
  return {
    category_id: Number(body.categoryId),
    name: String(body.name || "").trim(),
    description_before: String(body.descriptionBefore || ""),
    description_after: String(body.descriptionAfter || ""),
    price_micros: Number(usdToMicros(body.priceUsd || "0")),
    delivery_type: body.deliveryType === "manual" ? "manual" : "auto",
    manual_contact: String(body.manualContact || "").trim(),
    sort_order: Number(body.sortOrder || 0),
    is_active: body.isActive === false ? 0 : 1
  };
}

router.post("/products", (req, res) => {
  try {
    const payload = productPayload(req.body || {});
    if (!payload.name) return res.status(400).json({ error: "Product name is required." });
    if (!catalog.getCategory(payload.category_id)) {
      return res.status(400).json({ error: "Choose a valid category." });
    }
    if (payload.delivery_type === "manual" && !payload.manual_contact) {
      return res
        .status(400)
        .json({ error: "Manual delivery needs a contact handle for the buyer to message." });
    }

    const result = db
      .prepare(
        `INSERT INTO products
           (category_id, name, description_before, description_after, price_micros,
            delivery_type, manual_contact, sort_order, is_active)
         VALUES (@category_id, @name, @description_before, @description_after,
                 @price_micros, @delivery_type, @manual_contact, @sort_order, @is_active)`
      )
      .run(payload);

    const productId = Number(result.lastInsertRowid);

    // Stock can be seeded in the same request as the product.
    if (req.body.stockText && String(req.body.stockText).trim()) {
      const category = catalog.getCategory(payload.category_id);
      const items = catalog.parseStockLines(req.body.stockText, category.kind);
      catalog.addStockItems(productId, items);
    }

    res.json({ id: productId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/products/:id", (req, res) => {
  try {
    const payload = productPayload(req.body || {});
    if (payload.delivery_type === "manual" && !payload.manual_contact) {
      return res
        .status(400)
        .json({ error: "Manual delivery needs a contact handle for the buyer to message." });
    }
    db.prepare(
      `UPDATE products SET
         category_id = @category_id, name = @name,
         description_before = @description_before, description_after = @description_after,
         price_micros = @price_micros, delivery_type = @delivery_type,
         manual_contact = @manual_contact, sort_order = @sort_order, is_active = @is_active
       WHERE id = @id`
    ).run({ ...payload, id: Number(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/products/:id", (req, res) => {
  db.prepare("DELETE FROM products WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

// ------------------------------------------------------------------ stock --

router.get("/products/:id/stock", (req, res) => {
  const items = db
    .prepare(
      `SELECT s.*, u.username AS buyer_username, u.first_name AS buyer_name
         FROM stock_items s
         LEFT JOIN users u ON u.id = s.sold_to
        WHERE s.product_id = ?
        ORDER BY s.status, s.id DESC`
    )
    .all(Number(req.params.id));
  res.json({ items });
});

router.post("/products/:id/stock", (req, res) => {
  const product = catalog.getProduct(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found." });

  const items = catalog.parseStockLines(req.body.stockText || "", product.category_kind);
  if (items.length === 0) {
    return res.status(400).json({ error: "Nothing to add — paste one item per line." });
  }
  catalog.addStockItems(product.id, items);
  res.json({ added: items.length });
});

router.delete("/stock/:id", (req, res) => {
  // Sold items are kept forever: they are the delivery record for a customer.
  const item = db.prepare("SELECT * FROM stock_items WHERE id = ?").get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: "Stock item not found." });
  if (item.status === "sold") {
    return res.status(400).json({ error: "Sold items cannot be deleted." });
  }
  db.prepare("DELETE FROM stock_items WHERE id = ?").run(item.id);
  res.json({ ok: true });
});

// ----------------------------------------------------------------- orders --

router.get("/orders", (req, res) => {
  const status = req.query.status;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const where = status && status !== "all" ? "WHERE o.status = ?" : "";
  const params = status && status !== "all" ? [status, limit] : [limit];

  const rows = db
    .prepare(
      `SELECT o.*, u.username AS buyer_username, u.first_name AS buyer_name
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         ${where}
        ORDER BY o.id DESC LIMIT ?`
    )
    .all(...params);

  res.json({
    orders: rows.map((row) => ({
      ...row,
      priceUsd: microsToUsd(BigInt(row.price_micros)),
      totalUsd: microsToUsd(BigInt(row.total_micros)),
      discountUsd: microsToUsd(BigInt(row.discount_micros))
    }))
  });
});

/** Retry delivery for an order that was paid while the product was empty. */
router.post("/orders/:id/deliver", async (req, res) => {
  const order = ordersService.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (!["paid", "pending_payment"].includes(order.status)) {
    return res.status(400).json({ error: "This order is not awaiting delivery." });
  }
  try {
    const result = ordersService.settlePaidOrder(order.id);
    if (result.delivery.outOfStock) {
      return res.status(400).json({ error: "Still no stock available for this product." });
    }
    const watcher = require("../../services/watcher");
    await watcher.announceDelivery(result);
    res.json({ ok: true, order: ordersService.getOrder(order.id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Refund a paid order back to the buyer's wallet. */
router.post("/orders/:id/refund", async (req, res) => {
  const order = ordersService.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (order.status === "refunded") {
    return res.status(400).json({ error: "This order was already refunded." });
  }
  if (!["paid", "delivered", "awaiting_manual"].includes(order.status)) {
    return res.status(400).json({ error: "Only a paid order can be refunded." });
  }

  usersService.creditWallet({
    userId: order.user_id,
    amountMicros: BigInt(order.total_micros),
    type: "refund",
    description: `Refund for order #${order.id}`,
    refType: "order",
    refId: order.id
  });
  db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").run(order.id);

  await notifier.notifyUser(
    order.user_id,
    `↩️ Order #${order.id} was refunded. ${formatUsd(BigInt(order.total_micros))} is back in your wallet.`
  );
  res.json({ ok: true });
});

// ------------------------------------------------------------------ users --

router.get("/users", (req, res) => {
  const search = String(req.query.search || "").trim();
  const limit = Math.min(Number(req.query.limit || 100), 500);

  const rows = search
    ? db
        .prepare(
          `SELECT * FROM users
            WHERE CAST(id AS TEXT) LIKE ? OR username LIKE ? OR first_name LIKE ?
            ORDER BY id DESC LIMIT ?`
        )
        .all(`%${search}%`, `%${search}%`, `%${search}%`, limit)
    : db.prepare("SELECT * FROM users ORDER BY last_seen_at DESC LIMIT ?").all(limit);

  res.json({
    users: rows.map((row) => ({
      ...row,
      balanceUsd: microsToUsd(BigInt(row.balance_micros)),
      orders: db
        .prepare(
          `SELECT COUNT(*) AS count FROM orders
            WHERE user_id = ? AND status IN ('delivered','awaiting_manual','paid')`
        )
        .get(row.id).count
    }))
  });
});

router.get("/users/:id", (req, res) => {
  const user = usersService.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({
    user: { ...user, balanceUsd: microsToUsd(BigInt(user.balance_micros)) },
    orders: ordersService.listUserOrders(user.id, 50).map((order) => ({
      ...order,
      totalUsd: microsToUsd(BigInt(order.total_micros))
    })),
    wallet: usersService.getWalletHistory(user.id, 50).map((row) => ({
      ...row,
      amountUsd: microsToUsd(BigInt(row.amount_micros))
    }))
  });
});

/** Manually credit or debit a wallet, e.g. to settle an unmatched deposit. */
router.post("/users/:id/balance", async (req, res) => {
  const user = usersService.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });

  try {
    const amountMicros = usdToMicros(req.body.amountUsd);
    if (amountMicros === 0n) return res.status(400).json({ error: "Amount cannot be zero." });

    usersService.creditWallet({
      userId: user.id,
      amountMicros,
      type: "admin_adjust",
      description: String(req.body.reason || "Manual adjustment by admin")
    });

    await notifier.notifyUser(
      user.id,
      amountMicros > 0n
        ? `💰 ${formatUsd(amountMicros)} was added to your wallet by our team.`
        : `ℹ️ ${formatUsd(-amountMicros)} was deducted from your wallet by our team.`
    );
    res.json({ ok: true, balanceUsd: microsToUsd(BigInt(usersService.getUser(user.id).balance_micros)) });
  } catch (err) {
    const message =
      err.message === "INSUFFICIENT_FUNDS"
        ? "That would push the balance below zero."
        : err.message;
    res.status(400).json({ error: message });
  }
});

router.post("/users/:id/block", (req, res) => {
  db.prepare("UPDATE users SET is_blocked = ? WHERE id = ?").run(
    req.body.blocked ? 1 : 0,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

// --------------------------------------------------------------- invoices --

router.get("/invoices", (req, res) => {
  const status = req.query.status;
  const where = status && status !== "all" ? "WHERE status = ?" : "";
  const params = status && status !== "all" ? [status, 200] : [200];
  const rows = db
    .prepare(`SELECT * FROM invoices ${where} ORDER BY id DESC LIMIT ?`)
    .all(...params);
  res.json({
    invoices: rows.map((row) => ({ ...row, usd: microsToUsd(BigInt(row.usd_micros)) }))
  });
});

router.get("/deposits", (req, res) => {
  res.json({
    deposits: db
      .prepare("SELECT * FROM unmatched_deposits ORDER BY resolved, id DESC LIMIT 200")
      .all()
  });
});

/** Credit an unmatched deposit to a user and close it out. */
router.post("/deposits/:id/resolve", async (req, res) => {
  const deposit = db
    .prepare("SELECT * FROM unmatched_deposits WHERE id = ?")
    .get(Number(req.params.id));
  if (!deposit) return res.status(404).json({ error: "Deposit not found." });
  if (deposit.resolved) return res.status(400).json({ error: "Already resolved." });

  const { userId, creditUsd, note } = req.body || {};
  if (userId) {
    const user = usersService.getUser(userId);
    if (!user) return res.status(400).json({ error: "That user does not exist." });
    const amountMicros = usdToMicros(creditUsd || "0");
    if (amountMicros > 0n) {
      usersService.creditWallet({
        userId: user.id,
        amountMicros,
        type: "deposit",
        description: `Manually matched deposit ${deposit.tx_hash.slice(0, 16)}…`,
        refType: "unmatched_deposit",
        refId: deposit.id
      });
      await notifier.notifyUser(
        user.id,
        `✅ Your ${deposit.amount_display} ${deposit.asset_key.split("_")[0].toUpperCase()} deposit was credited: ${formatUsd(amountMicros)}.`
      );
    }
  }

  db.prepare(
    "UPDATE unmatched_deposits SET resolved = 1, resolved_note = ? WHERE id = ?"
  ).run(String(note || ""), deposit.id);
  res.json({ ok: true });
});

// -------------------------------------------------------- discount codes --

router.get("/discounts", (req, res) => {
  res.json({
    codes: db
      .prepare("SELECT * FROM discount_codes ORDER BY id DESC")
      .all()
      .map((row) => ({
        ...row,
        valueDisplay:
          row.type === "percent" ? `${row.value}%` : `$${microsToUsd(BigInt(row.value))}`,
        minTotalUsd: microsToUsd(BigInt(row.min_total_micros))
      }))
  });
});

router.post("/discounts", (req, res) => {
  const { code, type, value, maxUses, minTotalUsd, expiresAt } = req.body || {};
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return res.status(400).json({ error: "Code is required." });

  try {
    const storedValue =
      type === "fixed" ? Number(usdToMicros(value || "0")) : Math.round(Number(value || 0));
    if (type === "percent" && (storedValue <= 0 || storedValue > 100)) {
      return res.status(400).json({ error: "Percentage must be between 1 and 100." });
    }
    if (storedValue <= 0) return res.status(400).json({ error: "Value must be greater than zero." });

    db.prepare(
      `INSERT INTO discount_codes (code, type, value, max_uses, min_total_micros, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      clean,
      type === "fixed" ? "fixed" : "percent",
      storedValue,
      Number(maxUses || 0),
      Number(usdToMicros(minTotalUsd || "0")),
      expiresAt || null
    );
    res.json({ ok: true });
  } catch (err) {
    const message = String(err.message).includes("UNIQUE")
      ? "That code already exists."
      : err.message;
    res.status(400).json({ error: message });
  }
});

router.put("/discounts/:id", (req, res) => {
  db.prepare("UPDATE discount_codes SET is_active = ? WHERE id = ?").run(
    req.body.isActive ? 1 : 0,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

router.delete("/discounts/:id", (req, res) => {
  db.prepare("DELETE FROM discount_codes WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

// -------------------------------------------------------------- referrals --

router.get("/referrals", (req, res) => {
  res.json({
    leaderboard: db
      .prepare(
        `SELECT u.id, u.username, u.first_name,
                (SELECT COUNT(*) FROM users r WHERE r.referred_by = u.id) AS invited,
                COALESCE(SUM(e.amount_micros), 0) AS earned_micros
           FROM users u
           LEFT JOIN referral_earnings e ON e.referrer_id = u.id
          GROUP BY u.id
         HAVING invited > 0
          ORDER BY earned_micros DESC, invited DESC
          LIMIT 50`
      )
      .all()
      .map((row) => ({ ...row, earnedUsd: microsToUsd(BigInt(row.earned_micros)) }))
  });
});

// --------------------------------------------------------------- settings --

router.get("/settings", (req, res) => {
  res.json({
    settings: settings.all(),
    assets: ASSET_LIST.map((asset) => ({
      key: asset.key,
      label: asset.label,
      network: asset.networkLabel,
      addressKey: asset.settingsAddressKey,
      enabledKey: `asset_enabled_${asset.key}`
    }))
  });
});

// Keys the panel is allowed to write. Anything else is rejected outright.
const WRITABLE_SETTINGS = new Set([
  "shop_name",
  "support_username",
  "welcome_message",
  "wallet_address_ethereum",
  "wallet_address_bsc",
  "wallet_address_tron",
  "wallet_address_solana",
  "alchemy_api_key",
  "trongrid_api_key",
  "confirmations_ethereum",
  "confirmations_bsc",
  "confirmations_tron",
  "invoice_ttl_minutes",
  "min_topup_usd",
  "payment_poll_seconds",
  "referral_percent",
  "force_join_enabled",
  "required_channel",
  ...ASSET_LIST.map((asset) => `asset_enabled_${asset.key}`)
]);

router.put("/settings", (req, res) => {
  const updates = {};
  for (const [key, value] of Object.entries(req.body || {})) {
    if (WRITABLE_SETTINGS.has(key)) updates[key] = value;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Nothing to update." });
  }
  settings.setMany(updates);
  log.info(`Settings updated: ${Object.keys(updates).join(", ")}`);
  res.json({ ok: true, settings: settings.all() });
});

/** Verify that the configured providers actually answer. */
router.get("/health", async (req, res) => {
  const checks = {};
  const wanted = new Set(
    ASSET_LIST.filter((asset) => settings.get(`asset_enabled_${asset.key}`, "1") === "1").map(
      (asset) => asset.network
    )
  );

  if (wanted.has("ethereum")) checks.ethereum = await evm.healthCheck("ethereum");
  if (wanted.has("bsc")) checks.bsc = await evm.healthCheck("bsc");
  if (wanted.has("solana")) checks.solana = await solana.healthCheck();
  if (wanted.has("tron")) checks.tron = await tron.healthCheck();

  try {
    const ethPrice = await prices.getUsdPriceMicros("ETH");
    checks.prices = { ok: true, detail: `ETH ${formatUsd(ethPrice)}` };
  } catch (err) {
    checks.prices = { ok: false, detail: err.message };
  }

  res.json({ checks });
});

/** Send a message to every user who has not blocked the bot. */
router.post("/broadcast", async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "Message text is required." });

  const recipients = db.prepare("SELECT id FROM users WHERE is_blocked = 0").all();
  res.json({ queued: recipients.length });

  // Fire and forget: the panel does not wait for thousands of sends.
  (async () => {
    let sent = 0;
    for (const row of recipients) {
      await notifier.notifyUser(row.id, text);
      sent += 1;
      // Telegram allows roughly 30 messages per second to different chats.
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    log.info(`Broadcast delivered to ${sent} user(s)`);
    await notifier.notifyAdmins(`📢 Broadcast finished: ${sent} recipient(s).`);
  })().catch((err) => log.error(`Broadcast failed: ${err.message}`));
});

module.exports = router;
