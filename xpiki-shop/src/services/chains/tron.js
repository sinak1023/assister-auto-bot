const { settings } = require("../../db");
const { createLogger } = require("../../lib/logger");

const log = createLogger("chain:tron");

// Alchemy does not support Tron, so TRC20 payments are watched through
// TronGrid. An API key is optional but strongly recommended: anonymous
// requests are rate limited hard enough to delay payment detection.
const API_BASE = "https://api.trongrid.io";

async function request(path, { method = "GET", body } = {}) {
  const headers = { accept: "application/json" };
  if (body) headers["content-type"] = "application/json";
  const apiKey = settings.get("trongrid_api_key", "").trim();
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`TronGrid ${path} responded ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getNowBlock() {
  const block = await request("/wallet/getnowblock", { method: "POST", body: {} });
  return block?.block_header?.raw_data?.number || 0;
}

/** Block height a transaction landed in, or 0 when it is not mined yet. */
async function getTransactionBlock(txId) {
  try {
    const info = await request("/wallet/gettransactioninfobyid", {
      method: "POST",
      body: { value: txId }
    });
    return info?.blockNumber || 0;
  } catch (err) {
    log.warn(`Could not resolve block for ${txId}: ${err.message}`);
    return 0;
  }
}

/**
 * Incoming TRC20 transfers to `address` with a block timestamp newer than
 * `sinceTimestamp` (milliseconds).
 * Returns { transfers, newestTimestamp }.
 */
async function getIncomingTransfers(contract, address, sinceTimestamp) {
  const params = new URLSearchParams({
    only_to: "true",
    limit: "100",
    order_by: "block_timestamp,asc",
    contract_address: contract
  });
  if (sinceTimestamp > 0) params.set("min_timestamp", String(sinceTimestamp + 1));

  const body = await request(
    `/v1/accounts/${address}/transactions/trc20?${params.toString()}`
  );

  const transfers = [];
  let newestTimestamp = sinceTimestamp;

  for (const entry of body.data || []) {
    if (entry.to !== address) continue;
    if (entry.type && entry.type !== "Transfer") continue;

    const timestamp = Number(entry.block_timestamp || 0);
    if (timestamp > newestTimestamp) newestTimestamp = timestamp;

    transfers.push({
      txHash: entry.transaction_id,
      logIndex: "trc20",
      from: entry.from || "",
      amountUnits: BigInt(entry.value || "0"),
      blockNumber: 0,
      blockTimestamp: timestamp
    });
  }

  return { transfers, newestTimestamp };
}

async function healthCheck() {
  try {
    const block = await getNowBlock();
    if (!block) throw new Error("TronGrid returned no block height");
    return { ok: true, detail: `block ${block}` };
  } catch (err) {
    log.warn(`Tron health check failed: ${err.message}`);
    return { ok: false, detail: err.message };
  }
}

module.exports = { getIncomingTransfers, getNowBlock, getTransactionBlock, healthCheck };
