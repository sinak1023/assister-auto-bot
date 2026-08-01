const config = require("../config");
const { settings } = require("../db");
const { formatUsd } = require("../lib/money");

/** The Mini App button only works over HTTPS, so it is hidden without one. */
function miniAppButton(label = "🚀 Open Shop App") {
  if (!config.publicUrl.startsWith("https://")) return null;
  return { text: label, web_app: { url: `${config.publicUrl}/app/` } };
}

function mainMenu(user) {
  const rows = [];
  const app = miniAppButton();
  if (app) rows.push([app]);

  rows.push([
    { text: "🛍 Browse Shop", callback_data: "shop" },
    { text: "👛 Wallet", callback_data: "wallet" }
  ]);
  rows.push([
    { text: "📦 My Orders", callback_data: "orders" },
    { text: "🤝 Referrals", callback_data: "referral" }
  ]);

  const support = settings.get("support_username", "");
  if (support) rows.push([{ text: "☎️ Support", url: supportUrl(support) }]);

  return { inline_keyboard: rows };
}

function supportUrl(handle) {
  const clean = handle.replace(/^@/, "");
  return clean.startsWith("http") ? clean : `https://t.me/${clean}`;
}

function backTo(target, label = "🔙 Back") {
  return { text: label, callback_data: target };
}

function categoriesMenu(categories) {
  const rows = categories.map((category) => [
    {
      text: `${category.emoji ? category.emoji + " " : ""}${category.name}`,
      callback_data: `cat:${category.id}`
    }
  ]);
  rows.push([backTo("home", "🔙 Main Menu")]);
  return { inline_keyboard: rows };
}

function productsMenu(products, categoryId) {
  const rows = products.map((product) => {
    const soldOut = product.delivery_type !== "manual" && product.stock_count === 0;
    const suffix = soldOut ? " — SOLD OUT" : ` — ${formatUsd(BigInt(product.price_micros))}`;
    return [{ text: `${product.name}${suffix}`, callback_data: `prod:${product.id}` }];
  });
  rows.push([backTo("shop")]);
  return { inline_keyboard: rows };
}

function productMenu(product, purchasable) {
  const rows = [];
  if (purchasable) {
    rows.push([{ text: "🛒 Buy Now", callback_data: `buy:${product.id}` }]);
  }
  rows.push([backTo(`cat:${product.category_id}`)]);
  return { inline_keyboard: rows };
}

function checkoutMenu(orderId, balanceCovers) {
  const rows = [];
  if (balanceCovers) {
    rows.push([{ text: "👛 Pay from Wallet", callback_data: `paywallet:${orderId}` }]);
  }
  rows.push([{ text: "🪙 Pay with Crypto", callback_data: `paycrypto:${orderId}` }]);
  rows.push([{ text: "🎟 Apply Discount Code", callback_data: `discount:${orderId}` }]);
  rows.push([{ text: "❌ Cancel Order", callback_data: `cancelorder:${orderId}` }]);
  return { inline_keyboard: rows };
}

function assetMenu(options, prefix) {
  const rows = options.map((option) => [
    { text: `${option.label} — ${option.network}`, callback_data: `${prefix}:${option.key}` }
  ]);
  rows.push([backTo("home", "🔙 Main Menu")]);
  return { inline_keyboard: rows };
}

function invoiceMenu(invoice, asset) {
  const rows = [
    [{ text: "🔄 I have paid — check now", callback_data: `checkinv:${invoice.id}` }]
  ];
  if (asset && asset.explorerTx) {
    rows.push([{ text: "🔎 View address on explorer", url: explorerAddress(asset, invoice.address) }]);
  }
  rows.push([{ text: "❌ Cancel Invoice", callback_data: `cancelinv:${invoice.id}` }]);
  return { inline_keyboard: rows };
}

function explorerAddress(asset, address) {
  switch (asset.network) {
    case "ethereum":
      return `https://etherscan.io/address/${address}`;
    case "bsc":
      return `https://bscscan.com/address/${address}`;
    case "tron":
      return `https://tronscan.org/#/address/${address}`;
    case "solana":
      return `https://solscan.io/account/${address}`;
    default:
      return `https://t.me/`;
  }
}

function walletMenu() {
  return {
    inline_keyboard: [
      [{ text: "➕ Top Up Balance", callback_data: "topup" }],
      [{ text: "📜 Transaction History", callback_data: "wallethistory" }],
      [backTo("home", "🔙 Main Menu")]
    ]
  };
}

function joinChannelMenu(channel) {
  const clean = String(channel).replace(/^@/, "");
  const url = clean.startsWith("http") ? clean : `https://t.me/${clean}`;
  return {
    inline_keyboard: [
      [{ text: "📢 Join Channel", url }],
      [{ text: "✅ I have joined", callback_data: "checkjoin" }]
    ]
  };
}

module.exports = {
  mainMenu,
  miniAppButton,
  categoriesMenu,
  productsMenu,
  productMenu,
  checkoutMenu,
  assetMenu,
  invoiceMenu,
  walletMenu,
  joinChannelMenu,
  supportUrl,
  explorerAddress
};
