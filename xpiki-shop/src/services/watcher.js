const { db, settings } = require("../db");
const { getAsset, ASSET_LIST, confirmationsFor } = require("./assets");
const evm = require("./chains/evm");
const solana = require("./chains/solana");
const tron = require("./chains/tron");
const invoices = require("./invoices");
const orders = require("./orders");
const users = require("./users");
const notifier = require("./notifier");
const { formatUnits, formatUsd } = require("../lib/money");
const { createLogger } = require("../lib/logger");

const log = createLogger("watcher");

const { LATE_PAYMENT_GRACE_HOURS } = invoices;

// Upper bound on how many blocks one tick will walk while catching up.
const MAX_CATCHUP_BLOCKS = 5000;

let timer = null;
let running = false;

// ------------------------------------------------------------- bookkeeping --

function getCursor(network) {
  const row = db.prepare("SELECT * FROM chain_cursors WHERE network = ?").get(network);
  return row || { network, last_block: 0, last_marker: "" };
}

function setCursor(network, { lastBlock, lastMarker }) {
  db.prepare(
    `INSERT INTO chain_cursors (network, last_block, last_marker, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(network) DO UPDATE SET
       last_block = excluded.last_block,
       last_marker = excluded.last_marker,
       updated_at = datetime('now')`
  ).run(
    network,
    lastBlock !== undefined ? lastBlock : getCursor(network).last_block,
    lastMarker !== undefined ? lastMarker : getCursor(network).last_marker
  );
}

/** Returns false when this exact transfer was already handled. */
function claimTransfer(assetKey, txHash, logIndex) {
  const result = db
    .prepare(
      "INSERT OR IGNORE INTO seen_transfers (asset_key, tx_hash, log_index) VALUES (?, ?, ?)"
    )
    .run(assetKey, txHash, String(logIndex || ""));
  return result.changes > 0;
}

/**
 * Find the invoice waiting for exactly this amount.
 * Expired invoices stay matchable for a grace period so a late payment is
 * still credited automatically.
 */
function findMatchingInvoice(assetKey, amountUnits) {
  return (
    db
      .prepare(
        `SELECT * FROM invoices
          WHERE asset_key = ? AND expected_units = ?
            AND (
              status IN ('pending', 'confirming')
              OR (status = 'expired'
                  AND datetime(created_at) > datetime('now', ?))
            )
          ORDER BY id LIMIT 1`
      )
      .get(assetKey, amountUnits.toString(), `-${LATE_PAYMENT_GRACE_HOURS} hours`) || null
  );
}

function recordUnmatched(asset, transfer) {
  db.prepare(
    `INSERT OR IGNORE INTO unmatched_deposits
       (asset_key, network, tx_hash, from_address, amount_units, amount_display, block_number)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    asset.key,
    asset.network,
    transfer.txHash,
    transfer.from || "",
    transfer.amountUnits.toString(),
    formatUnits(transfer.amountUnits, asset.decimals),
    transfer.blockNumber || 0
  );
}

// --------------------------------------------------------------- settlement --

/** Mark an invoice as seen on-chain but not yet deep enough to credit. */
function markConfirming(invoice, transfer, confirmations) {
  if (invoice.status !== "pending") return;
  db.prepare(
    `UPDATE invoices SET status = 'confirming', tx_hash = ?, received_units = ?,
            confirmations = ?, seen_at = datetime('now')
      WHERE id = ? AND status = 'pending'`
  ).run(transfer.txHash, transfer.amountUnits.toString(), confirmations, invoice.id);

  notifier.notifyUser(
    invoice.user_id,
    `⏳ Payment detected for invoice #${invoice.id}.\n` +
      `Waiting for network confirmations — you will be notified the moment it clears.`
  );
}

/** Credit a confirmed payment and, for order invoices, deliver the product. */
const settleInvoice = db.transaction((invoice, transfer) => {
  const fresh = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoice.id);
  if (!fresh || fresh.status === "confirmed") return null;

  db.prepare(
    `UPDATE invoices SET status = 'confirmed', tx_hash = ?, received_units = ?,
            confirmed_at = datetime('now')
      WHERE id = ?`
  ).run(transfer.txHash, transfer.amountUnits.toString(), fresh.id);

  if (fresh.purpose === "topup") {
    users.creditWallet({
      userId: fresh.user_id,
      amountMicros: BigInt(fresh.usd_micros),
      type: "deposit",
      description: `Crypto top-up via invoice #${fresh.id}`,
      refType: "invoice",
      refId: fresh.id
    });
    return { kind: "topup", invoice: fresh };
  }

  if (fresh.order_id) {
    orders.markOrderPaid(fresh.order_id, "crypto");
    return { kind: "order", invoice: fresh, orderId: fresh.order_id };
  }

  return { kind: "unknown", invoice: fresh };
});

/** Everything that happens after a payment clears, including the messages. */
async function completePayment(asset, invoice, transfer) {
  const outcome = settleInvoice(invoice, transfer);
  if (!outcome) return;

  const explorerLink = asset.explorerTx ? `${asset.explorerTx}${transfer.txHash}` : "";

  if (outcome.kind === "topup") {
    const user = users.getUser(invoice.user_id);
    await notifier.notifyUser(
      invoice.user_id,
      `✅ Payment confirmed!\n\n` +
        `Invoice #${invoice.id}\n` +
        `Received: ${invoice.expected_display} ${asset.symbol}\n` +
        `Credited: ${formatUsd(BigInt(invoice.usd_micros))}\n` +
        `New balance: ${formatUsd(BigInt(user.balance_micros))}` +
        (explorerLink ? `\n\n${explorerLink}` : "")
    );
    await notifier.notifyAdmins(
      `💰 Wallet top-up\nUser: ${invoice.user_id}\n` +
        `Amount: ${formatUsd(BigInt(invoice.usd_micros))} (${asset.label})`
    );
    return;
  }

  if (outcome.kind === "order") {
    // Delivery is deliberately outside the settlement transaction: if handing
    // over stock fails, the payment stays recorded and the admin can retry.
    const result = orders.settlePaidOrder(outcome.orderId);
    await announceDelivery(result, { explorerLink, asset });
  }
}

/** Send the buyer their goods (or the manual pickup instructions). */
async function announceDelivery(result, { explorerLink = "", asset = null } = {}) {
  const order = result.order;

  if (result.delivery.outOfStock) {
    await notifier.notifyUser(
      order.user_id,
      `✅ Payment for order #${order.id} was confirmed, but the product just sold out.\n\n` +
        `Our team has been alerted and will deliver or refund you shortly. Sorry about that!`
    );
    await notifier.notifyAdmins(
      `⚠️ OUT OF STOCK after payment!\nOrder #${order.id} — ${order.product_name}\n` +
        `User: ${order.user_id}\nRestock the product or refund the customer.`
    );
    return;
  }

  if (result.delivery.manual) {
    await notifier.notifyUser(
      order.user_id,
      `✅ Payment confirmed for order #${order.id}.\n\n${result.delivery.text}`
    );
  } else if (result.delivery.delivered) {
    const product = order.product_id ? require("./catalog").getRawProduct(order.product_id) : null;
    const after = product && product.description_after ? `\n\n${product.description_after}` : "";
    await notifier.notifyUser(
      order.user_id,
      `🎉 Order #${order.id} delivered!\n\n` +
        `${order.product_name}\n\n` +
        `<pre>${escapeHtml(result.delivery.text)}</pre>` +
        after +
        (explorerLink ? `\n\n${explorerLink}` : ""),
      { parse_mode: "HTML" }
    );
  }

  if (result.referral) {
    await notifier.notifyUser(
      result.referral.referrerId,
      `🤝 Referral bonus: ${formatUsd(result.referral.amountMicros)} was added to your wallet.`
    );
  }

  await notifier.notifyAdmins(
    `🛒 New sale\nOrder #${order.id} — ${order.product_name}\n` +
      `User: ${order.user_id}\nTotal: ${formatUsd(BigInt(order.total_micros))}` +
      (asset ? `\nPaid with: ${asset.label}` : "")
  );
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ------------------------------------------------------------- per-chain scan --

/** Route one transfer: credit it, mark it confirming, or park it for review. */
async function handleTransfer(asset, transfer, confirmations, required) {
  const invoice = findMatchingInvoice(asset.key, transfer.amountUnits);

  if (!invoice) {
    if (claimTransfer(asset.key, transfer.txHash, transfer.logIndex)) {
      recordUnmatched(asset, transfer);
      log.warn(
        `Unmatched ${asset.label} deposit ${formatUnits(transfer.amountUnits, asset.decimals)} ` +
          `(tx ${transfer.txHash})`
      );
      await notifier.notifyAdmins(
        `❓ Unmatched deposit\n${formatUnits(transfer.amountUnits, asset.decimals)} ${asset.symbol} ` +
          `on ${asset.networkLabel}\nReview it in the admin panel under Deposits.`
      );
    }
    return false;
  }

  if (confirmations < required) {
    markConfirming(invoice, transfer, confirmations);
    return false; // hold the cursor so this transfer is revisited
  }

  if (!claimTransfer(asset.key, transfer.txHash, transfer.logIndex)) return true;

  await completePayment(asset, invoice, transfer);
  return true;
}

async function scanEvmAsset(asset, openAssetKeys) {
  if (!openAssetKeys.includes(asset.key)) return;
  const address = settings.get(asset.settingsAddressKey, "").trim();
  if (!address) return;

  const head = await evm.getBlockNumber(asset.network);
  const required = confirmationsFor(asset, settings);
  const cursor = getCursor(asset.network);

  // First run: start near the head rather than replaying the whole chain.
  const fromBlock = cursor.last_block > 0 ? cursor.last_block + 1 : Math.max(head - 100, 0);
  const confirmedHead = Math.max(head - required, 0);

  // A shop can go quiet for weeks, leaving the cursor far behind. Catching up
  // is capped per tick so one scan cannot fire hundreds of RPC calls; the
  // remaining blocks are picked up by the ticks that follow.
  const confirmedTo = Math.min(confirmedHead, fromBlock + MAX_CATCHUP_BLOCKS - 1);
  const caughtUp = confirmedTo >= confirmedHead;

  if (fromBlock <= confirmedTo) {
    const transfers = await evm.getIncomingTransfers(asset, address, fromBlock, confirmedTo);
    for (const transfer of transfers) {
      await handleTransfer(asset, transfer, required, required);
    }
    setCursor(asset.network, { lastBlock: confirmedTo });
    if (!caughtUp) {
      log.info(
        `${asset.label} is catching up: at block ${confirmedTo} of ${confirmedHead}`
      );
    }
  }

  // Look at the unconfirmed tip purely to show progress to the customer.
  // Skipped while catching up, since the tip is far away and not yet relevant.
  if (caughtUp && required > 0 && head > confirmedTo) {
    try {
      const pending = await evm.getIncomingTransfers(
        asset,
        address,
        confirmedTo + 1,
        head
      );
      for (const transfer of pending) {
        const confirmations = Math.max(head - transfer.blockNumber + 1, 0);
        await handleTransfer(asset, transfer, confirmations, required);
      }
    } catch (err) {
      log.warn(`${asset.label} tip scan failed: ${err.message}`);
    }
  }
}

async function scanSolana(asset, openAssetKeys) {
  if (!openAssetKeys.includes(asset.key)) return;
  const address = settings.get(asset.settingsAddressKey, "").trim();
  if (!address) return;

  const cursor = getCursor(asset.network);
  const { transfers, newestSignature } = await solana.getIncomingTransfers(
    address,
    cursor.last_marker
  );

  // 'finalized' commitment already implies the transfer cannot be rolled back.
  for (const transfer of transfers) {
    await handleTransfer(asset, transfer, 1, 0);
  }

  if (newestSignature && newestSignature !== cursor.last_marker) {
    setCursor(asset.network, { lastMarker: newestSignature });
  }
}

async function scanTron(asset, openAssetKeys) {
  if (!openAssetKeys.includes(asset.key)) return;
  const address = settings.get(asset.settingsAddressKey, "").trim();
  if (!address) return;

  const cursor = getCursor(asset.network);
  const since = Number(cursor.last_marker || 0);
  const { transfers } = await tron.getIncomingTransfers(asset.contract, address, since);
  if (transfers.length === 0) return;

  const required = confirmationsFor(asset, settings);
  const head = await tron.getNowBlock();

  let advanceTo = since;
  for (const transfer of transfers) {
    const block = await tron.getTransactionBlock(transfer.txHash);
    const confirmations = block > 0 && head > 0 ? Math.max(head - block + 1, 0) : 0;
    const finished = await handleTransfer(asset, transfer, confirmations, required);
    // Hold the cursor at the first transfer that still needs confirmations so
    // the next tick picks it up again.
    if (!finished) break;
    advanceTo = Math.max(advanceTo, transfer.blockTimestamp || 0);
  }

  if (advanceTo > since) setCursor(asset.network, { lastMarker: String(advanceTo) });
}

// ------------------------------------------------------------------- runner --

async function tick() {
  if (running) return;
  running = true;
  try {
    const expired = invoices.expireStaleInvoices();
    if (expired > 0) log.info(`Expired ${expired} stale invoice(s)`);

    const openAssetKeys = invoices.assetsNeedingScan();
    if (openAssetKeys.length === 0) return;

    if (!settings.get("alchemy_api_key", "").trim()) {
      log.warn("Alchemy API key is not set — skipping payment scan");
      return;
    }

    for (const asset of ASSET_LIST) {
      if (settings.get(`asset_enabled_${asset.key}`, "1") !== "1") continue;
      try {
        if (asset.chain === "evm") await scanEvmAsset(asset, openAssetKeys);
        else if (asset.chain === "solana") await scanSolana(asset, openAssetKeys);
        else if (asset.chain === "tron") await scanTron(asset, openAssetKeys);
      } catch (err) {
        log.error(`${asset.label} scan failed: ${err.message}`);
      }
    }
  } catch (err) {
    log.error(`Watcher tick failed: ${err.message}`);
  } finally {
    running = false;
  }
}

function start() {
  const seconds = Math.max(15, settings.getNumber("payment_poll_seconds", 45));
  log.info(`Payment watcher started (polling every ${seconds}s)`);
  timer = setInterval(tick, seconds * 1000);
  // Give the process a moment to finish booting before the first scan.
  setTimeout(tick, 5000);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick, announceDelivery };
