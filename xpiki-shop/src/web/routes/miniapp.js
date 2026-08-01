const express = require("express");
const { settings } = require("../../db");
const { miniAppAuth } = require("../auth");
const catalog = require("../../services/catalog");
const orders = require("../../services/orders");
const invoices = require("../../services/invoices");
const users = require("../../services/users");
const watcher = require("../../services/watcher");
const discounts = require("../../services/discounts");
const { getAsset } = require("../../services/assets");
const { microsToUsd, usdToMicros } = require("../../lib/money");
const { createLogger } = require("../../lib/logger");

const log = createLogger("api");
const router = express.Router();

router.use(miniAppAuth);

/** Shape a product for the client, hiding anything the buyer should not see. */
function publicProduct(product) {
  return {
    id: product.id,
    categoryId: product.category_id,
    categoryKind: product.category_kind,
    categoryName: product.category_name,
    name: product.name,
    descriptionBefore: product.description_before,
    priceUsd: microsToUsd(BigInt(product.price_micros)),
    deliveryType: product.delivery_type,
    stockCount: product.delivery_type === "manual" ? null : product.stock_count,
    purchasable: catalog.isPurchasable(product)
  };
}

function publicOrder(order) {
  return {
    id: order.id,
    productName: order.product_name,
    categoryKind: order.category_kind,
    priceUsd: microsToUsd(BigInt(order.price_micros)),
    discountUsd: microsToUsd(BigInt(order.discount_micros)),
    discountCode: order.discount_code,
    totalUsd: microsToUsd(BigInt(order.total_micros)),
    status: order.status,
    paymentMethod: order.payment_method,
    deliveredText: ["delivered", "awaiting_manual"].includes(order.status)
      ? order.delivered_text
      : "",
    createdAt: order.created_at,
    deliveredAt: order.delivered_at
  };
}

function publicInvoice(invoice) {
  const asset = getAsset(invoice.asset_key);
  return {
    id: invoice.id,
    purpose: invoice.purpose,
    orderId: invoice.order_id,
    asset: asset ? asset.label : invoice.asset_key,
    symbol: asset ? asset.symbol : "",
    network: asset ? asset.networkLabel : invoice.network,
    amount: invoice.expected_display,
    address: invoice.address,
    usd: microsToUsd(BigInt(invoice.usd_micros)),
    rate: invoices.describeRate(invoice),
    status: invoice.status,
    txHash: invoice.tx_hash,
    explorerTx: asset && invoice.tx_hash ? asset.explorerTx + invoice.tx_hash : "",
    createdAt: invoice.created_at,
    expiresAt: invoice.expires_at
  };
}

// ------------------------------------------------------------------ routes --

router.get("/me", (req, res) => {
  const user = users.getUser(req.shopUser.id);
  const stats = users.getReferralStats(user.id);
  res.json({
    id: user.id,
    firstName: user.first_name,
    username: user.username,
    balanceUsd: microsToUsd(BigInt(user.balance_micros)),
    referralCode: user.referral_code,
    referralPercent: settings.getNumber("referral_percent", 0),
    referralInvited: stats.invited,
    referralEarnedUsd: microsToUsd(stats.earnedMicros),
    shopName: settings.get("shop_name", "xpiki api shop"),
    supportUsername: settings.get("support_username", ""),
    minTopupUsd: settings.get("min_topup_usd", "1"),
    botUsername: settings.get("bot_username", "")
  });
});

router.get("/catalog", (req, res) => {
  const categories = catalog.listCategories().map((category) => ({
    id: category.id,
    name: category.name,
    kind: category.kind,
    emoji: category.emoji,
    products: catalog.listProducts(category.id).map(publicProduct)
  }));
  res.json({ categories });
});

router.get("/products/:id", (req, res) => {
  const product = catalog.getProduct(req.params.id);
  if (!product || !product.is_active) {
    return res.status(404).json({ error: "Product not found." });
  }
  res.json(publicProduct(product));
});

router.get("/payment-options", (req, res) => {
  res.json({ options: invoices.listPaymentOptions() });
});

/** Preview a purchase, optionally with a discount code applied. */
router.post("/quote", (req, res) => {
  const quote = orders.quote(req.shopUser.id, req.body.productId, req.body.discountCode);
  if (!quote.ok) return res.status(400).json({ error: quote.reason });
  res.json({
    product: publicProduct(quote.product),
    priceUsd: microsToUsd(quote.priceMicros),
    discountUsd: microsToUsd(quote.discountMicros),
    totalUsd: microsToUsd(quote.totalMicros),
    discountError: quote.discountError || null,
    balanceUsd: microsToUsd(BigInt(users.getUser(req.shopUser.id).balance_micros))
  });
});

router.post("/orders", (req, res) => {
  try {
    const order = orders.createOrder(
      req.shopUser.id,
      req.body.productId,
      req.body.discountCode || "",
      "wallet"
    );
    res.json(publicOrder(order));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/orders", (req, res) => {
  res.json({ orders: orders.listUserOrders(req.shopUser.id, 50).map(publicOrder) });
});

/** Pay an open order out of the wallet balance and deliver immediately. */
router.post("/orders/:id/pay-wallet", async (req, res) => {
  const order = orders.getOrder(req.params.id);
  if (!order || order.user_id !== req.shopUser.id) {
    return res.status(404).json({ error: "Order not found." });
  }
  try {
    orders.payFromWallet(order.id);
  } catch (err) {
    const message =
      err.message === "INSUFFICIENT_FUNDS"
        ? "Your wallet balance does not cover this order."
        : err.message;
    return res.status(400).json({ error: message });
  }

  const result = orders.settlePaidOrder(order.id);
  await watcher.announceDelivery(result);
  res.json({
    order: publicOrder(result.order),
    balanceUsd: microsToUsd(BigInt(users.getUser(req.shopUser.id).balance_micros))
  });
});

/** Open a crypto invoice, either for an order or to top the wallet up. */
router.post("/invoices", async (req, res) => {
  const { assetKey, purpose, orderId, amountUsd } = req.body || {};
  try {
    let usdMicros;
    let resolvedOrderId = null;

    if (purpose === "order") {
      const order = orders.getOrder(orderId);
      if (!order || order.user_id !== req.shopUser.id) {
        return res.status(404).json({ error: "Order not found." });
      }
      if (order.status !== "pending_payment") {
        return res.status(400).json({ error: "This order is no longer payable." });
      }
      usdMicros = BigInt(order.total_micros);
      resolvedOrderId = order.id;
    } else {
      usdMicros = usdToMicros(amountUsd);
      const minimum = usdToMicros(settings.get("min_topup_usd", "1"));
      if (usdMicros < minimum) {
        return res
          .status(400)
          .json({ error: `Minimum top-up is $${microsToUsd(minimum)}.` });
      }
    }

    const invoice = await invoices.createInvoice({
      userId: req.shopUser.id,
      assetKey,
      usdMicros,
      purpose: purpose === "order" ? "order" : "topup",
      orderId: resolvedOrderId
    });
    res.json(publicInvoice(invoice));
  } catch (err) {
    log.warn(`Invoice creation failed: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

router.get("/invoices", (req, res) => {
  res.json({ invoices: invoices.listUserInvoices(req.shopUser.id, 20).map(publicInvoice) });
});

router.get("/invoices/:id", (req, res) => {
  const invoice = invoices.getInvoice(req.params.id);
  if (!invoice || invoice.user_id !== req.shopUser.id) {
    return res.status(404).json({ error: "Invoice not found." });
  }
  res.json(publicInvoice(invoice));
});

/** Force an on-chain scan for the impatient "I have paid" button. */
router.post("/invoices/:id/check", async (req, res) => {
  const invoice = invoices.getInvoice(req.params.id);
  if (!invoice || invoice.user_id !== req.shopUser.id) {
    return res.status(404).json({ error: "Invoice not found." });
  }
  await watcher.tick();
  res.json(publicInvoice(invoices.getInvoice(req.params.id)));
});

router.post("/invoices/:id/cancel", (req, res) => {
  const canceled = invoices.cancelInvoice(req.params.id, req.shopUser.id);
  res.json({ canceled });
});

router.get("/wallet", (req, res) => {
  const user = users.getUser(req.shopUser.id);
  res.json({
    balanceUsd: microsToUsd(BigInt(user.balance_micros)),
    transactions: users.getWalletHistory(user.id, 50).map((row) => ({
      id: row.id,
      type: row.type,
      amountUsd: microsToUsd(BigInt(row.amount_micros)),
      balanceAfterUsd: microsToUsd(BigInt(row.balance_after)),
      description: row.description,
      createdAt: row.created_at
    }))
  });
});

router.post("/discount/check", (req, res) => {
  const totalMicros = usdToMicros(req.body.totalUsd || "0");
  const result = discounts.evaluate(req.body.code, req.shopUser.id, totalMicros);
  if (!result.ok) return res.status(400).json({ error: result.reason });
  res.json({ discountUsd: microsToUsd(result.discountMicros) });
});

module.exports = router;
