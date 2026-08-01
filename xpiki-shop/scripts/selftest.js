#!/usr/bin/env node
/**
 * End-to-end self test.
 *
 * Exercises the money maths, the catalogue, wallet checkout, referral payout,
 * discount codes, invoice amount tagging and the admin HTTP API against a
 * throwaway database. No Telegram connection and no blockchain calls.
 *
 * Usage: node scripts/selftest.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

// Point the app at a scratch database before anything loads config.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "xpiki-test-"));
process.env.DATABASE_FILE = path.join(tmpDir, "test.db");
process.env.BOT_TOKEN = process.env.BOT_TOKEN || "123456:TEST-TOKEN-FOR-SELFTEST";
process.env.JWT_SECRET = "selftest-secret-selftest-secret-selftest";
process.env.PORT = "0";
process.env.ADMIN_TELEGRAM_IDS = "1";

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function main() {
  const money = require("../src/lib/money");
  const { db, settings } = require("../src/db");
  const catalog = require("../src/services/catalog");
  const users = require("../src/services/users");
  const orders = require("../src/services/orders");
  const invoicesService = require("../src/services/invoices");
  const { getAsset } = require("../src/services/assets");
  const auth = require("../src/web/auth");

  // ------------------------------------------------------------ money ----
  section("Money maths");
  check("usdToMicros parses decimals", money.usdToMicros("12.34") === 12340000n);
  check("usdToMicros handles thousands separators", money.usdToMicros("1,299.99") === 1299990000n);
  check("microsToUsd renders two decimals", money.microsToUsd(12340000n) === "12.34");
  check("formatUsd adds a currency symbol", money.formatUsd(1299990000n) === "$1,299.99");
  check("parseUnits scales to token decimals", money.parseUnits("1.5", 6) === 1500000n);
  check("formatUnits trims trailing zeros", money.formatUnits(1500000n, 6) === "1.5");
  check(
    "parseUnits truncates excess precision instead of throwing",
    money.parseUnits("1.1234567", 6) === 1123456n
  );
  check(
    "roundUpToPrecision rounds up, never down",
    money.roundUpToPrecision(1000000000000000001n, 18, 8) === 1000000010000000000n
  );

  // ---------------------------------------------------------- catalogue ----
  section("Catalogue and stock");
  const categoryId = Number(
    db.prepare("INSERT INTO categories (name, kind) VALUES (?, ?)").run("API Keys", "api")
      .lastInsertRowid
  );
  const accountCategoryId = Number(
    db.prepare("INSERT INTO categories (name, kind) VALUES (?, ?)").run("Accounts", "account")
      .lastInsertRowid
  );

  const productId = Number(
    db
      .prepare(
        `INSERT INTO products (category_id, name, description_before, price_micros)
         VALUES (?, ?, ?, ?)`
      )
      .run(categoryId, "Claude API — 50M tokens", "Fifty million tokens.", 50000000)
      .lastInsertRowid
  );

  catalog.addStockItems(
    productId,
    catalog.parseStockLines("sk-ant-key-one\nsk-ant-key-two\nsk-ant-key-three", "api")
  );
  check("stock rows were inserted", catalog.getProduct(productId).stock_count === 3);

  const accountLines = catalog.parseStockLines(
    "buyer@mail.com:hunter2\nsecond@mail.com|pass word",
    "account"
  );
  check(
    "account lines split into username and password",
    accountLines[0].username === "buyer@mail.com" &&
      accountLines[0].password === "hunter2" &&
      accountLines[1].password === "pass word"
  );

  const accountProductId = Number(
    db
      .prepare("INSERT INTO products (category_id, name, price_micros) VALUES (?, ?, ?)")
      .run(accountCategoryId, "ChatGPT Plus account", 20000000).lastInsertRowid
  );
  catalog.addStockItems(accountProductId, accountLines);

  // ------------------------------------------------------ wallet buying ----
  section("Wallet checkout");
  const buyer = users.upsertUser({ id: 1001, first_name: "Buyer", username: "buyer" });
  const referrer = users.upsertUser({ id: 1002, first_name: "Referrer", username: "ref" });
  users.attachReferrer(buyer.id, referrer.referral_code);
  check("referral link was recorded", users.getUser(buyer.id).referred_by === referrer.id);
  check(
    "self referral is rejected",
    users.attachReferrer(referrer.id, referrer.referral_code) === null
  );

  users.creditWallet({
    userId: buyer.id,
    amountMicros: 100000000n, // $100
    type: "deposit",
    description: "Test top-up"
  });
  check("wallet was credited", users.getUser(buyer.id).balance_micros === 100000000);

  let insufficientRejected = false;
  try {
    users.creditWallet({ userId: buyer.id, amountMicros: -999000000n, type: "purchase" });
  } catch (err) {
    insufficientRejected = err.message === "INSUFFICIENT_FUNDS";
  }
  check("overdrawing a wallet is refused", insufficientRejected);

  settings.set("referral_percent", "10");
  const order = orders.createOrder(buyer.id, productId, "", "wallet");
  orders.payFromWallet(order.id);
  const settled = orders.settlePaidOrder(order.id);

  check("order reached delivered state", settled.order.status === "delivered");
  check("a stock item was handed over", Boolean(settled.delivery.item));
  check("stock count dropped by one", catalog.getProduct(productId).stock_count === 2);
  check(
    "buyer was charged the order total",
    users.getUser(buyer.id).balance_micros === 100000000 - 50000000
  );
  check(
    "referrer earned 10% commission",
    users.getUser(referrer.id).balance_micros === 5000000,
    `got ${users.getUser(referrer.id).balance_micros}`
  );

  // A second settle must not hand over another key or pay twice.
  const balanceBefore = users.getUser(referrer.id).balance_micros;
  orders.settlePaidOrder(order.id);
  check("re-settling does not consume more stock", catalog.getProduct(productId).stock_count === 2);
  check(
    "re-settling does not pay the commission twice",
    users.getUser(referrer.id).balance_micros === balanceBefore
  );

  section("Each key is sold exactly once");
  const secondBuyer = users.upsertUser({ id: 1003, first_name: "Second" });
  users.creditWallet({ userId: secondBuyer.id, amountMicros: 100000000n, type: "deposit" });
  const order2 = orders.createOrder(secondBuyer.id, productId, "", "wallet");
  orders.payFromWallet(order2.id);
  const settled2 = orders.settlePaidOrder(order2.id);
  check(
    "second buyer received a different key",
    settled2.delivery.item.id !== settled.delivery.item.id
  );
  const soldKeys = db
    .prepare("SELECT content, COUNT(*) AS uses FROM stock_items WHERE status='sold' GROUP BY content")
    .all();
  check("no key is recorded against two orders", soldKeys.every((row) => row.uses === 1));

  section("Out of stock after payment");
  // Drain the product, then pay for it: the order must stay 'paid', not vanish.
  db.prepare("UPDATE stock_items SET status='reserved' WHERE product_id=? AND status='available'").run(
    productId
  );
  const thirdBuyer = users.upsertUser({ id: 1004, first_name: "Third" });
  users.creditWallet({ userId: thirdBuyer.id, amountMicros: 100000000n, type: "deposit" });
  const order3 = db
    .prepare(
      `INSERT INTO orders (user_id, product_id, product_name, price_micros, total_micros, status)
       VALUES (?, ?, ?, ?, ?, 'paid')`
    )
    .run(thirdBuyer.id, productId, "Claude API — 50M tokens", 50000000, 50000000);
  const drained = orders.settlePaidOrder(Number(order3.lastInsertRowid));
  check("empty stock is reported rather than delivering nothing", drained.delivery.outOfStock === true);
  check("the order stays payable for admin follow-up", drained.order.status === "paid");
  db.prepare("UPDATE stock_items SET status='available' WHERE status='reserved'").run();

  // ----------------------------------------------------------- discounts ----
  section("Discount codes");
  db.prepare(
    "INSERT INTO discount_codes (code, type, value, max_uses) VALUES ('SAVE10', 'percent', 10, 1)"
  ).run();
  const quoted = orders.quote(buyer.id, productId, "SAVE10");
  check("percentage discount is applied", quoted.discountMicros === 5000000n);
  check("total reflects the discount", quoted.totalMicros === 45000000n);

  const discountedOrder = orders.createOrder(buyer.id, productId, "SAVE10", "wallet");
  check("order stores the discounted total", discountedOrder.total_micros === 45000000);
  const reuse = orders.quote(buyer.id, productId, "SAVE10");
  check("a used code is refused for the same customer", reuse.discountMicros === 0n);
  check("the refusal explains itself", Boolean(reuse.discountError));
  orders.cancelOrder(discountedOrder.id);

  const bogus = orders.quote(buyer.id, productId, "NOPE");
  check("an unknown code leaves the price untouched", bogus.totalMicros === 50000000n);

  // ------------------------------------------------------------ invoices ----
  section("Invoice amount tagging");
  const usdt = getAsset("usdt_tron");
  const oneDollarRate = 1000000n;
  const amounts = new Set();
  for (let tag = 1; tag <= 50; tag += 1) {
    amounts.add(invoicesService.computeAmount(usdt, 25000000n, oneDollarRate, tag).toString());
  }
  check("every tag produces a distinct amount", amounts.size === 50);

  const tagged = invoicesService.computeAmount(usdt, 25000000n, oneDollarRate, 7);
  check("the tag lands in the final digits", money.formatUnits(tagged, 6) === "25.000007");

  const eth = getAsset("eth_ethereum");
  const ethAmount = invoicesService.computeAmount(eth, 100000000n, 2500000000n, 42);
  // $100 at $2500 = 0.04 ETH, plus the tag at the 8th decimal.
  check(
    "ETH amounts round up and carry the tag",
    money.formatUnits(ethAmount, 18) === "0.04000042",
    money.formatUnits(ethAmount, 18)
  );

  const bsc = getAsset("usdt_bsc");
  const bscAmount = invoicesService.computeAmount(bsc, 10000000n, 1000000n, 3);
  check(
    "18-decimal BEP20 USDT still quotes 6 decimals",
    money.formatUnits(bscAmount, 18) === "10.000003",
    money.formatUnits(bscAmount, 18)
  );

  // Rounding must never favour the customer.
  const awkward = invoicesService.computeAmount(eth, 33330000n, 3333330000n, 1);
  check("amounts always round up", awkward >= (33330000n * 10n ** 18n) / 3333330000n);

  // ---------------------------------------------------------- initData ----
  section("Mini App authentication");
  const crypto = require("crypto");
  const botToken = process.env.BOT_TOKEN;
  function signInitData(fields) {
    const dataCheckString = Object.keys(fields)
      .sort()
      .map((key) => `${key}=${fields[key]}`)
      .join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
    const params = new URLSearchParams(fields);
    params.set("hash", hash);
    return params.toString();
  }

  const validInit = signInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAA",
    user: JSON.stringify({ id: 1001, first_name: "Buyer" })
  });
  check("a correctly signed initData is accepted", auth.verifyInitData(validInit) !== null);
  check("a tampered hash is rejected", auth.verifyInitData(validInit.replace(/hash=.*/, "hash=" + "0".repeat(64))) === null);
  check("missing initData is rejected", auth.verifyInitData("") === null);

  const staleInit = signInitData({
    auth_date: String(Math.floor(Date.now() / 1000) - 90000),
    user: JSON.stringify({ id: 1001, first_name: "Buyer" })
  });
  check("an expired initData is rejected", auth.verifyInitData(staleInit) === null);

  // -------------------------------------------------------- admin HTTP ----
  section("Admin HTTP API");
  auth.createAdmin("owner", "supersecret123");
  check("wrong password is refused", auth.verifyAdmin("owner", "wrong") === null);
  check("correct password is accepted", auth.verifyAdmin("owner", "supersecret123") !== null);

  const { createServer } = require("../src/web/server");
  const app = createServer();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, path, { body, cookie } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: Object.assign(
        { "content-type": "application/json" },
        cookie ? { cookie } : {}
      ),
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    let json = {};
    try { json = JSON.parse(text); } catch (err) { /* non-JSON body */ }
    return { status: response.status, json, headers: response.headers };
  }

  const unauth = await request("GET", "/api/admin/stats");
  check("admin routes reject anonymous callers", unauth.status === 401);

  const badLogin = await request("POST", "/api/admin/login", {
    body: { username: "owner", password: "nope" }
  });
  check("bad credentials are refused", badLogin.status === 401);

  const login = await request("POST", "/api/admin/login", {
    body: { username: "owner", password: "supersecret123" }
  });
  check("login succeeds with the right password", login.status === 200);

  const setCookie = login.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  check("a session cookie is issued", cookie.startsWith("xpiki_admin="));
  check("the session cookie is httpOnly", /httponly/i.test(setCookie));

  const stats = await request("GET", "/api/admin/stats", { cookie });
  check("dashboard stats load", stats.status === 200);
  check("revenue is counted", Number(stats.json.revenue.totalUsd) > 0, JSON.stringify(stats.json.revenue));
  check("customers are counted", stats.json.users.total >= 4);
  check("the daily chart is zero filled to 14 points", stats.json.daily.length === 14);
  check("wallet liability is reported", stats.json.liabilityUsd !== undefined);

  const productList = await request("GET", "/api/admin/products", { cookie });
  check("products are listed", productList.json.products.length === 2);

  const created = await request("POST", "/api/admin/products", {
    cookie,
    body: {
      categoryId,
      name: "GPT-4 API — 10M tokens",
      priceUsd: "19.99",
      descriptionBefore: "Ten million tokens.",
      descriptionAfter: "Base URL: https://api.example.com",
      deliveryType: "auto",
      stockText: "gpt-key-1\ngpt-key-2"
    }
  });
  check("a product can be created with stock in one call", created.status === 200);
  check(
    "the seeded stock landed",
    catalog.getProduct(created.json.id).stock_count === 2
  );
  check(
    "the price survived the round trip",
    catalog.getProduct(created.json.id).price_micros === 19990000
  );

  const manualMissingContact = await request("POST", "/api/admin/products", {
    cookie,
    body: { categoryId, name: "Manual thing", priceUsd: "5", deliveryType: "manual" }
  });
  check("manual delivery without a contact is rejected", manualMissingContact.status === 400);

  const settingsWrite = await request("PUT", "/api/admin/settings", {
    cookie,
    body: { shop_name: "xpiki api shop", referral_percent: "7", evil_key: "should be ignored" }
  });
  check("settings save", settingsWrite.status === 200);
  check("referral percent was stored", settings.get("referral_percent") === "7");
  check("unknown setting keys are ignored", settings.get("evil_key", "") === "");

  const soldItem = db.prepare("SELECT id FROM stock_items WHERE status='sold' LIMIT 1").get();
  const deleteSold = await request("DELETE", `/api/admin/stock/${soldItem.id}`, { cookie });
  check("a sold key cannot be deleted", deleteSold.status === 400);

  const refund = await request("POST", `/api/admin/orders/${order.id}/refund`, { cookie });
  check("a delivered order can be refunded", refund.status === 200);
  // $100 deposited, $50 spent on the only paid order, $50 back on refund.
  check(
    "the refund reached the wallet",
    users.getUser(buyer.id).balance_micros === 100000000,
    `balance is ${users.getUser(buyer.id).balance_micros}`
  );
  const doubleRefund = await request("POST", `/api/admin/orders/${order.id}/refund`, { cookie });
  check("a refund cannot be issued twice", doubleRefund.status === 400);

  const anonMini = await request("GET", "/api/me");
  check("mini app routes reject callers without initData", anonMini.status === 401);

  await new Promise((resolve) => server.close(resolve));

  // ------------------------------------------------------------- results ----
  console.log(`\n${"─".repeat(52)}`);
  console.log(`${passed} passed, ${failed} failed`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nSelf test crashed:", err);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
});
