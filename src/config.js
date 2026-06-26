const path = require("path");
require("dotenv").config();

const ROOT = path.resolve(__dirname, "..");

const WORKSPACE_DIR = path.resolve(
  ROOT,
  process.env.WORKSPACE_DIR || "./workspace"
);

// A curated short-list of good models, surfaced as quick presets in the UI.
// The full live list is fetched from OpenRouter at runtime (/api/models).
// `:free` models cost nothing but are rate-limited and sometimes weaker at
// tool-calling. The paid ones are the "best" tier.
const CURATED_MODELS = [
  // ── Free tier ────────────────────────────────────────────────
  {
    id: "deepseek/deepseek-chat-v3-0324:free",
    label: "DeepSeek V3 (free)",
    tier: "free",
    tools: true,
  },
  {
    id: "deepseek/deepseek-r1-0528:free",
    label: "DeepSeek R1 — reasoning (free)",
    tier: "free",
    tools: false,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B (free)",
    tier: "free",
    tools: true,
  },
  {
    id: "qwen/qwen3-235b-a22b:free",
    label: "Qwen3 235B (free)",
    tier: "free",
    tools: true,
  },
  {
    id: "google/gemini-2.0-flash-exp:free",
    label: "Gemini 2.0 Flash (free)",
    tier: "free",
    tools: true,
  },
  // ── Best / paid tier ─────────────────────────────────────────
  {
    id: "anthropic/claude-3.7-sonnet",
    label: "Claude 3.7 Sonnet (best)",
    tier: "paid",
    tools: true,
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    tier: "paid",
    tools: true,
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    tier: "paid",
    tools: true,
  },
  {
    id: "google/gemini-2.5-pro-preview",
    label: "Gemini 2.5 Pro",
    tier: "paid",
    tools: true,
  },
];

module.exports = {
  ROOT,
  WORKSPACE_DIR,
  CURATED_MODELS,
  PORT: parseInt(process.env.PORT || "8787", 10),
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  DEFAULT_MODEL:
    process.env.DEFAULT_MODEL || "deepseek/deepseek-chat-v3-0324:free",
  OR_SITE_URL: process.env.OR_SITE_URL || "http://localhost:8787",
  OR_SITE_NAME: process.env.OR_SITE_NAME || "CodeWeaver",
  ENABLE_BASH: String(process.env.ENABLE_BASH || "false") === "true",
  SESSIONS_DIR: path.join(ROOT, "data", "sessions"),
  SKILLS_DIR: path.join(ROOT, "skills"),
};
