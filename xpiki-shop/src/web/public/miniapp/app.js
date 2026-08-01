/* xpiki api shop — Telegram Mini App front-end */
(function () {
  "use strict";

  const tg = window.Telegram && window.Telegram.WebApp;
  const view = document.getElementById("view");

  const state = {
    me: null,
    catalog: null,
    paymentOptions: [],
    tab: "shop",
    // Stack of rendered screens so the Telegram back button can unwind them.
    history: [],
    invoicePoll: null
  };

  // ------------------------------------------------------------- helpers --

  function api(path, options) {
    const config = Object.assign({ headers: {} }, options || {});
    config.headers["content-type"] = "application/json";
    config.headers["x-telegram-init-data"] = (tg && tg.initData) || "";
    if (config.body && typeof config.body !== "string") {
      config.body = JSON.stringify(config.body);
    }
    return fetch("/api" + path, config).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Request failed");
      return body;
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(value) {
    const number = Number(value || 0);
    return "$" + number.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  let toastTimer = null;
  function toast(message, isError) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.className = "toast" + (isError ? " bad" : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function haptic(type) {
    if (tg && tg.HapticFeedback) {
      try { tg.HapticFeedback.notificationOccurred(type); } catch (err) { /* ignore */ }
    }
  }

  function copyText(text) {
    const done = () => { toast("Copied"); haptic("success"); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      try { document.execCommand("copy"); done(); } catch (err) { toast("Copy failed", true); }
      document.body.removeChild(input);
    }
  }

  /** Render a screen and remember how to get back to the previous one. */
  function show(html, { push = true } = {}) {
    if (push) state.history.push(view.innerHTML);
    view.innerHTML = html;
    window.scrollTo(0, 0);
    updateBackButton();
  }

  function goBack() {
    if (state.history.length === 0) return;
    stopInvoicePoll();
    view.innerHTML = state.history.pop();
    bindScreen();
    updateBackButton();
  }

  function updateBackButton() {
    if (!tg || !tg.BackButton) return;
    if (state.history.length > 0) tg.BackButton.show();
    else tg.BackButton.hide();
  }

  function resetHistory() {
    state.history = [];
    stopInvoicePoll();
    updateBackButton();
  }

  function setBalance(value) {
    document.getElementById("balanceChip").textContent = money(value);
  }

  function emptyState(icon, message) {
    return `<div class="empty"><span class="empty-icon">${icon}</span>${escapeHtml(message)}</div>`;
  }

  // ------------------------------------------------------------- screens --

  function renderShop() {
    const categories = (state.catalog && state.catalog.categories) || [];
    const withProducts = categories.filter((c) => c.products.length > 0);

    if (withProducts.length === 0) {
      return emptyState("🛍", "The shop is being restocked. Please check back soon.");
    }

    return withProducts
      .map((category) => {
        const items = category.products
          .map((product) => {
            const stockBadge =
              product.deliveryType === "manual"
                ? '<span class="badge">Manual delivery</span>'
                : product.stockCount > 0
                  ? `<span class="badge good">${product.stockCount} in stock</span>`
                  : '<span class="badge bad">Sold out</span>';

            return `
              <div class="card card-tap" data-product="${product.id}">
                <div class="row">
                  <div class="col">
                    <div class="title truncate">${escapeHtml(product.name)}</div>
                    <div class="muted truncate">${escapeHtml(
                      (product.descriptionBefore || "").split("\n")[0]
                    )}</div>
                    <div style="margin-top:4px">${stockBadge}</div>
                  </div>
                  <div class="price">${money(product.priceUsd)}</div>
                </div>
              </div>`;
          })
          .join("");

        return `
          <div class="section-title">${escapeHtml(
            (category.emoji ? category.emoji + " " : "") + category.name
          )}</div>
          ${items}`;
      })
      .join("");
  }

  function renderProduct(product) {
    const stockLine =
      product.deliveryType === "manual"
        ? "Delivered by our team right after payment."
        : product.stockCount > 0
          ? `${product.stockCount} available — delivered instantly.`
          : "Currently sold out.";

    return `
      <button class="back" data-back>← Back</button>
      <div class="card">
        <div class="title" style="font-size:18px">${escapeHtml(product.name)}</div>
        <div class="muted" style="margin-top:8px; white-space:pre-wrap">${escapeHtml(
          product.descriptionBefore || "No description provided."
        )}</div>
      </div>
      <div class="card">
        <div class="kv"><span>Price</span><span class="price">${money(product.priceUsd)}</span></div>
        <div class="kv"><span>Category</span><span>${escapeHtml(product.categoryName || "")}</span></div>
        <div class="kv"><span>Availability</span><span>${escapeHtml(stockLine)}</span></div>
      </div>
      ${
        product.purchasable
          ? `<button class="btn" data-buy="${product.id}">Buy for ${money(product.priceUsd)}</button>`
          : `<button class="btn" disabled>Sold out</button>`
      }`;
  }

  function renderCheckout(quote, productId, code) {
    const total = Number(quote.totalUsd);
    const canUseWallet = Number(quote.balanceUsd) >= total;

    return `
      <button class="back" data-back>← Back</button>
      <div class="section-title">Order summary</div>
      <div class="card">
        <div class="kv"><span>Product</span><span>${escapeHtml(quote.product.name)}</span></div>
        <div class="kv"><span>Price</span><span>${money(quote.priceUsd)}</span></div>
        ${
          Number(quote.discountUsd) > 0
            ? `<div class="kv"><span>Discount (${escapeHtml(code)})</span><span>-${money(
                quote.discountUsd
              )}</span></div>`
            : ""
        }
        <div class="kv"><span>Total</span><span class="price">${money(quote.totalUsd)}</span></div>
      </div>

      <div class="section-title">Discount code</div>
      <div class="card">
        <div class="btn-row">
          <input id="codeInput" placeholder="Enter code" value="${escapeHtml(code || "")}" />
          <button class="btn secondary" style="flex:0 0 auto; width:auto" data-apply="${productId}">Apply</button>
        </div>
        ${
          quote.discountError
            ? `<div class="muted" style="margin-top:8px; color:var(--bad)">${escapeHtml(
                quote.discountError
              )}</div>`
            : ""
        }
      </div>

      <div class="section-title">Payment method</div>
      <div class="stack">
        <button class="btn" data-pay-wallet="${productId}" ${canUseWallet ? "" : "disabled"}>
          👛 Pay from wallet — ${money(quote.balanceUsd)} available
        </button>
        ${
          canUseWallet
            ? ""
            : '<div class="muted" style="text-align:center">Not enough balance for wallet payment.</div>'
        }
        <button class="btn secondary" data-pay-crypto="${productId}">🪙 Pay with crypto</button>
      </div>`;
  }

  function renderAssetPicker(purpose, payload) {
    const options = state.paymentOptions
      .map(
        (option) => `
          <div class="card card-tap" data-asset="${escapeHtml(option.key)}">
            <div class="row">
              <div class="col">
                <div class="title">${escapeHtml(option.label)}</div>
                <div class="muted">${escapeHtml(option.network)}</div>
              </div>
              <div style="color:var(--muted)">›</div>
            </div>
          </div>`
      )
      .join("");

    return `
      <button class="back" data-back>← Back</button>
      <div class="section-title">Choose a currency</div>
      ${options || emptyState("🪙", "No crypto payment method is configured yet.")}
      <input type="hidden" id="payPurpose" value="${escapeHtml(purpose)}" />
      <input type="hidden" id="payPayload" value="${escapeHtml(JSON.stringify(payload))}" />`;
  }

  function renderInvoice(invoice) {
    const statusBadge = {
      pending: '<span class="badge warn">Awaiting payment</span>',
      confirming: '<span class="badge warn">Confirming on-chain…</span>',
      confirmed: '<span class="badge good">Paid ✓</span>',
      expired: '<span class="badge bad">Expired</span>',
      canceled: '<span class="badge bad">Canceled</span>'
    };

    return `
      <button class="back" data-back>← Back</button>
      <div class="card">
        <div class="row">
          <div class="col">
            <div class="muted">Invoice #${invoice.id}</div>
            <div class="title">${escapeHtml(invoice.network)}</div>
          </div>
          <div id="invStatus">${statusBadge[invoice.status] || ""}</div>
        </div>

        <div class="section-title" style="margin-top:16px">Send exactly</div>
        <div class="pay-amount">${escapeHtml(invoice.amount)} ${escapeHtml(invoice.symbol)}</div>
        <div class="copy-box">
          <code>${escapeHtml(invoice.amount)}</code>
          <button class="copy-btn" data-copy="${escapeHtml(invoice.amount)}">Copy</button>
        </div>

        <div class="section-title" style="margin-top:16px">To this address</div>
        <div class="copy-box">
          <code>${escapeHtml(invoice.address)}</code>
          <button class="copy-btn" data-copy="${escapeHtml(invoice.address)}">Copy</button>
        </div>

        <div class="kv" style="margin-top:14px"><span>Value</span><span>${money(invoice.usd)}</span></div>
        <div class="kv"><span>Rate</span><span>${escapeHtml(invoice.rate)}</span></div>
      </div>

      <div class="notice">
        <strong>Read before sending</strong>
        <ul>
          <li>Send the <strong>exact</strong> amount — the final digits identify your payment.</li>
          <li>Pay network fees on top; do not deduct them from the amount.</li>
          <li>Use the <strong>${escapeHtml(invoice.network)}</strong> network only.</li>
        </ul>
      </div>

      <div class="stack" style="margin-top:12px">
        <button class="btn" data-check="${invoice.id}">I have paid — check now</button>
        <button class="btn ghost" data-cancel-invoice="${invoice.id}">Cancel invoice</button>
      </div>`;
  }

  function renderOrders(orders) {
    if (orders.length === 0) {
      return emptyState("📦", "You have not placed any orders yet.");
    }

    const label = {
      pending_payment: ['<span class="badge warn">Awaiting payment</span>'],
      paid: ['<span class="badge warn">Preparing</span>'],
      delivered: ['<span class="badge good">Delivered</span>'],
      awaiting_manual: ['<span class="badge warn">Contact us to collect</span>'],
      canceled: ['<span class="badge bad">Canceled</span>'],
      expired: ['<span class="badge bad">Expired</span>'],
      refunded: ['<span class="badge">Refunded</span>']
    };

    return orders
      .map((order) => {
        const delivered = order.deliveredText
          ? `<div class="delivered">${escapeHtml(order.deliveredText)}</div>
             <button class="btn secondary" style="margin-top:9px" data-copy="${escapeHtml(
               order.deliveredText
             )}">Copy</button>`
          : "";
        const payButton =
          order.status === "pending_payment"
            ? `<button class="btn" style="margin-top:9px" data-resume="${order.id}">Complete payment</button>`
            : "";

        return `
          <div class="card">
            <div class="row">
              <div class="col">
                <div class="title truncate">${escapeHtml(order.productName)}</div>
                <div class="muted">Order #${order.id} · ${escapeHtml(
                  (order.createdAt || "").slice(0, 16)
                )}</div>
              </div>
              <div class="price">${money(order.totalUsd)}</div>
            </div>
            <div style="margin-top:8px">${(label[order.status] || [order.status])[0]}</div>
            ${delivered}
            ${payButton}
          </div>`;
      })
      .join("");
  }

  function renderWallet(wallet) {
    const rows = wallet.transactions
      .map((entry) => {
        const amount = Number(entry.amountUsd);
        const color = amount >= 0 ? "var(--good)" : "var(--bad)";
        const sign = amount >= 0 ? "+" : "";
        return `
          <div class="card">
            <div class="row">
              <div class="col">
                <div class="title truncate" style="font-size:14px">${escapeHtml(
                  entry.description || entry.type
                )}</div>
                <div class="muted">${escapeHtml((entry.createdAt || "").slice(0, 16))}</div>
              </div>
              <div style="color:${color}; font-weight:700; white-space:nowrap">${sign}${money(
                Math.abs(amount)
              )}</div>
            </div>
          </div>`;
      })
      .join("");

    return `
      <div class="card" style="text-align:center">
        <div class="muted">Available balance</div>
        <div style="font-size:34px; font-weight:750; margin:6px 0 14px">${money(
          wallet.balanceUsd
        )}</div>
        <button class="btn" data-topup>➕ Top up balance</button>
      </div>
      <div class="section-title">Activity</div>
      ${rows || emptyState("📜", "No wallet activity yet.")}`;
  }

  function renderTopup() {
    return `
      <button class="back" data-back>← Back</button>
      <div class="section-title">Top up your wallet</div>
      <div class="card">
        <div class="field">
          <label>Amount in USD</label>
          <input id="topupAmount" type="number" inputmode="decimal" min="${escapeHtml(
            state.me.minTopupUsd
          )}" step="0.01" placeholder="25.00" />
        </div>
        <div class="muted">Minimum ${money(state.me.minTopupUsd)}. Credited automatically once the payment confirms.</div>
      </div>
      <div class="btn-row">
        ${[10, 25, 50, 100]
          .map((amount) => `<button class="btn secondary" data-preset="${amount}">$${amount}</button>`)
          .join("")}
      </div>
      <button class="btn" style="margin-top:12px" data-topup-next>Continue</button>`;
  }

  function renderAccount() {
    const me = state.me;
    const link = `https://t.me/${state.botUsername || ""}?start=ref_${me.referralCode}`;

    return `
      <div class="card">
        <div class="row">
          <div class="col">
            <div class="title">${escapeHtml(me.firstName || "Customer")}</div>
            <div class="muted">${me.username ? "@" + escapeHtml(me.username) : "ID " + me.id}</div>
          </div>
          <div class="price">${money(me.balanceUsd)}</div>
        </div>
      </div>

      <div class="section-title">Referral program</div>
      <div class="card">
        <div class="muted">Earn <strong style="color:var(--text)">${escapeHtml(
          String(me.referralPercent)
        )}%</strong> of every purchase your invites make, credited straight to your wallet.</div>
        <div class="copy-box" style="margin-top:11px">
          <code>${escapeHtml(link)}</code>
          <button class="copy-btn" data-copy="${escapeHtml(link)}">Copy</button>
        </div>
        <div class="kv" style="margin-top:12px"><span>Invited</span><span>${me.referralInvited}</span></div>
        <div class="kv"><span>Earned</span><span>${money(me.referralEarnedUsd)}</span></div>
      </div>

      ${
        me.supportUsername
          ? `<div class="section-title">Need help?</div>
             <button class="btn secondary" data-support="${escapeHtml(me.supportUsername)}">
               ☎️ Contact support
             </button>`
          : ""
      }`;
  }

  // --------------------------------------------------------------- flows --

  async function openProduct(productId) {
    try {
      const product = await api("/products/" + productId);
      show(renderProduct(product));
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function openCheckout(productId, code) {
    try {
      const quote = await api("/quote", {
        method: "POST",
        body: { productId: Number(productId), discountCode: code || "" }
      });
      show(renderCheckout(quote, productId, code || ""));
    } catch (err) {
      toast(err.message, true);
    }
  }

  /** Replace the current screen without stacking another history entry. */
  async function refreshCheckout(productId, code) {
    try {
      const quote = await api("/quote", {
        method: "POST",
        body: { productId: Number(productId), discountCode: code || "" }
      });
      show(renderCheckout(quote, productId, code || ""), { push: false });
      if (Number(quote.discountUsd) > 0) toast("Discount applied");
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function payFromWallet(productId) {
    const code = (document.getElementById("codeInput") || {}).value || "";
    try {
      const order = await api("/orders", {
        method: "POST",
        body: { productId: Number(productId), discountCode: code }
      });
      const result = await api(`/orders/${order.id}/pay-wallet`, { method: "POST" });
      setBalance(result.balanceUsd);
      state.me.balanceUsd = result.balanceUsd;
      haptic("success");
      toast("Paid — check your orders");
      resetHistory();
      switchTab("orders");
    } catch (err) {
      haptic("error");
      toast(err.message, true);
    }
  }

  async function startCryptoForProduct(productId) {
    const code = (document.getElementById("codeInput") || {}).value || "";
    try {
      const order = await api("/orders", {
        method: "POST",
        body: { productId: Number(productId), discountCode: code }
      });
      show(renderAssetPicker("order", { orderId: order.id }));
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function createInvoice(assetKey) {
    const purpose = document.getElementById("payPurpose").value;
    const payload = JSON.parse(document.getElementById("payPayload").value || "{}");
    try {
      const invoice = await api("/invoices", {
        method: "POST",
        body: Object.assign({ assetKey, purpose }, payload)
      });
      show(renderInvoice(invoice));
      startInvoicePoll(invoice.id);
    } catch (err) {
      toast(err.message, true);
    }
  }

  // The watcher credits payments on its own; this poll only refreshes the UI.
  function startInvoicePoll(invoiceId) {
    stopInvoicePoll();
    state.invoicePoll = setInterval(async () => {
      try {
        const invoice = await api("/invoices/" + invoiceId);
        const badge = document.getElementById("invStatus");
        if (!badge) return stopInvoicePoll();

        if (invoice.status === "confirming") {
          badge.innerHTML = '<span class="badge warn">Confirming on-chain…</span>';
        }
        if (invoice.status === "confirmed") {
          stopInvoicePoll();
          haptic("success");
          await loadMe();
          toast(invoice.purpose === "topup" ? "Wallet topped up!" : "Payment confirmed!");
          resetHistory();
          switchTab(invoice.purpose === "topup" ? "wallet" : "orders");
        }
        if (["expired", "canceled"].includes(invoice.status)) {
          stopInvoicePoll();
          badge.innerHTML = '<span class="badge bad">Expired</span>';
        }
      } catch (err) {
        /* transient network errors are ignored; the next tick retries */
      }
    }, 12000);
  }

  function stopInvoicePoll() {
    if (state.invoicePoll) clearInterval(state.invoicePoll);
    state.invoicePoll = null;
  }

  async function checkInvoiceNow(invoiceId, button) {
    button.disabled = true;
    button.textContent = "Checking the blockchain…";
    try {
      const invoice = await api(`/invoices/${invoiceId}/check`, { method: "POST" });
      if (invoice.status === "confirmed") {
        haptic("success");
        await loadMe();
        toast("Payment confirmed!");
        resetHistory();
        switchTab(invoice.purpose === "topup" ? "wallet" : "orders");
        return;
      }
      toast(
        invoice.status === "confirming"
          ? "Payment seen — waiting for confirmations"
          : "No payment found yet. Give the network a few minutes."
      );
    } catch (err) {
      toast(err.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "I have paid — check now";
    }
  }

  async function resumeOrder(orderId) {
    show(renderAssetPicker("order", { orderId: Number(orderId) }));
  }

  // ---------------------------------------------------------------- tabs --

  async function switchTab(tab) {
    state.tab = tab;
    resetHistory();
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tab);
    });

    view.innerHTML = '<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>';

    try {
      if (tab === "shop") {
        state.catalog = await api("/catalog");
        show(renderShop(), { push: false });
      } else if (tab === "orders") {
        const data = await api("/orders");
        show(renderOrders(data.orders), { push: false });
      } else if (tab === "wallet") {
        const wallet = await api("/wallet");
        setBalance(wallet.balanceUsd);
        show(renderWallet(wallet), { push: false });
      } else if (tab === "account") {
        await loadMe();
        show(renderAccount(), { push: false });
      }
    } catch (err) {
      show(emptyState("⚠️", err.message), { push: false });
    }
    bindScreen();
  }

  async function loadMe() {
    state.me = await api("/me");
    setBalance(state.me.balanceUsd);
    document.getElementById("shopName").textContent = state.me.shopName;
    document.getElementById("userName").textContent = state.me.firstName
      ? "Hi, " + state.me.firstName
      : "";
    return state.me;
  }

  // ------------------------------------------------------------ bindings --

  /** One delegated click handler covers every screen we render. */
  function bindScreen() {
    // Nothing to do: all clicks are handled by the document listener below.
  }

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-copy], [data-product], [data-buy], [data-back]," +
      "[data-apply], [data-pay-wallet], [data-pay-crypto], [data-asset], [data-check]," +
      "[data-cancel-invoice], [data-topup], [data-preset], [data-topup-next], [data-resume]," +
      "[data-support], .tab");
    if (!target) return;

    if (target.classList.contains("tab")) {
      return switchTab(target.dataset.tab);
    }
    if (target.hasAttribute("data-back")) return goBack();
    if (target.hasAttribute("data-copy")) return copyText(target.getAttribute("data-copy"));

    if (target.hasAttribute("data-product")) {
      return openProduct(target.getAttribute("data-product"));
    }
    if (target.hasAttribute("data-buy")) {
      return openCheckout(target.getAttribute("data-buy"), "");
    }
    if (target.hasAttribute("data-apply")) {
      const code = (document.getElementById("codeInput") || {}).value || "";
      return refreshCheckout(target.getAttribute("data-apply"), code.trim());
    }
    if (target.hasAttribute("data-pay-wallet")) {
      return payFromWallet(target.getAttribute("data-pay-wallet"));
    }
    if (target.hasAttribute("data-pay-crypto")) {
      return startCryptoForProduct(target.getAttribute("data-pay-crypto"));
    }
    if (target.hasAttribute("data-asset")) {
      return createInvoice(target.getAttribute("data-asset"));
    }
    if (target.hasAttribute("data-check")) {
      return checkInvoiceNow(target.getAttribute("data-check"), target);
    }
    if (target.hasAttribute("data-cancel-invoice")) {
      await api(`/invoices/${target.getAttribute("data-cancel-invoice")}/cancel`, {
        method: "POST"
      }).catch(() => {});
      stopInvoicePoll();
      toast("Invoice canceled");
      return goBack();
    }
    if (target.hasAttribute("data-resume")) {
      return resumeOrder(target.getAttribute("data-resume"));
    }
    if (target.hasAttribute("data-topup")) {
      return show(renderTopup());
    }
    if (target.hasAttribute("data-preset")) {
      const input = document.getElementById("topupAmount");
      if (input) input.value = target.getAttribute("data-preset");
      return;
    }
    if (target.hasAttribute("data-topup-next")) {
      const amount = (document.getElementById("topupAmount") || {}).value;
      if (!amount || Number(amount) < Number(state.me.minTopupUsd)) {
        return toast(`Minimum top-up is ${money(state.me.minTopupUsd)}`, true);
      }
      return show(renderAssetPicker("topup", { amountUsd: String(amount) }));
    }
    if (target.hasAttribute("data-support")) {
      const handle = target.getAttribute("data-support").replace(/^@/, "");
      const url = "https://t.me/" + handle;
      if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
      else window.open(url, "_blank");
    }
  });

  // ------------------------------------------------------------- startup --

  async function boot() {
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.BackButton) tg.BackButton.onClick(goBack);
      if (tg.setHeaderColor) {
        try { tg.setHeaderColor("secondary_bg_color"); } catch (err) { /* older clients */ }
      }
    }

    try {
      await loadMe();
      state.paymentOptions = (await api("/payment-options")).options;
      // Used to build the referral deep link on the Account tab.
      state.botUsername = state.me.botUsername || "";
      document.getElementById("boot").hidden = true;
      document.getElementById("app").hidden = false;
      await switchTab("shop");
    } catch (err) {
      document.getElementById("boot").innerHTML =
        `<div class="empty"><span class="empty-icon">⚠️</span>${escapeHtml(err.message)}<br><br>` +
        `<span class="muted">Open this page from inside Telegram.</span></div>`;
    }
  }

  boot();
})();
