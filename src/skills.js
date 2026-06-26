const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const config = require("./config");

const SKILLS_DIR = config.SKILLS_DIR;
fs.mkdirSync(SKILLS_DIR, { recursive: true });

/**
 * A "skill" is a folder under /skills containing a SKILL.md file.
 * The markdown may start with a YAML-ish front-matter block:
 *
 *   ---
 *   name: Web Research
 *   description: How to research a topic on the web and cite sources
 *   ---
 *   <body: instructions the model should follow>
 *
 * This mirrors Claude Code's skills: each is a named, reusable chunk of
 * expertise the agent can pull in on demand.
 */
function parseFrontMatter(raw) {
  const meta = {};
  let body = raw;
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (m) {
    for (const line of m[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx > -1) {
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k) meta[k] = v;
      }
    }
    body = m[2];
  }
  return { meta, body: body.trim() };
}

async function listSkills() {
  let dirs;
  try {
    dirs = await fsp.readdir(SKILLS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const file = path.join(SKILLS_DIR, d.name, "SKILL.md");
    let raw;
    try {
      raw = await fsp.readFile(file, "utf8");
    } catch {
      continue;
    }
    const { meta, body } = parseFrontMatter(raw);
    skills.push({
      id: d.name,
      name: meta.name || d.name,
      description: meta.description || body.slice(0, 140),
      body,
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

async function getSkill(id) {
  const safeId = path.basename(id);
  const file = path.join(SKILLS_DIR, safeId, "SKILL.md");
  const raw = await fsp.readFile(file, "utf8");
  const { meta, body } = parseFrontMatter(raw);
  return { id: safeId, name: meta.name || safeId, description: meta.description || "", body };
}

async function saveSkill({ id, name, description, body }) {
  const safeId = path.basename(id || name || "skill")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "skill";
  const dir = path.join(SKILLS_DIR, safeId);
  await fsp.mkdir(dir, { recursive: true });
  const front = `---\nname: ${name || safeId}\ndescription: ${description || ""}\n---\n\n`;
  await fsp.writeFile(path.join(dir, "SKILL.md"), front + (body || ""), "utf8");
  return { id: safeId };
}

async function deleteSkill(id) {
  const safeId = path.basename(id);
  const dir = path.join(SKILLS_DIR, safeId);
  await fsp.rm(dir, { recursive: true, force: true });
}

module.exports = { listSkills, getSkill, saveSkill, deleteSkill };
