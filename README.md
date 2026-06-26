# 🕸️ CodeWeaver

An **agentic coding assistant with a web UI — like Claude Code, in your browser**, powered by [OpenRouter](https://openrouter.ai). It thinks step-by-step, uses real tools to read/write/edit files, search the codebase and run commands in a sandboxed workspace, lets you add reusable **skills**, keeps a full **chat archive**, and lets you **switch models live** (free or best).

> Built with Node.js + Express. No build step, no heavy frontend framework — just open the page.

---

## ✨ Features

- 🤖 **Agentic loop like Claude Code** — plans, calls tools, reads results, iterates until the task is done.
- 🛠️ **Real tools**: `read_file`, `write_file`, `edit_file`, `list_dir`, `search` (regex), `glob_files`, and `bash` (optional).
- 🔒 **Sandboxed workspace** — every file/command operation is locked to `./workspace`; paths that escape it are rejected.
- 🔀 **Model switching** — pick any OpenRouter model from the dropdown. Free models grouped separately from the best paid ones. Switch per-chat, anytime.
- 🧩 **Skills** — add reusable expertise (Markdown files). The agent pulls them in when relevant, just like Claude Code skills. Manage them from the UI.
- 🗂️ **Chat archive** — every conversation is saved to disk with its full transcript (including tool calls) and reloadable from the sidebar.
- ⚡ **Live streaming** — tokens, reasoning/thinking, and tool execution stream to the UI in real time over SSE.
- 🎨 Clean dark web UI with Markdown + code rendering.

---

## 🚀 Quick start

```bash
# 1. install deps
npm install

# 2. configure
cp .env.example .env
#    then edit .env and set OPENROUTER_API_KEY (get one at https://openrouter.ai/keys)

# 3. run
npm start
```

Open **http://localhost:8787** in your browser. Done.

---

## ⚙️ Configuration (`.env`)

| Variable             | Default                                | Description                                                        |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `OPENROUTER_API_KEY` | —                                      | **Required.** Your OpenRouter key.                                 |
| `PORT`               | `8787`                                 | Web server port.                                                   |
| `DEFAULT_MODEL`      | `deepseek/deepseek-chat-v3-0324:free`  | Model used for new chats. Switchable from the UI.                  |
| `WORKSPACE_DIR`      | `./workspace`                          | The sandboxed folder the agent operates in.                        |
| `ENABLE_BASH`        | `false`                                | Set `true` to let the agent run shell commands. **See safety.**    |
| `OR_SITE_URL` / `OR_SITE_NAME` | localhost / CodeWeaver       | Attribution headers sent to OpenRouter.                            |

### Choosing models

- **Free tier** (zero cost, rate-limited): DeepSeek V3, Llama 3.3 70B, Qwen3, Gemini 2.0 Flash, …
- **Best tier** (paid, strongest tool-use): Claude 3.7 / 3.5 Sonnet, GPT-4o, Gemini 2.5 Pro, …

The dropdown shows the curated presets plus the **full live list** fetched from OpenRouter (filtered to models that support tool-calling — required for the agent loop). Reasoning-only models without tool support won't be able to use the file tools.

---

## 🧩 Skills

A skill is a folder under `skills/<id>/SKILL.md`:

```markdown
---
name: Code Review
description: Review code for bugs, style, and improvements
---

# Instructions the agent follows when this skill applies
1. Read the relevant files fully before commenting…
```

Skills' names + descriptions are always shown to the model so it knows what it has; it pulls in the detail when a task matches. Create / edit / delete them from the **Skills** panel in the sidebar (the `+` button), or just drop folders into `skills/`.

A starter **Code Review** skill ships in `skills/code-review/`.

---

## 🗂️ Chat archive

Every conversation is stored as JSON in `data/sessions/`, including the full
transcript with tool calls and results. Click any chat in the sidebar to reopen
it; delete with the 🗑 icon. Titles are auto-generated from your first message.

---

## 🔒 Security notes

- All file tools are **sandboxed to `WORKSPACE_DIR`**. Attempts to read/write
  outside it are rejected.
- The **`bash` tool is disabled by default**. Only enable it (`ENABLE_BASH=true`)
  if you trust the environment — it runs arbitrary shell commands inside the
  workspace directory. Run CodeWeaver on a machine/container you control.
- Your OpenRouter key lives only in `.env` (git-ignored) and is used server-side;
  it is never sent to the browser.

---

## 🏗️ Architecture

```
server.js              Express app: REST + SSE streaming endpoints
src/
  config.js            env + curated model list
  openrouter.js        OpenRouter client: model list + streaming chat w/ tools
  tools.js             tool schemas + sandboxed implementations
  agent.js             the agentic loop (stream → run tools → repeat)
  prompt.js            system prompt (the "think like Claude Code" instructions)
  skills.js            load/save skills from /skills
  sessions.js          chat archive persistence (data/sessions)
public/
  index.html / style.css / app.js   the web UI (SSE client, markdown, tools)
skills/                your skills
workspace/             the agent's sandbox
data/sessions/         saved chats
```

### How the agent loop works

1. You send a message → it's appended to the session and saved.
2. The server builds the system prompt (with your skills) + transcript and
   streams a completion from OpenRouter with the tool schemas attached.
3. If the model requests tools, the server executes them in the sandbox, streams
   the results to the UI, appends them to the transcript, and loops back to step 2.
4. When the model replies with no tool calls, that's the final answer. Everything
   is saved to the archive.

---

## License

MIT
