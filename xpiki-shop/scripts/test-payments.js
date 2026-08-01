#!/usr/bin/env node
/**
 * Payment detection test.
 *
 * Runs the real watcher against a fake chain client so the full settlement
 * path — match, confirm, credit, deliver, dedupe — is exercised without
 * touching Alchemy, TronGrid or any real network.
 *
 * Usage: node scripts/test-payments.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "xpiki-pay-"));
process.env.DATABASE_FILE = path.join(tmpDir, "pay.db");
process.env.BOT_TOKEN = "123456:TEST-TOKEN-FOR-SELFTEST";
process.env.JWT_SECRET = "selftest-secret-selftest-secret-selftest";
process.env.ADMIN_TELEGRAM_IDS = "1";

// ---------------------------------------------------------- fake chains --

const chain = {
  head: 1000,
  transfers: [],   // EVM transfers, keyed by asset at read time
  solana: [],
  tron: [],
  tronHead: 5000
};

const evmPath = require.resolve("../src/services/chains/evm");
const solanaPath = require.resolve("../src/services/chains/solana");
const tronPath = require.resolve("../src/services/chains/tron");
const pricesPath = require.resolve("../src/services/prices");

// Install the stubs into the module cache before the watcher pulls them in.
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const resolved = (() => {
    try { return Module._resolveFilename(request, parent, isMain); }
    catch (err) { return null; }
  })();

  if (resolved === evmPath) {
    return {
      getBlockNumber: async () => chain.head,
      getIncomingTransfers: async (asset, address, fromBlock, toBlock) =>
        chain.transfers.filter(
          (t) =>
            t.assetKey === asset.key &&
            t.blockNumber >= fromBlock &&
            t.blockNumber <= toBlock
        ),
      healthCheck: async () => ({ ok: true, detail: "stub" })
    };
  }
  if (resolved === solanaPath) {
    return {
      getIncomingTransfers: async (address, since) => {
        const index = since ? chain.solana.findIndex((t) => t.txHash === since) : -1;
        const fresh = chain.solana.slice(index + 1);
        return {
          transfers: fresh,
          newestSignature: chain.solana.length
            ? chain.solana[chain.solana.length - 1].txHash
            : since || ""
        };
      },
      healthCheck: async () => ({ ok: true, detail: "stub" })
    };
  }
  if (resolved === tronPath) {
    return {
      getIncomingTransfers: async (contract, address, since) => ({
        transfers: chain.tron.filter((t) => t.blockTimestamp > since),
        newestTimestamp: chain.tron.length
          ? chain.tron[chain.tron.length - 1].blockTimestamp
          : since
      }),
      getNowBlock: async () => chain.tronHead,
      getTransactionBlock: async (txId) => {
        const found = chain.tron.find((t) => t.txHash === txId);
        return found ? found.block : 0;
      },
      healthCheck: async () => ({ ok: true, detail: "stub" })
    };
  }
  if (resolved === pricesPath) {
    return {
      // Fixed quotes keep the expected amounts deterministic.
      getUsdPriceMicros: async (symbol) =>
        symbol === "ETH" ? 2500000000n : symbol === "SOL" ? 200000000n : 1000000n,
      preload: async () => {}
    };
  }
  return originalLoad.apply(this, arguments);
};

// ------------------------------------------------------------- harness --

let passed = 0;
let failed = 0;
const messages = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title) { console.log(`\n${title}`); }

async function main() {
  const { db, settings } = require("../src/db");
  const notifier = require("../src/services/notifier");
  const users = require("../src/services/users");
  const catalog = require("../src/services/catalog");
  const orders = require("../src/services/orders");
  const invoices = require("../src/services/invoices");
  const watcher = require("../src/services/watcher");

  // Capture outgoing messages instead of hitting Telegram.
  notifier.register({
    sendToUser: async (userId, text) => messages.push({ to: userId, text }),
    sendToAdmins: async (text) => messages.push({ to: "admins", text })
  });

  settings.setMany({
    alchemy_api_key: "test-key",
    wallet_address_ethereum: "0x1111111111111111111111111111111111111111",
    wallet_address_tron: "TTestTronAddressForSelfTest000000000",
    wallet_address_solana: "SoLTestAddressForSelfTest1111111111111111111",
    confirmations_ethereum: "12",
    confirmations_tron: "19",
    referral_percent: "0",
    invoice_ttl_minutes: "40"
  });

  const buyer = users.upsertUser({ id: 2001, first_name: "Payer" });

  // ------------------------------------------------------ wallet top-up --
  section("Crypto top-up on Ethereum");
  const topup = await invoices.createInvoice({
    userId: buyer.id,
    assetKey: "eth_ethereum",
    usdMicros: 100000000n, // $100 at $2500 => 0.04 ETH plus the tag
    purpose: "topup"
  });
  check("invoice opened as pending", topup.status === "pending");
  check("the address came from settings", topup.address === settings.get("wallet_address_ethereum"));

  // A payment that is on-chain but still too shallow to credit.
  chain.transfers.push({
    assetKey: "eth_ethereum",
    txHash: "0xaaa1",
    logIndex: "native",
    from: "0xsender",
    amountUnits: BigInt(topup.expected_units),
    blockNumber: chain.head - 3 // only 4 confirmations
  });
  await watcher.tick();

  let current = invoices.getInvoice(topup.id);
  check("a shallow payment is marked confirming, not paid", current.status === "confirming");
  check("no balance was credited yet", users.getUser(buyer.id).balance_micros === 0);
  check(
    "the customer was told it is confirming",
    messages.some((m) => m.to === buyer.id && /Waiting for network confirmations/.test(m.text))
  );

  // Let the chain move on so the transfer is deep enough.
  chain.head += 20;
  await watcher.tick();

  current = invoices.getInvoice(topup.id);
  check("the invoice confirms once deep enough", current.status === "confirmed");
  check("the wallet was credited the invoice's USD value", users.getUser(buyer.id).balance_micros === 100000000);
  check("the tx hash was recorded", current.tx_hash === "0xaaa1");
  check(
    "the customer was told it cleared",
    messages.some((m) => m.to === buyer.id && /Payment confirmed/.test(m.text))
  );

  section("Replays cannot double credit");
  chain.head += 5;
  await watcher.tick();
  await watcher.tick();
  check(
    "re-scanning the same transfer credits nothing extra",
    users.getUser(buyer.id).balance_micros === 100000000,
    `balance is ${users.getUser(buyer.id).balance_micros}`
  );

  // ---------------------------------------------------- wrong amounts ----
  section("A payment nobody asked for");
  const before = users.getUser(buyer.id).balance_micros;

  // The watcher only polls a chain while that chain has something to watch,
  // so this mirrors the real case: a stranger sends an odd amount while other
  // invoices are open.
  const decoy = await invoices.createInvoice({
    userId: buyer.id,
    assetKey: "eth_ethereum",
    usdMicros: 30000000n,
    purpose: "topup"
  });

  chain.transfers.push({
    assetKey: "eth_ethereum",
    txHash: "0xbbb2",
    logIndex: "native",
    from: "0xstranger",
    amountUnits: 123456789012345678n, // matches no open invoice
    blockNumber: chain.head
  });
  chain.head += 20;
  await watcher.tick();

  check("an unmatched deposit credits nobody", users.getUser(buyer.id).balance_micros === before);
  check("it leaves other open invoices alone", invoices.getInvoice(decoy.id).status === "pending");
  const unmatched = db.prepare("SELECT * FROM unmatched_deposits WHERE tx_hash = ?").get("0xbbb2");
  check("it is parked for admin review", Boolean(unmatched));
  check(
    "the amount is stored in a readable form",
    unmatched && unmatched.amount_display === "0.123456789012345678",
    unmatched && unmatched.amount_display
  );
  check(
    "the shop owner is alerted",
    messages.some((m) => m.to === "admins" && /Unmatched deposit/.test(m.text))
  );

  invoices.cancelInvoice(decoy.id, buyer.id);

  // ------------------------------------------------ paying for an order --
  section("Paying for an order with USDT on Tron");
  const categoryId = Number(
    db.prepare("INSERT INTO categories (name, kind) VALUES ('API Keys','api')").run().lastInsertRowid
  );
  const productId = Number(
    db
      .prepare(
        `INSERT INTO products (category_id, name, description_after, price_micros)
         VALUES (?, 'Claude API 50M', 'Use it with base URL https://api.example.com', 25000000)`
      )
      .run(categoryId).lastInsertRowid
  );
  catalog.addStockItems(productId, catalog.parseStockLines("sk-only-one-key", "api"));

  const order = orders.createOrder(buyer.id, productId, "", "crypto");
  const orderInvoice = await invoices.createInvoice({
    userId: buyer.id,
    assetKey: "usdt_tron",
    usdMicros: BigInt(order.total_micros),
    purpose: "order",
    orderId: order.id
  });
  // $25 of USDT is $25 plus the sub-cent uniqueness tag.
  check(
    "USDT is quoted one-to-one against USD",
    Number(orderInvoice.expected_display) >= 25 &&
      Number(orderInvoice.expected_display) < 25.001,
    orderInvoice.expected_display
  );

  chain.tron.push({
    txHash: "trx-1",
    logIndex: "trc20",
    from: "TSender",
    amountUnits: BigInt(orderInvoice.expected_units),
    blockNumber: 0,
    blockTimestamp: Date.now(),
    block: chain.tronHead - 30 // comfortably past 19 confirmations
  });
  await watcher.tick();

  const settledOrder = orders.getOrder(order.id);
  check("the order was delivered", settledOrder.status === "delivered");
  check("the key was handed over", settledOrder.delivered_text === "sk-only-one-key");
  check("stock is now empty", catalog.getProduct(productId).stock_count === 0);
  check("the invoice closed as confirmed", invoices.getInvoice(orderInvoice.id).status === "confirmed");
  check(
    "the buyer received the key",
    messages.some((m) => m.to === buyer.id && /sk-only-one-key/.test(m.text))
  );
  check(
    "the post-purchase instructions were included",
    messages.some((m) => m.to === buyer.id && /api\.example\.com/.test(m.text))
  );
  check(
    "the wallet balance was not touched for a direct crypto payment",
    users.getUser(buyer.id).balance_micros === before
  );

  section("Tron holds its cursor until confirmations arrive");
  const shallowInvoice = await invoices.createInvoice({
    userId: buyer.id,
    assetKey: "usdt_tron",
    usdMicros: 5000000n,
    purpose: "topup"
  });
  chain.tron.push({
    txHash: "trx-2",
    logIndex: "trc20",
    from: "TSender",
    amountUnits: BigInt(shallowInvoice.expected_units),
    blockNumber: 0,
    blockTimestamp: Date.now() + 1000,
    block: chain.tronHead - 2 // only 3 confirmations
  });
  await watcher.tick();
  check(
    "a shallow TRC20 payment is not credited",
    invoices.getInvoice(shallowInvoice.id).status === "confirming"
  );

  chain.tronHead += 40;
  await watcher.tick();
  check(
    "it clears once the chain moves on",
    invoices.getInvoice(shallowInvoice.id).status === "confirmed"
  );

  // ------------------------------------------------------------ solana --
  section("Solana uses finalized commitment");
  const solInvoice = await invoices.createInvoice({
    userId: buyer.id,
    assetKey: "sol_solana",
    usdMicros: 20000000n, // $20 at $200 => 0.1 SOL plus the tag
    purpose: "topup"
  });
  check("SOL amount is quoted at the configured rate", solInvoice.expected_display.startsWith("0.1"));

  const balanceBeforeSol = users.getUser(buyer.id).balance_micros;
  chain.solana.push({
    txHash: "sol-sig-1",
    logIndex: "sol",
    from: "SenderPubkey",
    amountUnits: BigInt(solInvoice.expected_units),
    blockNumber: 12345
  });
  await watcher.tick();

  check("the SOL invoice confirms in one pass", invoices.getInvoice(solInvoice.id).status === "confirmed");
  check(
    "the credit matches the invoice value",
    users.getUser(buyer.id).balance_micros === balanceBeforeSol + 20000000
  );

  // ----------------------------------------------------------- expiry ----
  section("Expiry and late payments");
  const lateInvoice = await invoices.createInvoice({
    userId: buyer.id,
    assetKey: "eth_ethereum",
    usdMicros: 50000000n,
    purpose: "topup"
  });
  db.prepare("UPDATE invoices SET expires_at = datetime('now', '-5 minutes') WHERE id = ?").run(
    lateInvoice.id
  );
  invoices.expireStaleInvoices();
  check("a stale invoice expires", invoices.getInvoice(lateInvoice.id).status === "expired");

  const balanceBeforeLate = users.getUser(buyer.id).balance_micros;
  chain.transfers.push({
    assetKey: "eth_ethereum",
    txHash: "0xccc3",
    logIndex: "native",
    from: "0xlatepayer",
    amountUnits: BigInt(lateInvoice.expected_units),
    blockNumber: chain.head
  });
  chain.head += 20;
  await watcher.tick();

  check(
    "a payment arriving after expiry is still honoured",
    invoices.getInvoice(lateInvoice.id).status === "confirmed"
  );
  check(
    "and the customer still gets their money",
    users.getUser(buyer.id).balance_micros === balanceBeforeLate + 50000000
  );

  section("Concurrent invoices stay distinct");
  const a = await invoices.createInvoice({
    userId: buyer.id, assetKey: "eth_ethereum", usdMicros: 10000000n, purpose: "topup"
  });
  const b = await invoices.createInvoice({
    userId: buyer.id, assetKey: "eth_ethereum", usdMicros: 10000000n, purpose: "topup"
  });
  check("two invoices for the same USD value ask for different amounts",
    a.expected_units !== b.expected_units);

  const balanceBeforePair = users.getUser(buyer.id).balance_micros;
  chain.transfers.push({
    assetKey: "eth_ethereum", txHash: "0xddd4", logIndex: "native", from: "0x1",
    amountUnits: BigInt(b.expected_units), blockNumber: chain.head
  });
  chain.head += 20;
  await watcher.tick();

  check("only the invoice that was paid is settled",
    invoices.getInvoice(b.id).status === "confirmed" && invoices.getInvoice(a.id).status === "pending");
  check("exactly one credit was applied",
    users.getUser(buyer.id).balance_micros === balanceBeforePair + 10000000);

  console.log(`\n${"─".repeat(52)}`);
  console.log(`${passed} passed, ${failed} failed`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nPayment test crashed:", err);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
});
