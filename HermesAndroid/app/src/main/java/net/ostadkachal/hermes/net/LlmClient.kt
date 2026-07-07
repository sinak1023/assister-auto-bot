package net.ostadkachal.hermes.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import net.ostadkachal.hermes.data.Skills
import net.ostadkachal.hermes.model.ChatMessage
import net.ostadkachal.hermes.model.ProviderType
import net.ostadkachal.hermes.model.Role
import net.ostadkachal.hermes.model.Settings
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.coroutines.coroutineContext

/**
 * Streaming chat client. Supports the Anthropic Messages API and any
 * OpenAI-compatible /chat/completions endpoint (OpenAI, Nous Portal, custom).
 */
class LlmClient {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val json = "application/json".toMediaType()

    /**
     * Streams a completion, invoking [onDelta] for each text chunk.
     * Returns the full assembled text. Throws on transport/API errors.
     * Honours coroutine cancellation.
     */
    suspend fun complete(
        settings: Settings,
        history: List<ChatMessage>,
        onDelta: (String) -> Unit
    ): String = withContext(Dispatchers.IO) {
        if (!settings.isConfigured) {
            return@withContext demoReply(history, onDelta)
        }
        val system = settings.systemPrompt + Skills.promptFragment(settings.enabledSkills)
        when (settings.provider) {
            ProviderType.ANTHROPIC -> streamAnthropic(settings, system, history, onDelta)
            else -> streamOpenAi(settings, system, history, onDelta)
        }
    }

    // ---- Anthropic ----

    private suspend fun streamAnthropic(
        s: Settings, system: String, history: List<ChatMessage>, onDelta: (String) -> Unit
    ): String {
        val body = JSONObject().apply {
            put("model", s.model)
            put("max_tokens", 2048)
            put("stream", true)
            put("temperature", s.temperature.toDouble())
            put("system", system)
            put("messages", chatArray(history, includeSystem = false))
        }
        val url = s.baseUrl.trimEnd('/') + "/v1/messages"
        val req = Request.Builder()
            .url(url)
            .header("x-api-key", s.apiKey)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .post(body.toString().toRequestBody(json))
            .build()
        return runSse(req) { data ->
            val evt = JSONObject(data)
            when (evt.optString("type")) {
                "content_block_delta" -> {
                    val delta = evt.optJSONObject("delta")
                    val t = delta?.optString("text").orEmpty()
                    if (t.isNotEmpty()) { onDelta(t); t } else ""
                }
                "error" -> throw RuntimeException(
                    evt.optJSONObject("error")?.optString("message") ?: "API error"
                )
                else -> ""
            }
        }
    }

    // ---- OpenAI-compatible ----

    private suspend fun streamOpenAi(
        s: Settings, system: String, history: List<ChatMessage>, onDelta: (String) -> Unit
    ): String {
        val messages = JSONArray().apply {
            put(JSONObject().put("role", "system").put("content", system))
            for (m in history) {
                if (m.role == Role.SYSTEM) continue
                put(JSONObject()
                    .put("role", if (m.role == Role.USER) "user" else "assistant")
                    .put("content", m.text))
            }
        }
        val body = JSONObject().apply {
            put("model", s.model)
            put("stream", true)
            put("temperature", s.temperature.toDouble())
            put("messages", messages)
        }
        val url = s.baseUrl.trimEnd('/') + "/chat/completions"
        val req = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer ${s.apiKey}")
            .header("content-type", "application/json")
            .post(body.toString().toRequestBody(json))
            .build()
        return runSse(req) { data ->
            if (data.trim() == "[DONE]") return@runSse ""
            val evt = JSONObject(data)
            val choices = evt.optJSONArray("choices") ?: return@runSse ""
            if (choices.length() == 0) return@runSse ""
            val delta = choices.getJSONObject(0).optJSONObject("delta")
            val t = delta?.optString("content").orEmpty()
            if (t.isNotEmpty()) { onDelta(t); t } else ""
        }
    }

    private fun chatArray(history: List<ChatMessage>, includeSystem: Boolean): JSONArray {
        val arr = JSONArray()
        for (m in history) {
            if (!includeSystem && m.role == Role.SYSTEM) continue
            arr.put(JSONObject()
                .put("role", if (m.role == Role.USER) "user" else "assistant")
                .put("content", m.text))
        }
        return arr
    }

    /** Runs an SSE request; [handle] parses each `data:` payload and returns any appended text. */
    private suspend fun runSse(req: Request, handle: (String) -> String): String {
        val sb = StringBuilder()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) {
                val err = resp.body?.string().orEmpty().take(500)
                throw RuntimeException("HTTP ${resp.code}: ${err.ifBlank { resp.message }}")
            }
            val source = resp.body?.source() ?: throw RuntimeException("Empty response")
            while (true) {
                coroutineContext.ensureActive()
                val line = source.readUtf8Line() ?: break
                if (line.startsWith("data:")) {
                    val payload = line.removePrefix("data:").trim()
                    if (payload.isNotEmpty()) sb.append(handle(payload))
                }
            }
        }
        return sb.toString()
    }

    // ---- Demo mode (no API key) ----

    private suspend fun demoReply(history: List<ChatMessage>, onDelta: (String) -> Unit): String {
        val last = history.lastOrNull { it.role == Role.USER }?.text?.trim().orEmpty()
        val reply = buildString {
            append("👋 Hermes (demo mode)\n\n")
            if (last.isNotEmpty()) append("You said: \"$last\".\n\n")
            append("I'm running without an API key, so this is a local demo response. ")
            append("Open Settings ⚙️ and add your provider + API key ")
            append("(Anthropic, OpenAI, Nous Portal, or a custom OpenAI-compatible endpoint) ")
            append("to chat with a real model. All history stays on your device.")
        }
        // Simulate streaming for a natural feel.
        for (word in reply.split(" ")) {
            coroutineContext.ensureActive()
            onDelta("$word ")
            kotlinx.coroutines.delay(18)
        }
        return reply
    }
}
