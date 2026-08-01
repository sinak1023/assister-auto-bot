const { db, settings } = require("../db");
const catalog = require("./catalog");
const discounts = require("./discounts");
const users = require("./users");
const { formatUsd } = require("../lib/money");
const { createLogger } = require("../lib/logger");

const log = createLogger("orders");

const stmtOrder = db.prepare("SELECT * FROM orders WHERE id = ?");
const stmtUserOrders = db.prepare(
  "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT ?"
);

/**
 * Price an order before it exists, so the bot and the mini app can show the
 * exact same numbers on the confirmation screen.
 */
function quote(userId, productId, discountCode) {
  const product = catalog.getProduct(productId);
  if (!product) return { ok: false, reason: "Product not found." };
  if (!catalog.isPurchasable(product)) {
    return { ok: false, reason: "This product is currently out of stock." };
  }

  const priceMicros = BigInt(product.price_micros);
  let discountMicros = 0n;
  let codeRecord = null;
  let discountError = null;

  if (discountCode) {
    const evaluated = discounts.evaluate(discountCode, userId, priceMicros);
    if (evaluated.ok) {
      discountMicros = evaluated.discountMicros;
      codeRecord = evaluated.code;
    } else {
      discountError = evaluated.reason;
    }
  }

  return {
    ok: true,
    product,
    priceMicros,
    discountMicros,
    totalMicros: priceMicros - discountMicros,
    codeRecord,
    discountError
  };
}

/** Create a pending order. Nothing is charged and no stock is reserved yet. */
const createOrder = db.transaction((userId, productId, discountCode, paymentMethod) => {
  const priced = quote(userId, productId, discountCode);
  if (!priced.ok) throw new Error(priced.reason);

  const result = db
    .prepare(
      `INSERT INTO orders
         (user_id, product_id, product_name, category_kind, price_micros,
          discount_code, discount_micros, total_micros, payment_method, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment')`
    )
    .run(
      Number(userId),
      priced.product.id,
      priced.product.name,
      priced.product.category_kind,
      Number(priced.priceMicros),
      priced.codeRecord ? priced.codeRecord.code : "",
      Number(priced.discountMicros),
      Number(priced.totalMicros),
      paymentMethod
    );

  const orderId = Number(result.lastInsertRowid);
  if (priced.codeRecord) discounts.consume(priced.codeRecord.id, userId, orderId);

  return stmtOrder.get(orderId);
});

/**
 * Hand over one stock item and close the order.
 * The stock claim is a conditional UPDATE, so the same key can never be
 * written to two different orders even if two payments settle together.
 */
const deliverOrder = db.transaction((orderId) => {
  const order = stmtOrder.get(Number(orderId));
  if (!order) throw new Error("Order not found.");
  if (order.status === "delivered" || order.status === "awaiting_manual") {
    return { alreadyHandled: true, order };
  }

  const product = catalog.getRawProduct(order.product_id);

  // Manual products are collected by messaging a contact, so there is nothing
  // to pull from stock.
  if (product && product.delivery_type === "manual") {
    const contact = product.manual_contact || settings.get("support_username", "");
    const text =
      `Your order is confirmed. To collect it, send this message to ${contact}:\n\n` +
      `Order #${order.id} — ${order.product_name}`;
    db.prepare(
      `UPDATE orders SET status = 'awaiting_manual', delivered_text = ?,
              delivered_at = datetime('now') WHERE id = ?`
    ).run(text, order.id);
    return { manual: true, contact, text, order: stmtOrder.get(order.id) };
  }

  const claim = db
    .prepare(
      `UPDATE stock_items
          SET status = 'sold', order_id = ?, sold_to = ?, sold_at = datetime('now')
        WHERE id = (
          SELECT id FROM stock_items
           WHERE product_id = ? AND status = 'available'
           ORDER BY id LIMIT 1
        )
          AND status = 'available'`
    )
    .run(order.id, order.user_id, order.product_id);

  if (claim.changes === 0) {
    // Paid but nothing left to give. The order stays 'paid' so the admin sees
    // it in the pending queue and can restock or refund.
    db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(order.id);
    return { outOfStock: true, order: stmtOrder.get(order.id) };
  }

  const item = db.prepare("SELECT * FROM stock_items WHERE order_id = ? ORDER BY id DESC LIMIT 1")
    .get(order.id);

  const text =
    item.username && item.password
      ? `Username: ${item.username}\nPassword: ${item.password}`
      : item.content;

  db.prepare(
    `UPDATE orders SET status = 'delivered', delivered_text = ?,
            delivered_at = datetime('now') WHERE id = ?`
  ).run(text, order.id);

  return { delivered: true, item, text, order: stmtOrder.get(order.id) };
});

/** Pay a referrer their cut. Runs once per order thanks to the UNIQUE index. */
function payReferralCommission(order) {
  const percent = settings.getNumber("referral_percent", 0);
  if (percent <= 0) return null;

  const buyer = users.getUser(order.user_id);
  if (!buyer || !buyer.referred_by) return null;

  const commission = (BigInt(order.total_micros) * BigInt(Math.round(percent))) / 100n;
  if (commission <= 0n) return null;

  try {
    db.prepare(
      `INSERT INTO referral_earnings (referrer_id, referred_id, order_id, amount_micros)
       VALUES (?, ?, ?, ?)`
    ).run(buyer.referred_by, buyer.id, order.id, Number(commission));
  } catch (err) {
    // UNIQUE(order_id) violation means the commission was already paid.
    return null;
  }

  users.creditWallet({
    userId: buyer.referred_by,
    amountMicros: commission,
    type: "referral",
    description: `Referral commission from order #${order.id}`,
    refType: "order",
    refId: order.id
  });

  return { referrerId: buyer.referred_by, amountMicros: commission };
}

/** Mark an order paid. Safe to call twice; the second call is a no-op. */
const markOrderPaid = db.transaction((orderId, method) => {
  const order = stmtOrder.get(Number(orderId));
  if (!order) throw new Error("Order not found.");
  if (order.status !== "pending_payment") return order;
  db.prepare(
    `UPDATE orders SET status = 'paid', payment_method = ?, paid_at = datetime('now')
      WHERE id = ?`
  ).run(method || order.payment_method, order.id);
  return stmtOrder.get(order.id);
});

/**
 * Charge the user's wallet and deliver in one shot.
 * Throws INSUFFICIENT_FUNDS when the balance does not cover the total.
 */
const payFromWallet = db.transaction((orderId) => {
  const order = stmtOrder.get(Number(orderId));
  if (!order) throw new Error("Order not found.");
  if (order.status !== "pending_payment") throw new Error("This order is no longer payable.");

  users.creditWallet({
    userId: order.user_id,
    amountMicros: -BigInt(order.total_micros),
    type: "purchase",
    description: `Order #${order.id} — ${order.product_name}`,
    refType: "order",
    refId: order.id
  });

  db.prepare(
    `UPDATE orders SET status = 'paid', payment_method = 'wallet',
            paid_at = datetime('now') WHERE id = ?`
  ).run(order.id);

  return stmtOrder.get(order.id);
});

/**
 * The full post-payment pipeline: deliver the goods and pay any commission.
 * Used by both the wallet checkout and the crypto payment watcher.
 */
function settlePaidOrder(orderId) {
  const delivery = deliverOrder(orderId);
  const order = stmtOrder.get(Number(orderId));
  let referral = null;
  try {
    referral = payReferralCommission(order);
  } catch (err) {
    log.error(`Referral payout failed for order ${orderId}: ${err.message}`);
  }
  return { delivery, order: stmtOrder.get(Number(orderId)), referral };
}

function cancelOrder(orderId, status = "canceled") {
  db.prepare("UPDATE orders SET status = ? WHERE id = ? AND status = 'pending_payment'").run(
    status,
    Number(orderId)
  );
  return stmtOrder.get(Number(orderId));
}

function getOrder(orderId) {
  return stmtOrder.get(Number(orderId)) || null;
}

function listUserOrders(userId, limit = 25) {
  return stmtUserOrders.all(Number(userId), limit);
}

/** Human readable summary used by the bot and the mini app. */
function describeOrder(order) {
  const lines = [
    `Order #${order.id}`,
    `Product: ${order.product_name}`,
    `Total: ${formatUsd(BigInt(order.total_micros))}`
  ];
  if (order.discount_micros > 0) {
    lines.push(`Discount (${order.discount_code}): -${formatUsd(BigInt(order.discount_micros))}`);
  }
  return lines.join("\n");
}

module.exports = {
  quote,
  createOrder,
  deliverOrder,
  markOrderPaid,
  payFromWallet,
  settlePaidOrder,
  payReferralCommission,
  cancelOrder,
  getOrder,
  listUserOrders,
  describeOrder
};
