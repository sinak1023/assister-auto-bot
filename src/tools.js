const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { exec } = require("child_process");
const config = require("./config");

const WS = config.WORKSPACE_DIR;

// Ensure the workspace exists.
fs.mkdirSync(WS, { recursive: true });

/**
 * Resolve a user-supplied path against the workspace and refuse anything
 * that would escape it. This is the security boundary for every file tool.
 */
function safePath(p) {
  const resolved = path.resolve(WS, p || ".");
  const rel = path.relative(WS, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path '${p}' escapes the workspace sandbox.`);
  }
  return resolved;
}

function rel(p) {
  return path.relative(WS, p) || ".";
}

// ─── Tool implementations ──────────────────────────────────────────────────

async function read_file({ path: p, offset, limit }) {
  const abs = safePath(p);
  const raw = await fsp.readFile(abs, "utf8");
  let lines = raw.split("\n");
  const start = offset ? Math.max(0, offset - 1) : 0;
  const end = limit ? start + limit : lines.length;
  lines = lines.slice(start, end);
  const numbered = lines
    .map((l, i) => `${String(start + i + 1).padStart(5)}\t${l}`)
    .join("\n");
  return numbered || "(empty file)";
}

async function write_file({ path: p, content }) {
  const abs = safePath(p);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, content ?? "", "utf8");
  return `Wrote ${Buffer.byteLength(content ?? "")} bytes to ${rel(abs)}`;
}

async function edit_file({ path: p, old_string, new_string, replace_all }) {
  const abs = safePath(p);
  const raw = await fsp.readFile(abs, "utf8");
  if (!raw.includes(old_string)) {
    throw new Error("old_string not found in file. It must match exactly.");
  }
  const occurrences = raw.split(old_string).length - 1;
  if (occurrences > 1 && !replace_all) {
    throw new Error(
      `old_string appears ${occurrences} times. Pass replace_all:true or provide a more specific string.`
    );
  }
  const out = replace_all
    ? raw.split(old_string).join(new_string)
    : raw.replace(old_string, new_string);
  await fsp.writeFile(abs, out, "utf8");
  return `Edited ${rel(abs)} (${occurrences > 1 && replace_all ? occurrences : 1} replacement(s))`;
}

async function list_dir({ path: p }) {
  const abs = safePath(p || ".");
  const entries = await fsp.readdir(abs, { withFileTypes: true });
  if (!entries.length) return "(empty directory)";
  return entries
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .sort()
    .join("\n");
}

async function search({ pattern, path: p, glob }) {
  // Walk the tree and grep file contents for a regex.
  const root = safePath(p || ".");
  let regex;
  try {
    regex = new RegExp(pattern, "i");
  } catch (e) {
    throw new Error(`Invalid regex: ${e.message}`);
  }
  const globRe = glob
    ? new RegExp("^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$")
    : null;

  const results = [];
  const MAX = 200;

  async function walk(dir) {
    if (results.length >= MAX) return;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (results.length >= MAX) return;
      if (e.name === "node_modules" || e.name === ".git") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else {
        if (globRe && !globRe.test(e.name)) continue;
        let text;
        try {
          text = await fsp.readFile(full, "utf8");
        } catch {
          continue; // binary / unreadable
        }
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push(`${rel(full)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
            if (results.length >= MAX) break;
          }
        }
      }
    }
  }

  await walk(root);
  return results.length
    ? results.join("\n")
    : `No matches for /${pattern}/`;
}

async function glob_files({ pattern }) {
  // Simple ** glob over the workspace.
  const re = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "§§")
        .replace(/\*/g, "[^/]*")
        .replace(/§§/g, ".*") +
      "$"
  );
  const matches = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (re.test(rel(full))) matches.push(rel(full));
    }
  }
  await walk(WS);
  return matches.length ? matches.sort().join("\n") : `No files match ${pattern}`;
}

function bash({ command, timeout }) {
  if (!config.ENABLE_BASH) {
    return Promise.reject(
      new Error("bash tool is disabled. Set ENABLE_BASH=true in .env to enable it.")
    );
  }
  return new Promise((resolve) => {
    exec(
      command,
      { cwd: WS, timeout: Math.min(timeout || 120000, 600000), maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        let out = "";
        if (stdout) out += stdout;
        if (stderr) out += (out ? "\n" : "") + stderr;
        if (err && err.killed) out += `\n[command timed out]`;
        if (err && !err.killed && typeof err.code === "number")
          out += `\n[exit code: ${err.code}]`;
        resolve(out.trim() || "(no output)");
      }
    );
  });
}

// ─── Tool schemas (OpenAI function-calling format) ─────────────────────────

const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a text file from the workspace. Returns line-numbered content. Use offset/limit for large files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path relative to the workspace" },
          offset: { type: "integer", description: "1-based line to start at" },
          limit: { type: "integer", description: "Max number of lines to read" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create a new file or completely overwrite an existing one. Creates parent directories as needed.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Replace an exact string in a file. old_string must match exactly (including whitespace). Prefer this over write_file for small changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string", description: "Exact text to find" },
          new_string: { type: "string", description: "Replacement text" },
          replace_all: { type: "boolean", description: "Replace every occurrence" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and folders at a path in the workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Defaults to workspace root" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description:
        "Search file contents for a regular expression across the workspace. Returns path:line: match.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regex to search for" },
          path: { type: "string", description: "Subdirectory to limit the search to" },
          glob: { type: "string", description: "Filename glob filter, e.g. *.js" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "glob_files",
      description: "Find files by path glob pattern, e.g. src/**/*.ts",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string" } },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bash",
      description:
        "Run a shell command inside the workspace (e.g. npm install, node script.js, ls). Only works if enabled by the operator.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          timeout: { type: "integer", description: "Timeout in ms (max 600000)" },
        },
        required: ["command"],
      },
    },
  },
];

const IMPL = {
  read_file,
  write_file,
  edit_file,
  list_dir,
  search,
  glob_files,
  bash,
};

async function runTool(name, args) {
  const fn = IMPL[name];
  if (!fn) throw new Error(`Unknown tool: ${name}`);
  return await fn(args || {});
}

module.exports = { TOOL_SCHEMAS, runTool, safePath, WS };
