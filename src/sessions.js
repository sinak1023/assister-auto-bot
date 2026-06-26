const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const config = require("./config");

const DIR = config.SESSIONS_DIR;
fs.mkdirSync(DIR, { recursive: true });

function file(id) {
  return path.join(DIR, `${path.basename(id)}.json`);
}

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

async function createSession({ title, model } = {}) {
  const id = newId();
  const now = Date.now();
  const session = {
    id,
    title: title || "New chat",
    model: model || config.DEFAULT_MODEL,
    createdAt: now,
    updatedAt: now,
    messages: [], // full transcript incl. tool messages
  };
  await save(session);
  return session;
}

async function save(session) {
  session.updatedAt = Date.now();
  await fsp.writeFile(file(session.id), JSON.stringify(session, null, 2), "utf8");
  return session;
}

async function get(id) {
  try {
    const raw = await fsp.readFile(file(id), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function list() {
  let files;
  try {
    files = await fsp.readdir(DIR);
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const s = JSON.parse(await fsp.readFile(path.join(DIR, f), "utf8"));
      out.push({
        id: s.id,
        title: s.title,
        model: s.model,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: (s.messages || []).filter(
          (m) => m.role === "user" || m.role === "assistant"
        ).length,
      });
    } catch {
      /* skip corrupt */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function remove(id) {
  await fsp.rm(file(id), { force: true });
}

async function rename(id, title) {
  const s = await get(id);
  if (!s) return null;
  s.title = title;
  return save(s);
}

module.exports = { createSession, save, get, list, remove, rename };
