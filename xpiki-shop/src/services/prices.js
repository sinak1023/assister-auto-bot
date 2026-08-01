const { settings } = require("../db");
const { usdToMicros } = require("../lib/money");
const { createLogger } = require("../lib/logger");

const log = createLogger("prices");

// Alchemy's Prices API is the source of truth. Quotes are cached briefly so a
// burst of checkouts does not fan out into a burst of HTTP calls.
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // symbol -> { micros, fetchedAt }

// USDT is a dollar stablecoin; treating it as exactly $1 avoids charging a
// customer $0.9997 worth of USDT and then failing the exact-amount match.
const HARDCODED = { USDT: 1000000n };

async function fetchFromAlchemy(symbols) {
  const apiKey = settings.get("alchemy_api_key", "").trim();
  if (!apiKey) throw new Error("Alchemy API key is not configured");

  const query = symbols.map((s) => `symbols=${encodeURIComponent(s)}`).join("&");
  const url = `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-symbol?${query}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Alchemy prices responded ${response.status}`);
    }
    const body = await response.json();
    const result = new Map();
    for (const entry of body.data || []) {
      const usd = (entry.prices || []).find((p) => p.currency === "usd");
      if (entry.symbol && usd && usd.value) {
        result.set(entry.symbol.toUpperCase(), usdToMicros(usd.value));
      }
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * USD price of one whole unit of `symbol`, in micros.
 * Falls back to the last cached quote if the provider is briefly unavailable.
 */
async function getUsdPriceMicros(symbol) {
  const upper = symbol.toUpperCase();
  if (HARDCODED[upper]) return HARDCODED[upper];

  const cached = cache.get(upper);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.micros;

  try {
    const prices = await fetchFromAlchemy([upper]);
    const micros = prices.get(upper);
    if (!micros || micros <= 0n) throw new Error(`No USD price returned for ${upper}`);
    cache.set(upper, { micros, fetchedAt: Date.now() });
    return micros;
  } catch (err) {
    if (cached) {
      log.warn(`Using stale ${upper} price after provider error: ${err.message}`);
      return cached.micros;
    }
    throw err;
  }
}

/** Warm the cache for every symbol the shop can quote. */
async function preload(symbols) {
  const needed = symbols.filter((s) => !HARDCODED[s.toUpperCase()]);
  if (needed.length === 0) return;
  try {
    const prices = await fetchFromAlchemy(needed);
    for (const [symbol, micros] of prices) {
      cache.set(symbol, { micros, fetchedAt: Date.now() });
    }
  } catch (err) {
    log.warn(`Price preload failed: ${err.message}`);
  }
}

module.exports = { getUsdPriceMicros, preload };
