const { settings } = require("../../db");
const { createLogger } = require("../../lib/logger");

const log = createLogger("chain:solana");

const RPC_HOST = "https://solana-mainnet.g.alchemy.com/v2/";

// Signatures are walked newest-first, so a single pass is capped to keep the
// polling loop responsive; anything older is picked up on the next tick.
const MAX_SIGNATURES = 100;

function rpcUrl() {
  const apiKey = settings.get("alchemy_api_key", "").trim();
  if (!apiKey) throw new Error("Alchemy API key is not configured");
  return RPC_HOST + apiKey;
}

let requestId = 0;

async function rpc(method, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Solana RPC ${method} responded ${response.status}`);
    }
    const body = await response.json();
    if (body.error) throw new Error(`Solana RPC ${method}: ${body.error.message}`);
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Every account key touched by the transaction, in balance-array order. */
function collectAccountKeys(tx) {
  const keys = (tx.transaction.message.accountKeys || []).map((entry) =>
    typeof entry === "string" ? entry : entry.pubkey
  );
  const loaded = tx.meta && tx.meta.loadedAddresses;
  if (loaded) {
    for (const key of [...(loaded.writable || []), ...(loaded.readonly || [])]) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/**
 * Incoming native SOL transfers to `address`, newer than `sinceSignature`.
 * Returns { txHash, logIndex, from, amountUnits (lamports), blockNumber }.
 */
async function getIncomingTransfers(address, sinceSignature) {
  const options = { limit: MAX_SIGNATURES, commitment: "finalized" };
  if (sinceSignature) options.until = sinceSignature;

  const signatures = await rpc("getSignaturesForAddress", [address, options]);
  if (!signatures || signatures.length === 0) {
    return { transfers: [], newestSignature: sinceSignature || "" };
  }

  const newestSignature = signatures[0].signature;
  const transfers = [];

  // Oldest first, so a failure part way through still leaves the cursor behind
  // the unprocessed entries.
  for (const entry of signatures.slice().reverse()) {
    if (entry.err) continue;

    let tx;
    try {
      tx = await rpc("getTransaction", [
        entry.signature,
        {
          encoding: "jsonParsed",
          commitment: "finalized",
          maxSupportedTransactionVersion: 0
        }
      ]);
    } catch (err) {
      log.warn(`Could not load ${entry.signature}: ${err.message}`);
      continue;
    }
    if (!tx || !tx.meta || tx.meta.err) continue;

    const keys = collectAccountKeys(tx);
    const index = keys.indexOf(address);
    if (index === -1) continue;

    const pre = BigInt(tx.meta.preBalances[index] ?? 0);
    const post = BigInt(tx.meta.postBalances[index] ?? 0);
    const delta = post - pre;
    if (delta <= 0n) continue;

    transfers.push({
      txHash: entry.signature,
      logIndex: "sol",
      from: keys[0] || "",
      amountUnits: delta,
      blockNumber: tx.slot || 0
    });
  }

  return { transfers, newestSignature };
}

async function healthCheck() {
  try {
    const slot = await rpc("getSlot", [{ commitment: "finalized" }]);
    return { ok: true, detail: `slot ${slot}` };
  } catch (err) {
    log.warn(`Solana health check failed: ${err.message}`);
    return { ok: false, detail: err.message };
  }
}

module.exports = { getIncomingTransfers, healthCheck };
