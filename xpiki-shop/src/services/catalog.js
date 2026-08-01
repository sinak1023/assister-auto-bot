const { db } = require("../db");

const stmtCategories = db.prepare(
  "SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, id"
);
const stmtAllCategories = db.prepare("SELECT * FROM categories ORDER BY sort_order, id");
const stmtCategory = db.prepare("SELECT * FROM categories WHERE id = ?");
const stmtProduct = db.prepare("SELECT * FROM products WHERE id = ?");

/** Products with their live available-stock count folded in. */
const PRODUCT_WITH_STOCK = `
  SELECT p.*,
         c.kind AS category_kind,
         c.name AS category_name,
         (SELECT COUNT(*) FROM stock_items s
           WHERE s.product_id = p.id AND s.status = 'available') AS stock_count
    FROM products p
    JOIN categories c ON c.id = p.category_id
`;

const stmtProductsByCategory = db.prepare(
  `${PRODUCT_WITH_STOCK} WHERE p.category_id = ? AND p.is_active = 1 ORDER BY p.sort_order, p.id`
);
const stmtAllProducts = db.prepare(`${PRODUCT_WITH_STOCK} ORDER BY p.sort_order, p.id`);
const stmtProductWithStock = db.prepare(`${PRODUCT_WITH_STOCK} WHERE p.id = ?`);

function listCategories({ includeHidden = false } = {}) {
  return includeHidden ? stmtAllCategories.all() : stmtCategories.all();
}

function getCategory(id) {
  return stmtCategory.get(Number(id)) || null;
}

function listProducts(categoryId) {
  return stmtProductsByCategory.all(Number(categoryId));
}

function listAllProducts() {
  return stmtAllProducts.all();
}

function getProduct(id) {
  return stmtProductWithStock.get(Number(id)) || null;
}

function getRawProduct(id) {
  return stmtProduct.get(Number(id)) || null;
}

/** True when the product can be sold right now. */
function isPurchasable(product) {
  if (!product || !product.is_active) return false;
  if (product.delivery_type === "manual") return true;
  return product.stock_count > 0;
}

/**
 * Split a bulk paste into stock items.
 * For 'account' products a `user:pass` (or `user|pass`) line is broken into
 * its two parts so the delivery message can be formatted properly.
 */
function parseStockLines(text, kind) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    if (kind === "account") {
      const match = line.match(/^([^:|]+)[:|](.+)$/);
      if (match) {
        return {
          content: line,
          username: match[1].trim(),
          password: match[2].trim()
        };
      }
    }
    return { content: line, username: "", password: "" };
  });
}

const addStockItems = db.transaction((productId, items) => {
  const insert = db.prepare(
    `INSERT INTO stock_items (product_id, content, username, password)
     VALUES (?, ?, ?, ?)`
  );
  for (const item of items) {
    insert.run(Number(productId), item.content, item.username || "", item.password || "");
  }
  return items.length;
});

module.exports = {
  listCategories,
  getCategory,
  listProducts,
  listAllProducts,
  getProduct,
  getRawProduct,
  isPurchasable,
  parseStockLines,
  addStockItems
};
