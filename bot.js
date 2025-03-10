const fs = require("fs");
const axios = require("axios");
const cron = require("node-cron");

// API URLs
const LOGIN_URL = "https://api.assisterr.ai/incentive/auth/login/";  // Login with Solana Wallet (Yalam)
const CLAIM_URL = "https://api.assisterr.ai/incentive/users/me/daily_points/";

// Read wallet addresses from a file
const WALLETS_FILE = "wallets.txt";
const TOKENS_FILE = "tokens.txt";

// Function to display banner
function showBanner() {
  console.log(`
  ┏━━━━━━━━━━━━━━━━━━━━━━━┓
  ┃  🚀 Ostad Kachal 🚀  ┃
  ┗━━━━━━━━━━━━━━━━━━━━━━━┛
  `);
}

// Function to get wallet addresses from file
function getWallets() {
  try {
    return fs.readFileSync(WALLETS_FILE, "utf8").split("\n").map(w => w.trim()).filter(w => w.length > 0);
  } catch (err) {
    console.error("❌ Error reading wallets file:", err);
    return [];
  }
}

// Function to log in with Solana wallet and get access token
async function login(wallet) {
  try {
    console.log(`🔑 Logging in with Solana wallet: ${wallet}`);
    
    const response = await axios.post(LOGIN_URL, { wallet_id: wallet }, {
      headers: {
        "Content-Type": "application/json"
      }
    });

    const accessToken = response.data.access_token;
    console.log(`✅ Logged in successfully! Wallet: ${wallet.slice(0, 6)}... | Token: ${accessToken.slice(0, 10)}...`);
    return accessToken;
  } catch (err) {
    console.error(`❌ Login failed for wallet ${wallet}:`, err.response?.data || err.message);
    return null;
  }
}

// Function to update tokens file
function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKENS_FILE, tokens.join("\n"), "utf8");
    console.log("✅ Tokens updated successfully!");
  } catch (err) {
    console.error("❌ Error saving tokens:", err);
  }
}

// Function to claim daily points using a token
async function claimPoints(token, wallet) {
  try {
    const response = await axios.post(CLAIM_URL, {}, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      }
    });

    console.log(`✅ Success! Wallet: ${wallet.slice(0, 6)}... | Points claimed: ${response.data.points}`);
    return true;
  } catch (err) {
    if (err.response && err.response.status === 400) {
      console.warn(`⚠️ Already claimed today. Skipping wallet: ${wallet.slice(0, 6)}...`);
      return true;
    } else if (err.response && err.response.status === 401) {
      console.log(`🔄 Access token expired for wallet ${wallet.slice(0, 6)}... | Logging in again...`);
      return false; // Token expired, needs refresh
    } else {
      console.error(`❌ Failed to claim points for wallet ${wallet.slice(0, 6)}... | Error:`, err.response ? `${err.response.status} - ${JSON.stringify(err.response.data)}` : err.message);
      return false;
    }
  }
}

// Main function to process all wallets
async function runBot() {
  showBanner();
  console.log("🚀 Starting the claiming process...");

  let wallets = getWallets();
  if (wallets.length === 0) {
    console.error("❌ No wallets found in the file!");
    return;
  }

  let tokens = []; // Store new tokens

  for (const wallet of wallets) {
    let token = await login(wallet); // Get a fresh token

    if (!token) {
      console.error(`❌ Skipping wallet ${wallet.slice(0, 6)}... due to login failure`);
      continue;
    }

    let success = await claimPoints(token, wallet);
    
    if (!success) {
      console.log(`🔄 Retrying login for wallet ${wallet.slice(0, 6)}...`);
      token = await login(wallet); // Get new token
      if (token) {
        await claimPoints(token, wallet); // Try again
      }
    }

    tokens.push(token);
  }

  saveTokens(tokens);
  console.log("✅ All wallets processed!");
}

// Schedule the bot to run every 24 hours
cron.schedule("0 0 * * *", () => {
  console.log("\n⏳ Running the bot as scheduled...");
  runBot();
});

// Run the bot immediately on startup
runBot();
