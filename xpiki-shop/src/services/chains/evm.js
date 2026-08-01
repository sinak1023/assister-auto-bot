const { settings } = require("../../db");
const { createLogger } = require("../../lib/logger");

const log = createLogger("chain:evm");

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const RPC_HOSTS = {
  ethereum: "https://eth-mainnet.g.alchemy.com/v2/",
  bsc: "https://bnb-mainnet.g.alchemy.com/v2/"
};

// eth_getLogs is capped by the provider, so long gaps are walked in chunks.
const MAX_BLOCK_SPAN = 500;

function rpcUrl(network) {
  const host = RPC_HOSTS[network];
  if (!host) throw new Error(`Unsupported EVM network: ${network}`);
  const apiKey = settings.get("alchemy_api_key", "").trim();
  if (!apiKey) throw new Error("Alchemy API key is not configured");
  return host + apiKey;
}

let requestId = 0;

async function rpc(network, method, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(rpcUrl(network), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`${network} RPC ${method} responded ${response.status}`);
    }
    const body = await response.json();
    if (body.error) {
      throw new Error(`${network} RPC ${method}: ${body.error.message}`);
    }
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

async function getBlockNumber(network) {
  const hex = await rpc(network, "eth_blockNumber", []);
  return Number(BigInt(hex));
}

function toHexBlock(n) {
  return "0x" + BigInt(n).toString(16);
}

/** Left-pad a 20 byte address into the 32 byte form used by log topics. */
function addressTopic(address) {
  return "0x" + address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function topicToAddress(topic) {
  return "0x" + topic.slice(-40).toLowerCase();
}

/**
 * Incoming ERC20/BEP20 transfers to `address` between two blocks.
 * Returns { txHash, logIndex, from, amountUnits (BigInt), blockNumber }.
 */
async function getIncomingTokenTransfers(network, contract, address, fromBlock, toBlock) {
  const transfers = [];
  let cursor = fromBlock;

  while (cursor <= toBlock) {
    const chunkEnd = Math.min(cursor + MAX_BLOCK_SPAN - 1, toBlock);
    const logs = await rpc(network, "eth_getLogs", [
      {
        address: contract,
        fromBlock: toHexBlock(cursor),
        toBlock: toHexBlock(chunkEnd),
        topics: [TRANSFER_TOPIC, null, addressTopic(address)]
      }
    ]);

    for (const entry of logs || []) {
      // A malformed or non standard Transfer log would break BigInt parsing.
      if (!entry.data || entry.topics.length < 3) continue;
      transfers.push({
        txHash: entry.transactionHash,
        logIndex: String(Number(BigInt(entry.logIndex || "0x0"))),
        from: topicToAddress(entry.topics[1]),
        amountUnits: BigInt(entry.data),
        blockNumber: Number(BigInt(entry.blockNumber))
      });
    }
    cursor = chunkEnd + 1;
  }

  return transfers;
}

/**
 * Incoming native coin transfers (ETH / BNB) to `address`.
 * Uses Alchemy's Transfers API, which is the only practical way to find plain
 * value transfers without replaying every block.
 */
async function getIncomingNativeTransfers(network, address, fromBlock, toBlock) {
  const transfers = [];
  let pageKey;

  do {
    const params = {
      fromBlock: toHexBlock(fromBlock),
      toBlock: toHexBlock(toBlock),
      toAddress: address,
      category: ["external", "internal"],
      withMetadata: false,
      excludeZeroValue: true,
      maxCount: "0x3e8"
    };
    if (pageKey) params.pageKey = pageKey;

    const result = await rpc(network, "alchemy_getAssetTransfers", [params]);
    for (const entry of result.transfers || []) {
      if (!entry.rawContract || !entry.rawContract.value) continue;
      transfers.push({
        txHash: entry.hash,
        // Native transfers have no log index; `uniqueId` separates several
        // internal transfers that share one transaction hash.
        logIndex: entry.uniqueId || "native",
        from: (entry.from || "").toLowerCase(),
        amountUnits: BigInt(entry.rawContract.value),
        blockNumber: Number(BigInt(entry.blockNum))
      });
    }
    pageKey = result.pageKey;
  } while (pageKey);

  return transfers;
}

/** Fetch incoming transfers for one configured asset. */
async function getIncomingTransfers(asset, address, fromBlock, toBlock) {
  if (fromBlock > toBlock) return [];
  if (asset.kind === "native") {
    return getIncomingNativeTransfers(asset.network, address, fromBlock, toBlock);
  }
  return getIncomingTokenTransfers(
    asset.network,
    asset.contract,
    address,
    fromBlock,
    toBlock
  );
}

async function healthCheck(network) {
  try {
    const block = await getBlockNumber(network);
    return { ok: true, detail: `block ${block}` };
  } catch (err) {
    log.warn(`${network} health check failed: ${err.message}`);
    return { ok: false, detail: err.message };
  }
}

module.exports = { getBlockNumber, getIncomingTransfers, healthCheck };
