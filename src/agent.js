const { streamChat } = require("./openrouter");
const { TOOL_SCHEMAS, runTool } = require("./tools");
const { buildSystemPrompt } = require("./prompt");
const skillsLib = require("./skills");
const config = require("./config");

const MAX_STEPS = 25; // safety cap on the tool-use loop

/**
 * Run one agentic turn: the user just sent a message (already appended to
 * session.messages). We loop — stream a model response, run any tool calls it
 * requests, feed the results back — until the model answers without tools or
 * we hit the step cap.
 *
 * `emit(event)` streams events to the client over SSE.
 * Mutates session.messages with the full transcript and returns it.
 */
async function runTurn({ session, emit, signal }) {
  const skills = await skillsLib.listSkills();
  const system = buildSystemPrompt({
    skills,
    bashEnabled: config.ENABLE_BASH,
  });

  // Reconstruct the message array the model sees: system + transcript.
  const transcript = [{ role: "system", content: system }, ...session.messages];

  // Running totals for this turn; session.usage holds the lifetime total.
  if (!session.usage)
    session.usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost: 0 };
  const turnUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost: 0 };

  for (let step = 0; step < MAX_STEPS; step++) {
    emit({ type: "step", step: step + 1 });

    const { content, reasoning, toolCalls, usage } = await streamChat({
      model: session.model,
      messages: transcript,
      tools: TOOL_SCHEMAS,
      signal,
      onEvent: (ev) => {
        if (ev.type === "text") emit({ type: "text", delta: ev.delta });
        else if (ev.type === "reasoning")
          emit({ type: "reasoning", delta: ev.delta });
      },
    });

    // Accumulate usage from this model call into the turn + session totals.
    if (usage) {
      for (const k of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
        turnUsage[k] += usage[k] || 0;
        session.usage[k] += usage[k] || 0;
      }
      if (typeof usage.cost === "number") {
        turnUsage.cost += usage.cost;
        session.usage.cost += usage.cost;
      }
      emit({ type: "usage", turn: { ...turnUsage }, total: { ...session.usage } });
    }

    // Persist the assistant message (text + any tool calls it made).
    const assistantMsg = {
      role: "assistant",
      content: content || "",
    };
    if (reasoning) assistantMsg.reasoning = reasoning;
    if (toolCalls.length) assistantMsg.tool_calls = toolCalls;

    transcript.push(assistantMsg);
    session.messages.push(assistantMsg);

    if (!toolCalls.length) {
      // No tools requested → this is the final answer for the turn.
      assistantMsg.usage = { ...turnUsage }; // persist for the archive view
      emit({ type: "assistant_done", content });
      return session;
    }

    // Execute each tool call and append a tool result message.
    for (const tc of toolCalls) {
      let args = {};
      try {
        args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch (e) {
        args = {};
      }
      emit({
        type: "tool_call",
        id: tc.id,
        name: tc.function.name,
        args,
      });

      let result;
      let isError = false;
      try {
        result = await runTool(tc.function.name, args);
      } catch (e) {
        result = `Error: ${e.message}`;
        isError = true;
      }

      const resultStr =
        typeof result === "string" ? result : JSON.stringify(result);
      // Cap tool output so we don't blow the context window.
      const capped =
        resultStr.length > 20000
          ? resultStr.slice(0, 20000) + "\n…[truncated]"
          : resultStr;

      emit({
        type: "tool_result",
        id: tc.id,
        name: tc.function.name,
        result: capped,
        isError,
      });

      const toolMsg = {
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function.name,
        content: capped,
      };
      transcript.push(toolMsg);
      session.messages.push(toolMsg);
    }
    // loop continues: model now sees the tool results
  }

  emit({
    type: "error",
    message: `Reached the ${MAX_STEPS}-step limit. Stopping to avoid an infinite loop.`,
  });
  return session;
}

module.exports = { runTurn };
