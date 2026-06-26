const config = require("./config");

const BASE_URL = "https://openrouter.ai/api/v1";

function headers() {
  if (!config.OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key."
    );
  }
  return {
    Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": config.OR_SITE_URL,
    "X-Title": config.OR_SITE_NAME,
  };
}

/**
 * Fetch the full list of models available on OpenRouter.
 * Returns a normalized array; the UI merges this with the curated presets.
 */
async function listModels() {
  const res = await fetch(`${BASE_URL}/models`, { headers: headers() });
  if (!res.ok) {
    throw new Error(`OpenRouter /models failed: ${res.status}`);
  }
  const data = await res.json();
  return (data.data || []).map((m) => {
    const prompt = parseFloat(m.pricing?.prompt || "0");
    const completion = parseFloat(m.pricing?.completion || "0");
    const isFree = prompt === 0 && completion === 0;
    return {
      id: m.id,
      label: m.name || m.id,
      tier: isFree ? "free" : "paid",
      context: m.context_length || null,
      tools: (m.supported_parameters || []).includes("tools"),
      pricing: { prompt, completion },
    };
  });
}

/**
 * Stream a chat completion from OpenRouter.
 *
 * Calls onEvent with normalized events:
 *   { type: "text",  delta }            — assistant text token(s)
 *   { type: "reasoning", delta }        — reasoning/thinking token(s)
 *   { type: "tool_calls", toolCalls }   — fully-assembled tool calls (once)
 *   { type: "done", finishReason }      — stream finished
 *
 * Returns { content, reasoning, toolCalls }.
 */
async function streamChat({ model, messages, tools, signal, onEvent }) {
  const body = {
    model,
    messages,
    stream: true,
    temperature: 0.3,
  };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter chat failed: ${res.status} ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let content = "";
  let reasoning = "";
  let finishReason = null;
  // tool calls arrive as indexed deltas that we accumulate by index
  const toolAcc = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep last partial line

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith(":")) continue; // comments / keep-alive
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;

      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }

      const choice = json.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta || {};

      if (delta.content) {
        content += delta.content;
        onEvent?.({ type: "text", delta: delta.content });
      }
      // Some models stream chain-of-thought in `reasoning`
      if (delta.reasoning) {
        reasoning += delta.reasoning;
        onEvent?.({ type: "reasoning", delta: delta.reasoning });
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolAcc[idx]) {
            toolAcc[idx] = {
              id: tc.id || `call_${idx}`,
              type: "function",
              function: { name: "", arguments: "" },
            };
          }
          if (tc.id) toolAcc[idx].id = tc.id;
          if (tc.function?.name) toolAcc[idx].function.name += tc.function.name;
          if (tc.function?.arguments)
            toolAcc[idx].function.arguments += tc.function.arguments;
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
  }

  const toolCalls = Object.keys(toolAcc)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => toolAcc[k]);

  if (toolCalls.length) {
    onEvent?.({ type: "tool_calls", toolCalls });
  }
  onEvent?.({ type: "done", finishReason });

  return { content, reasoning, toolCalls };
}

module.exports = { listModels, streamChat };
