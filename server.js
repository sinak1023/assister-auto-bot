const path = require("path");
const express = require("express");
const config = require("./src/config");
const openrouter = require("./src/openrouter");
const sessions = require("./src/sessions");
const skills = require("./src/skills");
const { runTurn } = require("./src/agent");

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(config.ROOT, "public")));

// ─── Meta / config ──────────────────────────────────────────────────────────

app.get("/api/config", (req, res) => {
  res.json({
    defaultModel: config.DEFAULT_MODEL,
    curatedModels: config.CURATED_MODELS,
    bashEnabled: config.ENABLE_BASH,
    hasKey: Boolean(config.OPENROUTER_API_KEY),
    workspace: config.WORKSPACE_DIR,
  });
});

app.get("/api/models", async (req, res) => {
  try {
    const models = await openrouter.listModels();
    res.json({ models });
  } catch (e) {
    // Fall back to the curated list if OpenRouter is unreachable.
    res.json({ models: config.CURATED_MODELS, error: e.message });
  }
});

// ─── Sessions (chat archive) ─────────────────────────────────────────────────

app.get("/api/sessions", async (req, res) => {
  res.json({ sessions: await sessions.list() });
});

app.post("/api/sessions", async (req, res) => {
  const s = await sessions.createSession({
    title: req.body?.title,
    model: req.body?.model,
  });
  res.json(s);
});

app.get("/api/sessions/:id", async (req, res) => {
  const s = await sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "not found" });
  res.json(s);
});

app.patch("/api/sessions/:id", async (req, res) => {
  const s = await sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: "not found" });
  if (typeof req.body?.title === "string") s.title = req.body.title;
  if (typeof req.body?.model === "string") s.model = req.body.model;
  await sessions.save(s);
  res.json(s);
});

app.delete("/api/sessions/:id", async (req, res) => {
  await sessions.remove(req.params.id);
  res.json({ ok: true });
});

// ─── Skills ───────────────────────────────────────────────────────────────

app.get("/api/skills", async (req, res) => {
  res.json({ skills: await skills.listSkills() });
});

app.get("/api/skills/:id", async (req, res) => {
  try {
    res.json(await skills.getSkill(req.params.id));
  } catch {
    res.status(404).json({ error: "not found" });
  }
});

app.post("/api/skills", async (req, res) => {
  const out = await skills.saveSkill(req.body || {});
  res.json(out);
});

app.delete("/api/skills/:id", async (req, res) => {
  await skills.deleteSkill(req.params.id);
  res.json({ ok: true });
});

// ─── Chat (SSE streaming agentic turn) ───────────────────────────────────────

app.post("/api/chat/:id", async (req, res) => {
  const session = await sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "session not found" });

  const userText = (req.body?.message || "").toString();
  if (!userText.trim()) return res.status(400).json({ error: "empty message" });

  if (req.body?.model) session.model = req.body.model;

  // Auto-title from the first user message.
  if (
    session.messages.filter((m) => m.role === "user").length === 0 &&
    (session.title === "New chat" || !session.title)
  ) {
    session.title = userText.slice(0, 60);
  }

  session.messages.push({ role: "user", content: userText });
  await sessions.save(session);

  // Set up SSE.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  const emit = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    emit({ type: "start", model: session.model });
    await runTurn({ session, emit, signal: controller.signal });
    await sessions.save(session);
    emit({ type: "end" });
  } catch (e) {
    if (e.name === "AbortError") {
      // client disconnected; save whatever we have
      await sessions.save(session).catch(() => {});
    } else {
      emit({ type: "error", message: e.message });
      await sessions.save(session).catch(() => {});
    }
  } finally {
    res.end();
  }
});

app.listen(config.PORT, () => {
  console.log(`\n  🕸️  CodeWeaver running → http://localhost:${config.PORT}`);
  if (!config.OPENROUTER_API_KEY) {
    console.log(
      "  ⚠️  No OPENROUTER_API_KEY set. Copy .env.example to .env and add your key.\n"
    );
  } else {
    console.log(`  Model: ${config.DEFAULT_MODEL}  |  Workspace: ${config.WORKSPACE_DIR}\n`);
  }
});
