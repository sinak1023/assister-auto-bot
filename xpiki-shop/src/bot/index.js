const TelegramBot = require("node-telegram-bot-api");
const config = require("../config");
const { settings } = require("../db");
const kb = require("./keyboards");
const catalog = require("../services/catalog");
const orders = require("../services/orders");
const invoices = require("../services/invoices");
const users = require("../services/users");
const watcher = require("../services/watcher");
const notifier = require("../services/notifier");
const { getAsset } = require("../services/assets");
const { formatUsd, usdToMicros } = require("../lib/money");
const { createLogger } = require("../lib/logger");

const log = createLogger("bot");

const bot = new TelegramBot(config.botToken, { polling: true });

// Short lived conversation state: which free-text answer we are waiting for.
const pending = new Map(); // chatId -> { type, ... }

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isAdmin(id) {
  return config.adminTelegramIds.includes(Number(id));
}

async function send(chatId, text, extra = {}) {
  return bot.sendMessage(chatId, text, { disable_web_page_preview: true, ...extra });
}

// ------------------------------------------------------------ force join --

async function hasJoinedChannel(userId) {
  if (!settings.getBool("force_join_enabled", false)) return true;
  const channel = settings.get("required_channel", "").trim();
  if (!channel) return true;
  try {
    const member = await bot.getChatMember(channel, userId);
    return ["creator", "administrator", "member"].includes(member.status);
  } catch (err) {
    // If the bot cannot read the channel, do not lock customers out.
    log.warn(`Membership check failed for ${userId}: ${err.message}`);
    return true;
  }
}

async function requireMembership(chatId, userId) {
  if (await hasJoinedChannel(userId)) return true;
  const channel = settings.get("required_channel", "");
  await send(
    chatId,
    `📢 Please join our channel first, then tap "I have joined" to continue.`,
    { reply_markup: kb.joinChannelMenu(channel) }
  );
  return false;
}

// ----------------------------------------------------------------- screens --

async function showHome(chatId, user) {
  const shopName = settings.get("shop_name", "xpiki api shop");
  const welcome = settings.get("welcome_message", "");
  const text =
    `<b>${escapeHtml(shopName)}</b>\n\n` +
    `${escapeHtml(welcome)}\n\n` +
    `👛 Balance: <b>${formatUsd(BigInt(user.balance_micros))}</b>`;
  return send(chatId, text, { parse_mode: "HTML", reply_markup: kb.mainMenu(user) });
}

async function showShop(chatId) {
  const categories = catalog.listCategories();
  if (categories.length === 0) {
    return send(chatId, "The shop is being restocked. Please check back soon.", {
      reply_markup: { inline_keyboard: [[{ text: "🔙 Main Menu", callback_data: "home" }]] }
    });
  }
  return send(chatId, "Choose a category:", { reply_markup: kb.categoriesMenu(categories) });
}

async function showCategory(chatId, categoryId) {
  const category = catalog.getCategory(categoryId);
  const products = catalog.listProducts(categoryId);
  if (!category || products.length === 0) {
    return send(chatId, "No products in this category yet.", {
      reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "shop" }]] }
    });
  }
  return send(chatId, `<b>${escapeHtml(category.name)}</b>\nPick a product:`, {
    parse_mode: "HTML",
    reply_markup: kb.productsMenu(products, categoryId)
  });
}

async function showProduct(chatId, productId) {
  const product = catalog.getProduct(productId);
  if (!product) return send(chatId, "Product not found.");

  const purchasable = catalog.isPurchasable(product);
  const stockLine =
    product.delivery_type === "manual"
      ? "📦 Delivered by our team after purchase"
      : purchasable
        ? `📦 In stock: ${product.stock_count}`
        : "📦 Out of stock";

  const text =
    `<b>${escapeHtml(product.name)}</b>\n\n` +
    `${escapeHtml(product.description_before || "")}\n\n` +
    `💵 Price: <b>${formatUsd(BigInt(product.price_micros))}</b>\n` +
    stockLine;

  return send(chatId, text, {
    parse_mode: "HTML",
    reply_markup: kb.productMenu(product, purchasable)
  });
}

async function showCheckout(chatId, userId, order) {
  const user = users.getUser(userId);
  const balanceCovers = BigInt(user.balance_micros) >= BigInt(order.total_micros);

  let text =
    `<b>Checkout</b>\n\n` +
    `Order #${order.id}\n` +
    `Product: ${escapeHtml(order.product_name)}\n` +
    `Price: ${formatUsd(BigInt(order.price_micros))}\n`;
  if (order.discount_micros > 0) {
    text += `Discount (${escapeHtml(order.discount_code)}): -${formatUsd(BigInt(order.discount_micros))}\n`;
  }
  text +=
    `<b>Total: ${formatUsd(BigInt(order.total_micros))}</b>\n\n` +
    `👛 Wallet balance: ${formatUsd(BigInt(user.balance_micros))}` +
    (balanceCovers ? "" : "\n\n⚠️ Not enough balance — pay with crypto or top up first.");

  return send(chatId, text, {
    parse_mode: "HTML",
    reply_markup: kb.checkoutMenu(order.id, balanceCovers)
  });
}

async function showInvoice(chatId, invoice) {
  const asset = getAsset(invoice.asset_key);
  const minutes = Math.max(
    1,
    Math.round((new Date(invoice.expires_at + "Z") - Date.now()) / 60000)
  );

  const text =
    `<b>💳 Payment Invoice #${invoice.id}</b>\n\n` +
    `Send <b>exactly</b> this amount:\n` +
    `<code>${invoice.expected_display}</code> <b>${asset.symbol}</b>\n\n` +
    `To this ${asset.networkLabel} address:\n` +
    `<code>${escapeHtml(invoice.address)}</code>\n\n` +
    `Value: ${formatUsd(BigInt(invoice.usd_micros))}\n` +
    `Rate: ${invoices.describeRate(invoice)}\n` +
    `⏱ Expires in ~${minutes} minutes\n\n` +
    `⚠️ <b>Important</b>\n` +
    `• Send the exact amount — the last digits identify your payment.\n` +
    `• Network fees must be paid on top, not deducted from the amount.\n` +
    `• Use the <b>${asset.networkLabel}</b> network only.\n\n` +
    `Detection is automatic; you will get a message the moment it clears.`;

  return send(chatId, text, {
    parse_mode: "HTML",
    reply_markup: kb.invoiceMenu(invoice, asset)
  });
}

async function showWallet(chatId, userId) {
  const user = users.getUser(userId);
  const stats = users.getReferralStats(userId);
  const text =
    `<b>👛 Your Wallet</b>\n\n` +
    `Balance: <b>${formatUsd(BigInt(user.balance_micros))}</b>\n` +
    `Referral earnings: ${formatUsd(stats.earnedMicros)}`;
  return send(chatId, text, { parse_mode: "HTML", reply_markup: kb.walletMenu() });
}

async function showWalletHistory(chatId, userId) {
  const history = users.getWalletHistory(userId, 15);
  if (history.length === 0) {
    return send(chatId, "No wallet activity yet.", {
      reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "wallet" }]] }
    });
  }
  const lines = history.map((row) => {
    const sign = row.amount_micros >= 0 ? "+" : "-";
    const amount = formatUsd(BigInt(Math.abs(row.amount_micros)));
    return `${sign}${amount} — ${row.description || row.type} (${row.created_at})`;
  });
  return send(chatId, `<b>📜 Recent activity</b>\n\n${escapeHtml(lines.join("\n"))}`, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "wallet" }]] }
  });
}

async function showOrders(chatId, userId) {
  const list = orders.listUserOrders(userId, 10);
  if (list.length === 0) {
    return send(chatId, "You have no orders yet.", {
      reply_markup: { inline_keyboard: [[{ text: "🛍 Browse Shop", callback_data: "shop" }]] }
    });
  }

  const statusLabel = {
    pending_payment: "⏳ Awaiting payment",
    paid: "🔄 Paid — preparing",
    delivered: "✅ Delivered",
    awaiting_manual: "📬 Contact us to collect",
    canceled: "🚫 Canceled",
    expired: "⌛ Expired",
    refunded: "↩️ Refunded"
  };

  const blocks = list.map((order) => {
    let block =
      `<b>Order #${order.id}</b> — ${escapeHtml(order.product_name)}\n` +
      `${formatUsd(BigInt(order.total_micros))} · ${statusLabel[order.status] || order.status}`;
    if (order.status === "delivered" && order.delivered_text) {
      block += `\n<pre>${escapeHtml(order.delivered_text)}</pre>`;
    } else if (order.status === "awaiting_manual" && order.delivered_text) {
      block += `\n${escapeHtml(order.delivered_text)}`;
    }
    return block;
  });

  return send(chatId, blocks.join("\n\n"), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "🔙 Main Menu", callback_data: "home" }]] }
  });
}

async function showReferral(chatId, userId) {
  const user = users.getUser(userId);
  const stats = users.getReferralStats(userId);
  const percent = settings.getNumber("referral_percent", 0);

  let link = `Ask an admin to configure the bot username.`;
  try {
    const me = await bot.getMe();
    link = `https://t.me/${me.username}?start=ref_${user.referral_code}`;
  } catch (err) {
    log.warn(`getMe failed: ${err.message}`);
  }

  const text =
    `<b>🤝 Referral Program</b>\n\n` +
    `Earn <b>${percent}%</b> of every purchase made by people you invite, paid straight into your wallet.\n\n` +
    `Your link:\n<code>${escapeHtml(link)}</code>\n\n` +
    `👥 Invited: ${stats.invited}\n` +
    `💰 Earned: ${formatUsd(stats.earnedMicros)}`;

  return send(chatId, text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "🔙 Main Menu", callback_data: "home" }]] }
  });
}

// ------------------------------------------------------------- flows --

async function startCryptoPayment(chatId, userId, { purpose, orderId, usdMicros }) {
  const options = invoices.listPaymentOptions();
  if (options.length === 0) {
    return send(chatId, "Crypto payments are not configured yet. Please contact support.");
  }
  pending.set(chatId, { type: "choose_asset", purpose, orderId, usdMicros: String(usdMicros) });
  return send(chatId, "Choose how you would like to pay:", {
    reply_markup: kb.assetMenu(options, "asset")
  });
}

async function createAndShowInvoice(chatId, userId, assetKey) {
  const state = pending.get(chatId);
  if (!state || state.type !== "choose_asset") {
    return send(chatId, "This payment session expired. Please start again.");
  }
  pending.delete(chatId);

  try {
    const invoice = await invoices.createInvoice({
      userId,
      assetKey,
      usdMicros: BigInt(state.usdMicros),
      purpose: state.purpose,
      orderId: state.orderId || null
    });
    return showInvoice(chatId, invoice);
  } catch (err) {
    log.error(`Invoice creation failed: ${err.message}`);
    return send(chatId, `❌ Could not create the invoice: ${err.message}`);
  }
}

async function payWithWallet(chatId, userId, orderId) {
  try {
    orders.payFromWallet(orderId);
  } catch (err) {
    if (err.message === "INSUFFICIENT_FUNDS") {
      return send(chatId, "❌ Your wallet balance does not cover this order. Top up first.");
    }
    return send(chatId, `❌ ${err.message}`);
  }

  const result = orders.settlePaidOrder(orderId);
  await watcher.announceDelivery(result);
  const user = users.getUser(userId);
  return send(
    chatId,
    `Paid from wallet. Remaining balance: ${formatUsd(BigInt(user.balance_micros))}`,
    { reply_markup: kb.mainMenu(user) }
  );
}

// ------------------------------------------------------------- handlers --

bot.onText(/^\/start(?:\s+(.+))?$/, async (msg, match) => {
  if (msg.chat.type !== "private") return;
  const user = users.upsertUser(msg.from);
  pending.delete(msg.chat.id);

  const payload = (match && match[1] ? match[1] : "").trim();
  if (payload.startsWith("ref_")) {
    const referrer = users.attachReferrer(user.id, payload.slice(4));
    if (referrer) {
      await send(msg.chat.id, `🤝 You joined through a referral link. Welcome!`);
    }
  }

  if (!(await requireMembership(msg.chat.id, user.id))) return;
  return showHome(msg.chat.id, users.getUser(user.id));
});

bot.onText(/^\/(menu|home)$/, async (msg) => {
  if (msg.chat.type !== "private") return;
  const user = users.upsertUser(msg.from);
  pending.delete(msg.chat.id);
  return showHome(msg.chat.id, user);
});

bot.onText(/^\/balance$/, async (msg) => {
  if (msg.chat.type !== "private") return;
  const user = users.upsertUser(msg.from);
  return showWallet(msg.chat.id, user.id);
});

bot.onText(/^\/panel$/, async (msg) => {
  if (msg.chat.type !== "private" || !isAdmin(msg.from.id)) return;
  const url = config.publicUrl ? `${config.publicUrl}/admin/` : "(PUBLIC_URL is not set)";
  return send(msg.chat.id, `🛠 Admin panel:\n${url}`);
});

// Free text is only meaningful while a flow is waiting for an answer.
bot.on("message", async (msg) => {
  if (msg.chat.type !== "private") return;
  if (!msg.text || msg.text.startsWith("/")) return;

  const state = pending.get(msg.chat.id);
  if (!state) return;

  const user = users.upsertUser(msg.from);
  const text = msg.text.trim();

  if (state.type === "topup_amount") {
    let usdMicros;
    try {
      usdMicros = usdToMicros(text);
    } catch (err) {
      return send(msg.chat.id, "Please send a plain number, for example: 25");
    }
    const minimum = usdToMicros(settings.get("min_topup_usd", "1"));
    if (usdMicros < minimum) {
      return send(msg.chat.id, `Minimum top-up is ${formatUsd(minimum)}.`);
    }
    pending.delete(msg.chat.id);
    return startCryptoPayment(msg.chat.id, user.id, { purpose: "topup", usdMicros });
  }

  if (state.type === "discount_code") {
    const order = orders.getOrder(state.orderId);
    if (!order || order.status !== "pending_payment") {
      pending.delete(msg.chat.id);
      return send(msg.chat.id, "That order is no longer open.");
    }
    pending.delete(msg.chat.id);

    // Re-create the order with the code applied; the old one is dropped.
    orders.cancelOrder(order.id);
    try {
      const replacement = orders.createOrder(user.id, order.product_id, text, "wallet");
      if (replacement.discount_micros > 0) {
        await send(msg.chat.id, `🎟 Discount applied: -${formatUsd(BigInt(replacement.discount_micros))}`);
      } else {
        await send(msg.chat.id, "That code could not be applied, so the original price stands.");
      }
      return showCheckout(msg.chat.id, user.id, replacement);
    } catch (err) {
      return send(msg.chat.id, `❌ ${err.message}`);
    }
  }
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const user = users.upsertUser(query.from);
  const data = query.data || "";
  const [action, argument] = data.split(":");

  const answer = (text, alert = false) =>
    bot.answerCallbackQuery(query.id, text ? { text, show_alert: alert } : {}).catch(() => {});

  try {
    // Gate everything except the membership re-check behind force-join.
    if (action !== "checkjoin" && !(await hasJoinedChannel(user.id))) {
      await answer();
      const channel = settings.get("required_channel", "");
      return send(chatId, "📢 Please join our channel to continue.", {
        reply_markup: kb.joinChannelMenu(channel)
      });
    }

    switch (action) {
      case "checkjoin": {
        if (await hasJoinedChannel(user.id)) {
          await answer("Thanks for joining!");
          return showHome(chatId, users.getUser(user.id));
        }
        return answer("You are not a member of the channel yet.", true);
      }
      case "home":
        await answer();
        pending.delete(chatId);
        return showHome(chatId, users.getUser(user.id));
      case "shop":
        await answer();
        return showShop(chatId);
      case "cat":
        await answer();
        return showCategory(chatId, argument);
      case "prod":
        await answer();
        return showProduct(chatId, argument);

      case "buy": {
        await answer();
        try {
          const order = orders.createOrder(user.id, argument, "", "wallet");
          return showCheckout(chatId, user.id, order);
        } catch (err) {
          return send(chatId, `❌ ${err.message}`);
        }
      }
      case "paywallet":
        await answer();
        return payWithWallet(chatId, user.id, argument);
      case "paycrypto": {
        await answer();
        const order = orders.getOrder(argument);
        if (!order || order.status !== "pending_payment") {
          return send(chatId, "That order is no longer open.");
        }
        return startCryptoPayment(chatId, user.id, {
          purpose: "order",
          orderId: order.id,
          usdMicros: BigInt(order.total_micros)
        });
      }
      case "discount":
        await answer();
        pending.set(chatId, { type: "discount_code", orderId: Number(argument) });
        return send(chatId, "🎟 Send me your discount code:");
      case "cancelorder": {
        orders.cancelOrder(argument);
        await answer("Order canceled");
        return showHome(chatId, users.getUser(user.id));
      }

      case "asset":
        await answer();
        return createAndShowInvoice(chatId, user.id, argument);

      case "checkinv": {
        await answer("Checking the blockchain…");
        await watcher.tick();
        const invoice = invoices.getInvoice(argument);
        if (!invoice) return send(chatId, "Invoice not found.");
        if (invoice.status === "confirmed") {
          return send(chatId, "✅ This payment is already confirmed.");
        }
        if (invoice.status === "confirming") {
          return send(chatId, "⏳ Payment seen — waiting for network confirmations.");
        }
        return send(
          chatId,
          "No matching payment yet. If you have just sent it, give the network a few minutes."
        );
      }
      case "cancelinv": {
        const canceled = invoices.cancelInvoice(argument, user.id);
        await answer(canceled ? "Invoice canceled" : "This invoice can no longer be canceled");
        return showHome(chatId, users.getUser(user.id));
      }

      case "wallet":
        await answer();
        return showWallet(chatId, user.id);
      case "wallethistory":
        await answer();
        return showWalletHistory(chatId, user.id);
      case "topup":
        await answer();
        pending.set(chatId, { type: "topup_amount" });
        return send(
          chatId,
          `How much would you like to add, in USD?\n` +
            `Minimum: ${formatUsd(usdToMicros(settings.get("min_topup_usd", "1")))}\n\n` +
            `Send a number, for example: 25`
        );

      case "orders":
        await answer();
        return showOrders(chatId, user.id);
      case "referral":
        await answer();
        return showReferral(chatId, user.id);

      default:
        return answer();
    }
  } catch (err) {
    log.error(`Callback ${data} failed: ${err.message}`);
    await answer("Something went wrong. Please try again.", true);
  }
});

bot.on("polling_error", (err) => log.error(`Polling error: ${err.message}`));

// Cache the bot's own username so the Mini App can build referral deep links.
bot
  .getMe()
  .then((me) => {
    if (me.username && settings.get("bot_username", "") !== me.username) {
      settings.set("bot_username", me.username);
    }
    log.info(`Connected as @${me.username}`);
  })
  .catch((err) => log.error(`getMe failed: ${err.message}`));

// Let background services reach the customer and the shop owner.
notifier.register({
  sendToUser: (userId, text, options) =>
    bot.sendMessage(userId, text, { disable_web_page_preview: true, ...options }),
  sendToAdmins: async (text, options) => {
    for (const adminId of config.adminTelegramIds) {
      await bot
        .sendMessage(adminId, text, { disable_web_page_preview: true, ...options })
        .catch((err) => log.warn(`Admin ${adminId} unreachable: ${err.message}`));
    }
  }
});

module.exports = { bot };
