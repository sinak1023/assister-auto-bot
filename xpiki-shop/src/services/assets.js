// Catalogue of every payment option the shop supports.
//
// `precision` is how many decimals the customer is asked to send. The last
// three digits at that precision carry the per-invoice unique tag used to
// match an incoming transfer to the invoice that expects it, so it must stay
// well below the asset's real `decimals`.

const ASSETS = {
  eth_ethereum: {
    key: "eth_ethereum",
    label: "ETH",
    networkLabel: "Ethereum Mainnet",
    network: "ethereum",
    chain: "evm",
    symbol: "ETH",
    priceSymbol: "ETH",
    kind: "native",
    decimals: 18,
    precision: 8,
    settingsAddressKey: "wallet_address_ethereum",
    confirmationsKey: "confirmations_ethereum",
    defaultConfirmations: 12,
    explorerTx: "https://etherscan.io/tx/"
  },
  usdt_ethereum: {
    key: "usdt_ethereum",
    label: "USDT (ERC20)",
    networkLabel: "Ethereum Mainnet",
    network: "ethereum",
    chain: "evm",
    symbol: "USDT",
    priceSymbol: "USDT",
    kind: "erc20",
    contract: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    decimals: 6,
    precision: 6,
    settingsAddressKey: "wallet_address_ethereum",
    confirmationsKey: "confirmations_ethereum",
    defaultConfirmations: 12,
    explorerTx: "https://etherscan.io/tx/"
  },
  usdt_bsc: {
    key: "usdt_bsc",
    label: "USDT (BEP20)",
    networkLabel: "BNB Smart Chain",
    network: "bsc",
    chain: "evm",
    symbol: "USDT",
    priceSymbol: "USDT",
    kind: "erc20",
    // USDT on BSC is an 18 decimal token, unlike the 6 decimal ERC20/TRC20 ones.
    contract: "0x55d398326f99059ff775485246999027b3197955",
    decimals: 18,
    precision: 6,
    settingsAddressKey: "wallet_address_bsc",
    confirmationsKey: "confirmations_bsc",
    defaultConfirmations: 15,
    explorerTx: "https://bscscan.com/tx/"
  },
  usdt_tron: {
    key: "usdt_tron",
    label: "USDT (TRC20)",
    networkLabel: "Tron",
    network: "tron",
    chain: "tron",
    symbol: "USDT",
    priceSymbol: "USDT",
    kind: "trc20",
    contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    decimals: 6,
    precision: 6,
    settingsAddressKey: "wallet_address_tron",
    confirmationsKey: "confirmations_tron",
    defaultConfirmations: 19,
    explorerTx: "https://tronscan.org/#/transaction/"
  },
  sol_solana: {
    key: "sol_solana",
    label: "SOL",
    networkLabel: "Solana",
    network: "solana",
    chain: "solana",
    symbol: "SOL",
    priceSymbol: "SOL",
    kind: "native",
    decimals: 9,
    precision: 7,
    settingsAddressKey: "wallet_address_solana",
    confirmationsKey: null,
    defaultConfirmations: 0,
    explorerTx: "https://solscan.io/tx/"
  }
};

const ASSET_LIST = Object.values(ASSETS);

function getAsset(key) {
  return ASSETS[key] || null;
}

/** Assets that are switched on in settings and have a receiving address set. */
function enabledAssets(settings) {
  return ASSET_LIST.filter((asset) => {
    if (settings.get(`asset_enabled_${asset.key}`, "1") !== "1") return false;
    return Boolean(settings.get(asset.settingsAddressKey, "").trim());
  });
}

function confirmationsFor(asset, settings) {
  if (!asset.confirmationsKey) return asset.defaultConfirmations;
  const raw = settings.get(asset.confirmationsKey, String(asset.defaultConfirmations));
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : asset.defaultConfirmations;
}

module.exports = { ASSETS, ASSET_LIST, getAsset, enabledAssets, confirmationsFor };
