/* xpiki api shop — admin panel front-end */
(function () {
  "use strict";

  const state = { page: "dashboard", categories: [], settings: {}, assets: [] };

  // ------------------------------------------------------------- helpers --

  async function api(path, options) {
    const config = Object.assign({ headers: {}, credentials: "same-origin" }, options || {});
    config.headers["content-type"] = "application/json";
    if (config.body && typeof config.body !== "string") {
      config.body = JSON.stringify(config.body);
    }
    const response = await fetch("/api/admin" + path, config);
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      showLogin();
      throw new Error(body.error || "Please sign in again.");
    }
    if (!response.ok) throw new Error(body.error || "Request failed");
    return body;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(value) {
    return "$" + Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function date(value) {
    return value ? String(value).replace("T", " ").slice(0, 16) : "—";
  }

  let toastTimer = null;
  function toast(message, kind) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.className = "toast " + (kind || "good");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function $(id) { return document.getElementById(id); }

  function openModal(title, html) {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = html;
    $("modal").hidden = false;
  }
  function closeModal() { $("modal").hidden = true; }

  function empty(icon, message) {
    return `<div class="empty"><span class="empty-icon">${icon}</span>${esc(message)}</div>`;
  }

  function statusBadge(status) {
    const map = {
      delivered: ["good", "Delivered"],
      awaiting_manual: ["warn", "Manual pickup"],
      paid: ["warn", "Paid — undelivered"],
      pending_payment: ["", "Awaiting payment"],
      canceled: ["bad", "Canceled"],
      expired: ["bad", "Expired"],
      refunded: ["info", "Refunded"],
      confirmed: ["good", "Confirmed"],
      confirming: ["warn", "Confirming"],
      pending: ["", "Pending"]
    };
    const [kind, label] = map[status] || ["", status];
    return `<span class="badge ${kind}">${esc(label)}</span>`;
  }

  // --------------------------------------------------------------- pages --

  const pages = {};

  pages.dashboard = async function () {
    const stats = await api("/stats");

    const maxRevenue = Math.max(
      ...stats.daily.map((d) => Number(d.revenueUsd)),
      1
    );
    const chart = stats.daily
      .map((day) => {
        const height = Math.round((Number(day.revenueUsd) / maxRevenue) * 128);
        return `
          <div class="chart-col" title="${esc(day.day)}: ${money(day.revenueUsd)} (${day.sales} sales)">
            <div class="chart-bar" style="height:${Math.max(height, 3)}px"></div>
            <div class="chart-label">${esc(day.day.slice(5))}</div>
          </div>`;
      })
      .join("");

    const alerts = [];
    if (stats.pending.undeliveredOrders > 0) {
      alerts.push(`${stats.pending.undeliveredOrders} paid order(s) still undelivered — restock or refund.`);
    }
    if (stats.pending.unmatchedDeposits > 0) {
      alerts.push(`${stats.pending.unmatchedDeposits} unmatched deposit(s) need review under Payments.`);
    }
    if (stats.lowStock.length > 0) {
      alerts.push(`${stats.lowStock.length} product(s) are low on stock.`);
    }

    return `
      <div class="grid kpi">
        <div class="kpi-card accent">
          <div class="kpi-label">Total revenue</div>
          <div class="kpi-value">${money(stats.revenue.totalUsd)}</div>
          <div class="kpi-sub">${stats.sales.total} completed sales</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Today</div>
          <div class="kpi-value">${money(stats.revenue.todayUsd)}</div>
          <div class="kpi-sub">${stats.sales.today} sales · ${stats.users.today} new users</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Last 7 days</div>
          <div class="kpi-value">${money(stats.revenue.weekUsd)}</div>
          <div class="kpi-sub">${stats.sales.week} sales · ${stats.users.week} new users</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Last 30 days</div>
          <div class="kpi-value">${money(stats.revenue.monthUsd)}</div>
          <div class="kpi-sub">${stats.sales.month} sales</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Customers</div>
          <div class="kpi-value">${stats.users.total}</div>
          <div class="kpi-sub">${stats.users.withBalance} hold a balance</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Wallet liability</div>
          <div class="kpi-value">${money(stats.liabilityUsd)}</div>
          <div class="kpi-sub">Customer credit you still owe</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Stock on hand</div>
          <div class="kpi-value">${stats.stock.available}</div>
          <div class="kpi-sub">${stats.stock.sold} delivered so far</div>
        </div>
        <div class="kpi-card ${stats.pending.invoices > 0 ? "alert" : ""}">
          <div class="kpi-label">Open invoices</div>
          <div class="kpi-value">${stats.pending.invoices}</div>
          <div class="kpi-sub">Awaiting on-chain payment</div>
        </div>
      </div>

      ${
        alerts.length > 0
          ? `<div class="card" style="margin-top:16px; border-color: rgba(255,176,32,0.3)">
               <div class="card-head"><h2>⚠️ Needs your attention</h2></div>
               ${alerts.map((a) => `<div class="small" style="padding:3px 0">• ${esc(a)}</div>`).join("")}
             </div>`
          : ""
      }

      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>Revenue — last 14 days</h2></div>
        <div class="chart">${chart}</div>
      </div>

      <div class="grid two" style="margin-top:16px">
        <div class="card">
          <div class="card-head"><h2>Best sellers</h2></div>
          ${
            stats.topProducts.length === 0
              ? empty("📊", "No sales yet.")
              : `<div class="table-wrap"><table>
                  <thead><tr><th>Product</th><th class="num">Sales</th><th class="num">Revenue</th></tr></thead>
                  <tbody>${stats.topProducts
                    .map(
                      (p) => `<tr>
                        <td class="cell-strong">${esc(p.name)}</td>
                        <td class="num">${p.sales}</td>
                        <td class="num">${money(p.revenueUsd)}</td>
                      </tr>`
                    )
                    .join("")}</tbody></table></div>`
          }
        </div>
        <div class="card">
          <div class="card-head"><h2>Low stock</h2></div>
          ${
            stats.lowStock.length === 0
              ? empty("✅", "Every product is well stocked.")
              : `<div class="table-wrap"><table>
                  <thead><tr><th>Product</th><th class="num">Remaining</th></tr></thead>
                  <tbody>${stats.lowStock
                    .map(
                      (p) => `<tr>
                        <td class="cell-strong">${esc(p.name)}</td>
                        <td class="num"><span class="badge ${p.stock === 0 ? "bad" : "warn"}">${p.stock}</span></td>
                      </tr>`
                    )
                    .join("")}</tbody></table></div>`
          }
        </div>
      </div>`;
  };

  pages.categories = async function () {
    const data = await api("/categories");
    state.categories = data.categories;

    setActions(`<button class="btn primary" data-action="new-category">+ New category</button>`);

    if (data.categories.length === 0) {
      return `<div class="card">${empty("🗂", "Create your first category — for example “API Keys” and “Accounts”.")}</div>`;
    }

    return `<div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Type</th><th class="num">Order</th><th>Status</th><th></th></tr></thead>
      <tbody>${data.categories
        .map(
          (category) => `<tr>
            <td class="cell-strong">${esc((category.emoji ? category.emoji + " " : "") + category.name)}</td>
            <td><span class="badge info">${category.kind === "account" ? "Accounts" : "API keys"}</span></td>
            <td class="num">${category.sort_order}</td>
            <td>${category.is_active ? '<span class="badge good">Visible</span>' : '<span class="badge">Hidden</span>'}</td>
            <td>
              <div class="btn-group">
                <button class="btn small" data-action="edit-category" data-id="${category.id}">Edit</button>
                <button class="btn small danger" data-action="delete-category" data-id="${category.id}">Delete</button>
              </div>
            </td>
          </tr>`
        )
        .join("")}</tbody></table></div></div>`;
  };

  pages.products = async function () {
    const [data, categoryData] = await Promise.all([api("/products"), api("/categories")]);
    state.categories = categoryData.categories;

    setActions(`<button class="btn primary" data-action="new-product">+ New product</button>`);

    if (data.products.length === 0) {
      return `<div class="card">${empty("📦", "No products yet. Create a category first, then add a product.")}</div>`;
    }

    return `<div class="card"><div class="table-wrap"><table>
      <thead><tr>
        <th>Product</th><th>Category</th><th class="num">Price</th>
        <th>Delivery</th><th class="num">Stock</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${data.products
        .map(
          (product) => `<tr>
            <td>
              <div class="cell-strong">${esc(product.name)}</div>
              <div class="cell-sub">${esc((product.description_before || "").slice(0, 60))}</div>
            </td>
            <td><span class="badge ${product.category_kind === "account" ? "info" : ""}">${esc(product.category_name)}</span></td>
            <td class="num cell-strong">${money(product.priceUsd)}</td>
            <td>${
              product.delivery_type === "manual"
                ? `<span class="badge warn">Manual → ${esc(product.manual_contact)}</span>`
                : '<span class="badge good">Automatic</span>'
            }</td>
            <td class="num">${
              product.delivery_type === "manual"
                ? "—"
                : `<span class="badge ${product.stock_count === 0 ? "bad" : product.stock_count <= 3 ? "warn" : "good"}">${product.stock_count}</span>`
            }</td>
            <td>${product.is_active ? '<span class="badge good">Live</span>' : '<span class="badge">Hidden</span>'}</td>
            <td>
              <div class="btn-group">
                ${
                  product.delivery_type === "auto"
                    ? `<button class="btn small primary" data-action="stock" data-id="${product.id}">Stock</button>`
                    : ""
                }
                <button class="btn small" data-action="edit-product" data-id="${product.id}">Edit</button>
                <button class="btn small danger" data-action="delete-product" data-id="${product.id}">Delete</button>
              </div>
            </td>
          </tr>`
        )
        .join("")}</tbody></table></div></div>`;
  };

  pages.orders = async function (filter) {
    const status = filter || "all";
    const data = await api("/orders?status=" + encodeURIComponent(status) + "&limit=200");

    setActions(`
      <select id="orderFilter" data-action="filter-orders">
        ${["all", "paid", "delivered", "awaiting_manual", "pending_payment", "refunded"]
          .map(
            (value) =>
              `<option value="${value}" ${value === status ? "selected" : ""}>${
                value === "all" ? "All orders" : esc(value.replace(/_/g, " "))
              }</option>`
          )
          .join("")}
      </select>`);

    if (data.orders.length === 0) {
      return `<div class="card">${empty("🧾", "No orders match this filter.")}</div>`;
    }

    return `<div class="card"><div class="table-wrap"><table>
      <thead><tr>
        <th>#</th><th>Customer</th><th>Product</th><th class="num">Total</th>
        <th>Payment</th><th>Status</th><th>Date</th><th></th>
      </tr></thead>
      <tbody>${data.orders
        .map(
          (order) => `<tr>
            <td class="mono">${order.id}</td>
            <td>
              <div class="cell-strong">${esc(order.buyer_name || "Unknown")}</div>
              <div class="cell-sub">${order.buyer_username ? "@" + esc(order.buyer_username) : "ID " + order.user_id}</div>
            </td>
            <td>
              <div>${esc(order.product_name)}</div>
              ${order.discount_code ? `<div class="cell-sub">Code: ${esc(order.discount_code)} (-${money(order.discountUsd)})</div>` : ""}
            </td>
            <td class="num cell-strong">${money(order.totalUsd)}</td>
            <td><span class="badge">${esc(order.payment_method)}</span></td>
            <td>${statusBadge(order.status)}</td>
            <td class="cell-sub">${date(order.created_at)}</td>
            <td>
              <div class="btn-group">
                ${order.status === "paid" ? `<button class="btn small primary" data-action="deliver-order" data-id="${order.id}">Deliver</button>` : ""}
                ${["paid", "delivered", "awaiting_manual"].includes(order.status) ? `<button class="btn small danger" data-action="refund-order" data-id="${order.id}">Refund</button>` : ""}
                ${order.delivered_text ? `<button class="btn small" data-action="view-delivery" data-id="${order.id}">View</button>` : ""}
              </div>
            </td>
          </tr>`
        )
        .join("")}</tbody></table></div></div>`;
  };

  pages.users = async function (search) {
    const data = await api("/users?limit=200" + (search ? "&search=" + encodeURIComponent(search) : ""));

    setActions(`
      <input id="userSearch" placeholder="Search name, @username or ID" value="${esc(search || "")}" />
      <button class="btn" data-action="search-users">Search</button>
      <button class="btn primary" data-action="broadcast">📢 Broadcast</button>`);

    if (data.users.length === 0) {
      return `<div class="card">${empty("👥", "No customers found.")}</div>`;
    }

    return `<div class="card"><div class="table-wrap"><table>
      <thead><tr>
        <th>Customer</th><th>ID</th><th class="num">Balance</th>
        <th class="num">Orders</th><th>Joined</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${data.users
        .map(
          (user) => `<tr>
            <td>
              <div class="cell-strong">${esc(user.first_name || "Unknown")} ${esc(user.last_name || "")}</div>
              <div class="cell-sub">${user.username ? "@" + esc(user.username) : "no username"}</div>
            </td>
            <td class="mono">${user.id}</td>
            <td class="num cell-strong">${money(user.balanceUsd)}</td>
            <td class="num">${user.orders}</td>
            <td class="cell-sub">${date(user.created_at)}</td>
            <td>${user.is_blocked ? '<span class="badge bad">Blocked</span>' : '<span class="badge good">Active</span>'}</td>
            <td>
              <div class="btn-group">
                <button class="btn small" data-action="user-detail" data-id="${user.id}">Details</button>
                <button class="btn small primary" data-action="adjust-balance" data-id="${user.id}">Balance</button>
                <button class="btn small ${user.is_blocked ? "" : "danger"}" data-action="toggle-block" data-id="${user.id}" data-blocked="${user.is_blocked}">
                  ${user.is_blocked ? "Unblock" : "Block"}
                </button>
              </div>
            </td>
          </tr>`
        )
        .join("")}</tbody></table></div></div>`;
  };

  pages.payments = async function () {
    const [invoiceData, depositData, health] = await Promise.all([
      api("/invoices?status=all"),
      api("/deposits"),
      api("/health").catch(() => ({ checks: {} }))
    ]);

    const healthRows = Object.entries(health.checks)
      .map(
        ([name, check]) => `
          <div class="health-row">
            <span><span class="dot ${check.ok ? "good" : "bad"}"></span>${esc(name)}</span>
            <span class="small ${check.ok ? "muted" : ""}" style="${check.ok ? "" : "color:var(--bad)"}">${esc(check.detail)}</span>
          </div>`
      )
      .join("");

    const unresolved = depositData.deposits.filter((d) => !d.resolved);

    return `
      <div class="grid two">
        <div class="card">
          <div class="card-head">
            <h2>Provider status</h2>
            <button class="btn small" data-action="refresh-page">Re-check</button>
          </div>
          ${healthRows || empty("🔌", "No networks are enabled.")}
        </div>
        <div class="card">
          <div class="card-head"><h2>Unmatched deposits</h2></div>
          ${
            unresolved.length === 0
              ? empty("✅", "Every incoming payment has been matched.")
              : `<div class="table-wrap"><table>
                  <thead><tr><th>Asset</th><th class="num">Amount</th><th>Tx</th><th></th></tr></thead>
                  <tbody>${unresolved
                    .map(
                      (deposit) => `<tr>
                        <td>${esc(deposit.asset_key)}</td>
                        <td class="num cell-strong">${esc(deposit.amount_display)}</td>
                        <td class="mono">${esc(deposit.tx_hash.slice(0, 12))}…</td>
                        <td><button class="btn small primary" data-action="resolve-deposit" data-id="${deposit.id}" data-amount="${esc(deposit.amount_display)}">Resolve</button></td>
                      </tr>`
                    )
                    .join("")}</tbody></table></div>`
          }
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>Recent invoices</h2></div>
        ${
          invoiceData.invoices.length === 0
            ? empty("🪙", "No invoices have been created yet.")
            : `<div class="table-wrap"><table>
                <thead><tr>
                  <th>#</th><th>User</th><th>Asset</th><th class="num">Amount</th>
                  <th class="num">USD</th><th>Purpose</th><th>Status</th><th>Created</th>
                </tr></thead>
                <tbody>${invoiceData.invoices
                  .slice(0, 80)
                  .map(
                    (invoice) => `<tr>
                      <td class="mono">${invoice.id}</td>
                      <td class="mono">${invoice.user_id}</td>
                      <td>${esc(invoice.asset_key)}</td>
                      <td class="num mono">${esc(invoice.expected_display)}</td>
                      <td class="num">${money(invoice.usd)}</td>
                      <td><span class="badge">${esc(invoice.purpose)}</span></td>
                      <td>${statusBadge(invoice.status)}</td>
                      <td class="cell-sub">${date(invoice.created_at)}</td>
                    </tr>`
                  )
                  .join("")}</tbody></table></div>`
        }
      </div>`;
  };

  pages.discounts = async function () {
    const data = await api("/discounts");
    setActions(`<button class="btn primary" data-action="new-discount">+ New code</button>`);

    if (data.codes.length === 0) {
      return `<div class="card">${empty("🎟", "No discount codes yet.")}</div>`;
    }

    return `<div class="card"><div class="table-wrap"><table>
      <thead><tr>
        <th>Code</th><th>Value</th><th class="num">Used</th><th class="num">Min total</th>
        <th>Expires</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${data.codes
        .map(
          (code) => `<tr>
            <td class="mono cell-strong">${esc(code.code)}</td>
            <td><span class="badge info">${esc(code.valueDisplay)}</span></td>
            <td class="num">${code.used_count}${code.max_uses > 0 ? " / " + code.max_uses : ""}</td>
            <td class="num">${money(code.minTotalUsd)}</td>
            <td class="cell-sub">${code.expires_at ? date(code.expires_at) : "never"}</td>
            <td>${code.is_active ? '<span class="badge good">Active</span>' : '<span class="badge">Disabled</span>'}</td>
            <td>
              <div class="btn-group">
                <button class="btn small" data-action="toggle-discount" data-id="${code.id}" data-active="${code.is_active}">
                  ${code.is_active ? "Disable" : "Enable"}
                </button>
                <button class="btn small danger" data-action="delete-discount" data-id="${code.id}">Delete</button>
              </div>
            </td>
          </tr>`
        )
        .join("")}</tbody></table></div></div>`;
  };

  pages.referrals = async function () {
    const data = await api("/referrals");
    if (data.leaderboard.length === 0) {
      return `<div class="card">${empty("🤝", "Nobody has invited anyone yet.")}</div>`;
    }
    return `<div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Customer</th><th>ID</th><th class="num">Invited</th><th class="num">Earned</th></tr></thead>
      <tbody>${data.leaderboard
        .map(
          (row) => `<tr>
            <td class="cell-strong">${esc(row.first_name || "Unknown")} ${row.username ? "(@" + esc(row.username) + ")" : ""}</td>
            <td class="mono">${row.id}</td>
            <td class="num">${row.invited}</td>
            <td class="num cell-strong">${money(row.earnedUsd)}</td>
          </tr>`
        )
        .join("")}</tbody></table></div></div>`;
  };

  pages.settings = async function () {
    const data = await api("/settings");
    state.settings = data.settings;
    state.assets = data.assets;

    const assetToggles = data.assets
      .map(
        (asset) => `
          <label class="checkbox" style="padding:5px 0">
            <input type="checkbox" data-setting="${asset.enabledKey}" ${
              state.settings[asset.enabledKey] === "1" ? "checked" : ""
            } />
            <span>${esc(asset.label)} <span class="muted small">— ${esc(asset.network)}</span></span>
          </label>`
      )
      .join("");

    return `
      <div class="grid two">
        <div class="card">
          <div class="card-head"><h2>💰 Receiving wallets</h2></div>
          <p class="muted small" style="margin-top:-8px">
            Customer payments land directly in these wallets. Double-check every
            address — a typo sends money somewhere you cannot recover it from.
          </p>
          <div class="field">
            <label>Ethereum address (ETH &amp; USDT-ERC20)</label>
            <input data-setting="wallet_address_ethereum" value="${esc(state.settings.wallet_address_ethereum)}" placeholder="0x…" />
          </div>
          <div class="field">
            <label>BNB Smart Chain address (USDT-BEP20)</label>
            <input data-setting="wallet_address_bsc" value="${esc(state.settings.wallet_address_bsc)}" placeholder="0x…" />
          </div>
          <div class="field">
            <label>Tron address (USDT-TRC20)</label>
            <input data-setting="wallet_address_tron" value="${esc(state.settings.wallet_address_tron)}" placeholder="T…" />
          </div>
          <div class="field">
            <label>Solana address (SOL)</label>
            <input data-setting="wallet_address_solana" value="${esc(state.settings.wallet_address_solana)}" placeholder="Base58 address" />
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>🔌 Providers</h2></div>
          <div class="field">
            <label>Alchemy API key</label>
            <input data-setting="alchemy_api_key" value="${esc(state.settings.alchemy_api_key)}" placeholder="Your Alchemy key" />
            <div class="hint">Used for Ethereum, BNB Chain and Solana, plus live USD pricing.</div>
          </div>
          <div class="field">
            <label>TronGrid API key</label>
            <input data-setting="trongrid_api_key" value="${esc(state.settings.trongrid_api_key)}" placeholder="Optional but recommended" />
            <div class="hint">Alchemy does not support Tron, so TRC20 payments are watched through TronGrid.</div>
          </div>
          <div class="card-head" style="margin-top:20px"><h2>Enabled payment methods</h2></div>
          ${assetToggles}
        </div>

        <div class="card">
          <div class="card-head"><h2>🏪 Shop</h2></div>
          <div class="field">
            <label>Shop name</label>
            <input data-setting="shop_name" value="${esc(state.settings.shop_name)}" />
          </div>
          <div class="field">
            <label>Support contact</label>
            <input data-setting="support_username" value="${esc(state.settings.support_username)}" placeholder="@username" />
          </div>
          <div class="field">
            <label>Welcome message</label>
            <textarea data-setting="welcome_message" style="min-height:70px">${esc(state.settings.welcome_message)}</textarea>
          </div>
          <div class="field">
            <label class="checkbox">
              <input type="checkbox" data-setting="force_join_enabled" ${state.settings.force_join_enabled === "1" ? "checked" : ""} />
              <span>Require channel membership before buying</span>
            </label>
          </div>
          <div class="field">
            <label>Required channel</label>
            <input data-setting="required_channel" value="${esc(state.settings.required_channel)}" placeholder="@yourchannel" />
            <div class="hint">The bot must be an administrator of this channel to check membership.</div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>⚙️ Payments &amp; growth</h2></div>
          <div class="field-row">
            <div class="field">
              <label>Invoice lifetime (minutes)</label>
              <input type="number" min="5" data-setting="invoice_ttl_minutes" value="${esc(state.settings.invoice_ttl_minutes)}" />
            </div>
            <div class="field">
              <label>Minimum top-up (USD)</label>
              <input type="number" min="0" step="0.01" data-setting="min_topup_usd" value="${esc(state.settings.min_topup_usd)}" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Payment poll interval (seconds)</label>
              <input type="number" min="15" data-setting="payment_poll_seconds" value="${esc(state.settings.payment_poll_seconds)}" />
              <div class="hint">Applied on the next restart.</div>
            </div>
            <div class="field">
              <label>Referral commission (%)</label>
              <input type="number" min="0" max="100" data-setting="referral_percent" value="${esc(state.settings.referral_percent)}" />
            </div>
          </div>
          <div class="card-head" style="margin-top:16px"><h2>Required confirmations</h2></div>
          <div class="field-row">
            <div class="field">
              <label>Ethereum</label>
              <input type="number" min="0" data-setting="confirmations_ethereum" value="${esc(state.settings.confirmations_ethereum)}" />
            </div>
            <div class="field">
              <label>BNB Chain</label>
              <input type="number" min="0" data-setting="confirmations_bsc" value="${esc(state.settings.confirmations_bsc)}" />
            </div>
          </div>
          <div class="field">
            <label>Tron</label>
            <input type="number" min="0" data-setting="confirmations_tron" value="${esc(state.settings.confirmations_tron)}" />
            <div class="hint">Solana uses the network's own finalized commitment, so it needs no setting.</div>
          </div>
        </div>
      </div>

      <div style="margin-top:16px; display:flex; gap:9px; flex-wrap:wrap">
        <button class="btn primary" data-action="save-settings">Save all settings</button>
        <button class="btn" data-action="change-password">Change my password</button>
      </div>`;
  };

  // ------------------------------------------------------------- actions --

  function setActions(html) {
    $("pageActions").innerHTML = html || "";
  }

  async function loadPage(name, argument) {
    state.page = name;
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.page === name);
    });
    $("pageTitle").textContent = name.charAt(0).toUpperCase() + name.slice(1);
    setActions("");
    $("page").innerHTML = '<div class="empty">Loading…</div>';
    try {
      $("page").innerHTML = await pages[name](argument);
    } catch (err) {
      $("page").innerHTML = `<div class="card"><div class="form-error">${esc(err.message)}</div></div>`;
    }
  }

  function categoryOptions(selectedId) {
    return state.categories
      .map(
        (category) =>
          `<option value="${category.id}" ${
            Number(selectedId) === category.id ? "selected" : ""
          }>${esc(category.name)} (${category.kind === "account" ? "Accounts" : "API keys"})</option>`
      )
      .join("");
  }

  function categoryForm(category) {
    return `
      <form id="categoryForm">
        <div class="field-row">
          <div class="field">
            <label>Name</label>
            <input id="catName" value="${esc(category ? category.name : "")}" required placeholder="API Keys" />
          </div>
          <div class="field">
            <label>Emoji</label>
            <input id="catEmoji" value="${esc(category ? category.emoji : "")}" placeholder="🔑" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Product type</label>
            <select id="catKind">
              <option value="api" ${!category || category.kind === "api" ? "selected" : ""}>API keys</option>
              <option value="account" ${category && category.kind === "account" ? "selected" : ""}>Accounts (username / password)</option>
            </select>
            <div class="hint">Account categories let you paste stock as <code>user:pass</code> lines.</div>
          </div>
          <div class="field">
            <label>Sort order</label>
            <input id="catOrder" type="number" value="${category ? category.sort_order : 0}" />
          </div>
        </div>
        <div class="field">
          <label class="checkbox">
            <input type="checkbox" id="catActive" ${!category || category.is_active ? "checked" : ""} />
            <span>Visible in the shop</span>
          </label>
        </div>
        <div class="form-error" id="catError" hidden></div>
        <button class="btn primary block" type="submit">${category ? "Save changes" : "Create category"}</button>
      </form>`;
  }

  function productForm(product) {
    const isManual = product && product.delivery_type === "manual";
    return `
      <form id="productForm">
        <div class="field">
          <label>Category</label>
          <select id="prodCategory">${categoryOptions(product ? product.category_id : null)}</select>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Product name</label>
            <input id="prodName" value="${esc(product ? product.name : "")}" required placeholder="Claude API — 50M tokens" />
          </div>
          <div class="field">
            <label>Price (USD)</label>
            <input id="prodPrice" type="number" min="0" step="0.01" value="${product ? product.priceUsd : ""}" required placeholder="49.99" />
          </div>
        </div>
        <div class="field">
          <label>Description shown before purchase</label>
          <textarea id="prodBefore" placeholder="What the customer gets, limits, validity…">${esc(product ? product.description_before : "")}</textarea>
        </div>
        <div class="field">
          <label>Instructions shown after purchase</label>
          <textarea id="prodAfter" placeholder="How to use the key, base URL, support notes…">${esc(product ? product.description_after : "")}</textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Delivery method</label>
            <select id="prodDelivery">
              <option value="auto" ${!isManual ? "selected" : ""}>Automatic — hand over a stock item</option>
              <option value="manual" ${isManual ? "selected" : ""}>Manual — buyer messages a contact</option>
            </select>
          </div>
          <div class="field">
            <label>Manual delivery contact</label>
            <input id="prodContact" value="${esc(product ? product.manual_contact : "")}" placeholder="@yoursupport" />
            <div class="hint">Only used for manual delivery.</div>
          </div>
        </div>
        ${
          product
            ? ""
            : `<div class="field">
                 <label>Initial stock (optional)</label>
                 <textarea id="prodStock" placeholder="One item per line.&#10;API keys: sk-ant-xxxxx&#10;Accounts: user@mail.com:password123"></textarea>
               </div>`
        }
        <div class="field-row">
          <div class="field">
            <label>Sort order</label>
            <input id="prodOrder" type="number" value="${product ? product.sort_order : 0}" />
          </div>
          <div class="field">
            <label style="visibility:hidden">.</label>
            <label class="checkbox">
              <input type="checkbox" id="prodActive" ${!product || product.is_active ? "checked" : ""} />
              <span>Live in the shop</span>
            </label>
          </div>
        </div>
        <div class="form-error" id="prodError" hidden></div>
        <button class="btn primary block" type="submit">${product ? "Save changes" : "Create product"}</button>
      </form>`;
  }

  const actions = {
    "refresh-page": () => loadPage(state.page),

    "new-category": () => {
      openModal("New category", categoryForm(null));
      $("categoryForm").addEventListener("submit", submitCategory(null));
    },
    "edit-category": async (id) => {
      const category = state.categories.find((c) => c.id === Number(id));
      openModal("Edit category", categoryForm(category));
      $("categoryForm").addEventListener("submit", submitCategory(id));
    },
    "delete-category": async (id) => {
      if (!confirm("Delete this category? Its products and stock will be deleted too.")) return;
      await api("/categories/" + id, { method: "DELETE" });
      toast("Category deleted");
      loadPage("categories");
    },

    "new-product": async () => {
      if (state.categories.length === 0) {
        const data = await api("/categories");
        state.categories = data.categories;
      }
      if (state.categories.length === 0) {
        return toast("Create a category first.", "bad");
      }
      openModal("New product", productForm(null));
      $("productForm").addEventListener("submit", submitProduct(null));
    },
    "edit-product": async (id) => {
      const data = await api("/products");
      const product = data.products.find((p) => p.id === Number(id));
      openModal("Edit product", productForm(product));
      $("productForm").addEventListener("submit", submitProduct(id));
    },
    "delete-product": async (id) => {
      if (!confirm("Delete this product and all of its unsold stock?")) return;
      await api("/products/" + id, { method: "DELETE" });
      toast("Product deleted");
      loadPage("products");
    },

    stock: async (id) => {
      const data = await api(`/products/${id}/stock`);
      const available = data.items.filter((i) => i.status === "available");
      const sold = data.items.filter((i) => i.status === "sold");

      openModal(
        "Manage stock",
        `<div class="field">
           <label>Add stock — one item per line</label>
           <textarea id="stockText" placeholder="sk-ant-api03-xxxxx&#10;sk-ant-api03-yyyyy&#10;&#10;For account products use:&#10;user@mail.com:password123"></textarea>
           <div class="hint">Each line becomes one deliverable unit and is sold to exactly one customer.</div>
         </div>
         <button class="btn primary block" data-action="add-stock" data-id="${id}">Add to stock</button>

         <div class="card-head" style="margin-top:22px"><h2>Available (${available.length})</h2></div>
         ${
           available.length === 0
             ? '<div class="muted small">Nothing in stock.</div>'
             : `<div class="table-wrap"><table><tbody>${available
                 .slice(0, 40)
                 .map(
                   (item) => `<tr>
                     <td class="mono">${esc(item.content.slice(0, 46))}${item.content.length > 46 ? "…" : ""}</td>
                     <td style="width:1%"><button class="btn small danger" data-action="delete-stock" data-id="${item.id}" data-product="${id}">Remove</button></td>
                   </tr>`
                 )
                 .join("")}</tbody></table></div>`
         }

         <div class="card-head" style="margin-top:22px"><h2>Sold (${sold.length})</h2></div>
         ${
           sold.length === 0
             ? '<div class="muted small">No sales yet.</div>'
             : `<div class="table-wrap"><table>
                 <thead><tr><th>Item</th><th>Buyer</th><th>Date</th></tr></thead>
                 <tbody>${sold
                   .slice(0, 40)
                   .map(
                     (item) => `<tr>
                       <td class="mono">${esc(item.content.slice(0, 30))}${item.content.length > 30 ? "…" : ""}</td>
                       <td>${esc(item.buyer_name || "")} ${item.buyer_username ? "@" + esc(item.buyer_username) : "#" + item.sold_to}</td>
                       <td class="cell-sub">${date(item.sold_at)}</td>
                     </tr>`
                   )
                   .join("")}</tbody></table></div>`
         }`
      );
    },
    "add-stock": async (id) => {
      const text = $("stockText").value.trim();
      if (!text) return toast("Paste at least one item.", "bad");
      const result = await api(`/products/${id}/stock`, {
        method: "POST",
        body: { stockText: text }
      });
      toast(`Added ${result.added} item(s)`);
      closeModal();
      loadPage("products");
    },
    "delete-stock": async (id, element) => {
      await api("/stock/" + id, { method: "DELETE" });
      toast("Stock item removed");
      actions.stock(element.dataset.product);
    },

    "filter-orders": (id, element) => loadPage("orders", element.value),
    "deliver-order": async (id) => {
      await api(`/orders/${id}/deliver`, { method: "POST" });
      toast("Delivered — the customer has been notified");
      loadPage("orders");
    },
    "refund-order": async (id) => {
      if (!confirm("Refund this order to the customer's wallet balance?")) return;
      await api(`/orders/${id}/refund`, { method: "POST" });
      toast("Order refunded");
      loadPage("orders");
    },
    "view-delivery": async (id) => {
      const data = await api("/orders?status=all&limit=500");
      const order = data.orders.find((o) => o.id === Number(id));
      openModal(
        `Order #${id}`,
        `<div class="field"><label>Delivered to the customer</label>
           <textarea readonly style="min-height:120px">${esc(order.delivered_text)}</textarea></div>`
      );
    },

    "search-users": () => loadPage("users", $("userSearch").value.trim()),
    "user-detail": async (id) => {
      const data = await api("/users/" + id);
      openModal(
        `${data.user.first_name || "Customer"} — #${data.user.id}`,
        `<div class="grid kpi" style="grid-template-columns:repeat(2,1fr)">
           <div class="kpi-card"><div class="kpi-label">Balance</div><div class="kpi-value" style="font-size:20px">${money(data.user.balanceUsd)}</div></div>
           <div class="kpi-card"><div class="kpi-label">Orders</div><div class="kpi-value" style="font-size:20px">${data.orders.length}</div></div>
         </div>
         <div class="card-head" style="margin-top:20px"><h2>Orders</h2></div>
         ${
           data.orders.length === 0
             ? '<div class="muted small">No orders.</div>'
             : `<div class="table-wrap"><table>
                 <thead><tr><th>#</th><th>Product</th><th class="num">Total</th><th>Status</th></tr></thead>
                 <tbody>${data.orders
                   .map(
                     (order) => `<tr>
                       <td class="mono">${order.id}</td>
                       <td>${esc(order.product_name)}</td>
                       <td class="num">${money(order.totalUsd)}</td>
                       <td>${statusBadge(order.status)}</td>
                     </tr>`
                   )
                   .join("")}</tbody></table></div>`
         }
         <div class="card-head" style="margin-top:20px"><h2>Wallet activity</h2></div>
         ${
           data.wallet.length === 0
             ? '<div class="muted small">No wallet activity.</div>'
             : `<div class="table-wrap"><table>
                 <thead><tr><th>Type</th><th class="num">Amount</th><th>Note</th><th>Date</th></tr></thead>
                 <tbody>${data.wallet
                   .map(
                     (row) => `<tr>
                       <td><span class="badge">${esc(row.type)}</span></td>
                       <td class="num" style="color:${Number(row.amountUsd) >= 0 ? "var(--good)" : "var(--bad)"}">${money(row.amountUsd)}</td>
                       <td class="cell-sub">${esc(row.description)}</td>
                       <td class="cell-sub">${date(row.created_at)}</td>
                     </tr>`
                   )
                   .join("")}</tbody></table></div>`
         }`
      );
    },
    "adjust-balance": (id) => {
      openModal(
        "Adjust wallet balance",
        `<form id="balanceForm">
           <div class="field">
             <label>Amount in USD</label>
             <input id="balAmount" type="number" step="0.01" required placeholder="25.00 — use a negative number to deduct" />
           </div>
           <div class="field">
             <label>Reason</label>
             <input id="balReason" placeholder="Manual deposit credit" />
           </div>
           <div class="form-error" id="balError" hidden></div>
           <button class="btn primary block" type="submit">Apply</button>
         </form>`
      );
      $("balanceForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          await api(`/users/${id}/balance`, {
            method: "POST",
            body: { amountUsd: $("balAmount").value, reason: $("balReason").value }
          });
          toast("Balance updated — the customer was notified");
          closeModal();
          loadPage("users");
        } catch (err) {
          const box = $("balError");
          box.textContent = err.message;
          box.hidden = false;
        }
      });
    },
    "toggle-block": async (id, element) => {
      const blocked = element.dataset.blocked === "1";
      await api(`/users/${id}/block`, { method: "POST", body: { blocked: !blocked } });
      toast(blocked ? "User unblocked" : "User blocked");
      loadPage("users");
    },
    broadcast: () => {
      openModal(
        "Broadcast to all customers",
        `<form id="broadcastForm">
           <div class="field">
             <label>Message</label>
             <textarea id="bcText" required placeholder="New API keys just landed…" style="min-height:130px"></textarea>
             <div class="hint">Sent to every customer who has not blocked the bot, at about 25 messages per second.</div>
           </div>
           <button class="btn primary block" type="submit">Send broadcast</button>
         </form>`
      );
      $("broadcastForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const result = await api("/broadcast", {
          method: "POST",
          body: { text: $("bcText").value }
        });
        toast(`Broadcast queued for ${result.queued} customer(s)`);
        closeModal();
      });
    },

    "resolve-deposit": (id, element) => {
      openModal(
        "Resolve unmatched deposit",
        `<p class="muted small">Received <strong>${esc(element.dataset.amount)}</strong>.
           Credit it to the right customer, or close it with a note.</p>
         <form id="depositForm">
           <div class="field-row">
             <div class="field">
               <label>Customer Telegram ID</label>
               <input id="depUser" placeholder="123456789" />
             </div>
             <div class="field">
               <label>Credit in USD</label>
               <input id="depAmount" type="number" step="0.01" placeholder="25.00" />
             </div>
           </div>
           <div class="field">
             <label>Note</label>
             <input id="depNote" placeholder="Sent the wrong amount, credited manually" />
           </div>
           <div class="form-error" id="depError" hidden></div>
           <button class="btn primary block" type="submit">Resolve</button>
         </form>`
      );
      $("depositForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          await api(`/deposits/${id}/resolve`, {
            method: "POST",
            body: {
              userId: $("depUser").value || null,
              creditUsd: $("depAmount").value || "0",
              note: $("depNote").value
            }
          });
          toast("Deposit resolved");
          closeModal();
          loadPage("payments");
        } catch (err) {
          const box = $("depError");
          box.textContent = err.message;
          box.hidden = false;
        }
      });
    },

    "new-discount": () => {
      openModal(
        "New discount code",
        `<form id="discountForm">
           <div class="field-row">
             <div class="field">
               <label>Code</label>
               <input id="dcCode" required placeholder="WELCOME10" style="text-transform:uppercase" />
             </div>
             <div class="field">
               <label>Type</label>
               <select id="dcType">
                 <option value="percent">Percentage off</option>
                 <option value="fixed">Fixed amount off (USD)</option>
               </select>
             </div>
           </div>
           <div class="field-row">
             <div class="field">
               <label>Value</label>
               <input id="dcValue" type="number" step="0.01" required placeholder="10" />
               <div class="hint">Percent: 1–100. Fixed: USD amount.</div>
             </div>
             <div class="field">
               <label>Max uses (0 = unlimited)</label>
               <input id="dcMax" type="number" min="0" value="0" />
             </div>
           </div>
           <div class="field-row">
             <div class="field">
               <label>Minimum order total (USD)</label>
               <input id="dcMin" type="number" step="0.01" min="0" value="0" />
             </div>
             <div class="field">
               <label>Expires on</label>
               <input id="dcExpires" type="date" />
             </div>
           </div>
           <div class="form-error" id="dcError" hidden></div>
           <button class="btn primary block" type="submit">Create code</button>
         </form>`
      );
      $("discountForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          await api("/discounts", {
            method: "POST",
            body: {
              code: $("dcCode").value,
              type: $("dcType").value,
              value: $("dcValue").value,
              maxUses: $("dcMax").value,
              minTotalUsd: $("dcMin").value,
              expiresAt: $("dcExpires").value || null
            }
          });
          toast("Discount code created");
          closeModal();
          loadPage("discounts");
        } catch (err) {
          const box = $("dcError");
          box.textContent = err.message;
          box.hidden = false;
        }
      });
    },
    "toggle-discount": async (id, element) => {
      await api("/discounts/" + id, {
        method: "PUT",
        body: { isActive: element.dataset.active !== "1" }
      });
      loadPage("discounts");
    },
    "delete-discount": async (id) => {
      if (!confirm("Delete this discount code?")) return;
      await api("/discounts/" + id, { method: "DELETE" });
      toast("Code deleted");
      loadPage("discounts");
    },

    "save-settings": async (id, element) => {
      const payload = {};
      document.querySelectorAll("[data-setting]").forEach((input) => {
        payload[input.dataset.setting] =
          input.type === "checkbox" ? (input.checked ? "1" : "0") : input.value;
      });
      element.disabled = true;
      element.textContent = "Saving…";
      try {
        await api("/settings", { method: "PUT", body: payload });
        toast("Settings saved");
      } catch (err) {
        toast(err.message, "bad");
      } finally {
        element.disabled = false;
        element.textContent = "Save all settings";
      }
    },
    "change-password": () => {
      openModal(
        "Change password",
        `<form id="passwordForm">
           <div class="field">
             <label>Current password</label>
             <input id="pwCurrent" type="password" required autocomplete="current-password" />
           </div>
           <div class="field">
             <label>New password</label>
             <input id="pwNew" type="password" required minlength="8" autocomplete="new-password" />
             <div class="hint">At least 8 characters.</div>
           </div>
           <div class="form-error" id="pwError" hidden></div>
           <button class="btn primary block" type="submit">Update password</button>
         </form>`
      );
      $("passwordForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          await api("/password", {
            method: "POST",
            body: { currentPassword: $("pwCurrent").value, newPassword: $("pwNew").value }
          });
          toast("Password updated");
          closeModal();
        } catch (err) {
          const box = $("pwError");
          box.textContent = err.message;
          box.hidden = false;
        }
      });
    }
  };

  function submitCategory(id) {
    return async (event) => {
      event.preventDefault();
      const body = {
        name: $("catName").value,
        kind: $("catKind").value,
        emoji: $("catEmoji").value,
        sortOrder: $("catOrder").value,
        isActive: $("catActive").checked
      };
      try {
        if (id) await api("/categories/" + id, { method: "PUT", body });
        else await api("/categories", { method: "POST", body });
        toast(id ? "Category updated" : "Category created");
        closeModal();
        loadPage("categories");
      } catch (err) {
        const box = $("catError");
        box.textContent = err.message;
        box.hidden = false;
      }
    };
  }

  function submitProduct(id) {
    return async (event) => {
      event.preventDefault();
      const body = {
        categoryId: $("prodCategory").value,
        name: $("prodName").value,
        priceUsd: $("prodPrice").value,
        descriptionBefore: $("prodBefore").value,
        descriptionAfter: $("prodAfter").value,
        deliveryType: $("prodDelivery").value,
        manualContact: $("prodContact").value,
        sortOrder: $("prodOrder").value,
        isActive: $("prodActive").checked
      };
      const stockField = $("prodStock");
      if (stockField) body.stockText = stockField.value;

      try {
        if (id) await api("/products/" + id, { method: "PUT", body });
        else await api("/products", { method: "POST", body });
        toast(id ? "Product updated" : "Product created");
        closeModal();
        loadPage("products");
      } catch (err) {
        const box = $("prodError");
        box.textContent = err.message;
        box.hidden = false;
      }
    };
  }

  // ------------------------------------------------------------ bindings --

  document.addEventListener("click", async (event) => {
    const navItem = event.target.closest(".nav-item");
    if (navItem) return loadPage(navItem.dataset.page);

    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    const handler = actions[actionEl.dataset.action];
    if (!handler) return;
    try {
      await handler(actionEl.dataset.id, actionEl);
    } catch (err) {
      toast(err.message, "bad");
    }
  });

  document.addEventListener("change", (event) => {
    const select = event.target.closest("select[data-action]");
    if (select && actions[select.dataset.action]) {
      actions[select.dataset.action](select.dataset.id, select);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  $("modalClose").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (event) => {
    if (event.target === $("modal")) closeModal();
  });

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const box = $("loginError");
    box.hidden = true;
    try {
      const result = await api("/login", {
        method: "POST",
        body: { username: $("loginUser").value, password: $("loginPass").value }
      });
      showPanel(result.username);
    } catch (err) {
      box.textContent = err.message;
      box.hidden = false;
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    await api("/logout", { method: "POST" }).catch(() => {});
    showLogin();
  });

  function showLogin() {
    $("panel").hidden = true;
    $("login").hidden = false;
    $("modal").hidden = true;
  }

  function showPanel(username) {
    $("login").hidden = true;
    $("panel").hidden = false;
    $("whoami").textContent = "Signed in as " + username;
    loadPage("dashboard");
  }

  // Resume an existing session on reload.
  (async function boot() {
    try {
      const session = await api("/session");
      showPanel(session.username);
    } catch (err) {
      showLogin();
    }
  })();
})();
