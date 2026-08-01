// All USD values are stored as integer "micros" (1 USD = 1_000_000 micros) so
// that balances and prices never suffer from floating point drift.
// Crypto amounts are kept as decimal strings and compared with BigInt maths at
// the smallest unit of each asset.

const USD_SCALE = 1000000n;

/** Parse a user supplied USD string ("12.5", "12", "1,299.99") into micros. */
function usdToMicros(input) {
  const cleaned = String(input).replace(/[,\s_]/g, "").trim();
  if (!/^-?\d*(\.\d+)?$/.test(cleaned) || cleaned === "" || cleaned === ".") {
    throw new Error(`Invalid USD amount: ${input}`);
  }
  return parseUnits(cleaned, 6);
}

/** Render micros as a plain decimal string, e.g. 12500000n -> "12.50". */
function microsToUsd(micros, decimals = 2) {
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const whole = abs / USD_SCALE;
  const frac = abs % USD_SCALE;
  let fracStr = frac.toString().padStart(6, "0").slice(0, decimals);
  if (decimals === 0) fracStr = "";
  const body = decimals === 0 ? `${whole}` : `${whole}.${fracStr}`;
  return negative ? `-${body}` : body;
}

/** Render micros for display, e.g. "$12.50". */
function formatUsd(micros) {
  const value = typeof micros === "bigint" ? micros : BigInt(micros);
  const withThousands = microsToUsd(value, 2).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ","
  );
  return `$${withThousands}`;
}

/**
 * Convert a decimal string into the asset's smallest unit.
 * parseUnits("1.5", 6) -> 1500000n
 */
function parseUnits(value, decimals) {
  const str = String(value).trim();
  const negative = str.startsWith("-");
  const unsigned = negative ? str.slice(1) : str;
  const [wholePart = "0", fracPart = ""] = unsigned.split(".");
  if (fracPart.length > decimals) {
    // Extra precision is dropped rather than rejected: exchanges sometimes
    // report more decimals than the token actually has.
    const truncated = fracPart.slice(0, decimals);
    const result = BigInt(wholePart + truncated.padEnd(decimals, "0"));
    return negative ? -result : result;
  }
  const result = BigInt(wholePart + fracPart.padEnd(decimals, "0"));
  return negative ? -result : result;
}

/**
 * Convert a smallest-unit BigInt back into a decimal string with trailing
 * zeros removed. formatUnits(1500000n, 6) -> "1.5"
 */
function formatUnits(value, decimals, { trim = true } = {}) {
  const big = typeof value === "bigint" ? value : BigInt(value);
  const negative = big < 0n;
  const abs = negative ? -big : big;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  let frac = (abs % scale).toString().padStart(decimals, "0");
  if (trim) frac = frac.replace(/0+$/, "");
  const body = frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
  return negative ? `-${body}` : body;
}

/** Round a smallest-unit amount up so it is a multiple of 10^(decimals-precision). */
function roundUpToPrecision(amount, decimals, precision) {
  const step = 10n ** BigInt(decimals - precision);
  if (step <= 1n) return amount;
  const remainder = amount % step;
  return remainder === 0n ? amount : amount + (step - remainder);
}

module.exports = {
  USD_SCALE,
  usdToMicros,
  microsToUsd,
  formatUsd,
  parseUnits,
  formatUnits,
  roundUpToPrecision
};
