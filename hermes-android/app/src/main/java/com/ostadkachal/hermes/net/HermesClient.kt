package com.ostadkachal.hermes.net

import com.ostadkachal.hermes.data.ChatMessage
import com.ostadkachal.hermes.data.Settings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Talks to any OpenAI-compatible /chat/completions endpoint (Nous Portal,
 * OpenRouter, OpenAI, a local Ollama/vLLM server, or a remote Hermes backend).
 * Supports SSE token streaming. Falls back to an offline demo responder when
 * no backend is configured, so the app is usable out of the box.
 */
class HermesClient(private val settings: Settings) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    data class Result(val ok: Boolean, val error: String? = null, val usage: Usage? = null)
    data class Usage(val promptTokens: Int, val completionTokens: Int) {
        val total get() = promptTokens + completionTokens
    }

    /**
     * Streams a completion, invoking [onDelta] for each token chunk.
     * Returns a [Result] describing success/failure and (when available) usage.
     */
    suspend fun streamChat(
        persona: String,
        history: List<ChatMessage>,
        onDelta: (String) -> Unit
    ): Result = withContext(Dispatchers.IO) {
        if (settings.demoMode || !settings.isConfigured()) {
            return@withContext demoResponder(history, onDelta)
        }

        val url = settings.baseUrl.trimEnd('/') + "/chat/completions"
        val payload = JSONObject().apply {
            put("model", settings.model)
            put("temperature", settings.temperature.toDouble())
            put("stream", settings.streaming)
            val msgs = JSONArray()
            msgs.put(JSONObject().put("role", "system").put("content", persona))
            history.forEach { m ->
                if (m.role == "user" || m.role == "assistant") {
                    msgs.put(JSONObject().put("role", m.role).put("content", m.content))
                }
            }
            put("messages", msgs)
        }

        val reqBuilder = Request.Builder()
            .url(url)
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .header("Content-Type", "application/json")
        if (settings.apiKey.isNotBlank()) {
            reqBuilder.header("Authorization", "Bearer ${settings.apiKey}")
        }

        try {
            client.newCall(reqBuilder.build()).execute().use { resp ->
                if (!resp.isSuccessful) {
                    val body = resp.body?.string()?.take(400) ?: ""
                    return@withContext Result(false, "HTTP ${resp.code}: $body")
                }
                val source = resp.body?.source() ?: return@withContext Result(false, "Empty response")

                if (!settings.streaming) {
                    val text = source.readUtf8()
                    val json = JSONObject(text)
                    val content = json.optJSONArray("choices")
                        ?.optJSONObject(0)?.optJSONObject("message")?.optString("content") ?: ""
                    onDelta(content)
                    return@withContext Result(true, usage = parseUsage(json))
                }

                var usage: Usage? = null
                while (!source.exhausted()) {
                    val line = source.readUtf8Line() ?: break
                    if (line.isBlank()) continue
                    if (!line.startsWith("data:")) continue
                    val data = line.removePrefix("data:").trim()
                    if (data == "[DONE]") break
                    runCatching {
                        val obj = JSONObject(data)
                        val delta = obj.optJSONArray("choices")
                            ?.optJSONObject(0)?.optJSONObject("delta")?.optString("content")
                        if (!delta.isNullOrEmpty()) onDelta(delta)
                        obj.optJSONObject("usage")?.let { usage = parseUsage(obj) }
                    }
                }
                Result(true, usage = usage)
            }
        } catch (e: Exception) {
            Result(false, e.message ?: "Network error")
        }
    }

    private fun parseUsage(json: JSONObject): Usage? {
        val u = json.optJSONObject("usage") ?: return null
        return Usage(u.optInt("prompt_tokens"), u.optInt("completion_tokens"))
    }

    /** Offline, deterministic responder so the app works with no key/backend. */
    private suspend fun demoResponder(
        history: List<ChatMessage>,
        onDelta: (String) -> Unit
    ): Result {
        val lastUser = history.lastOrNull { it.role == "user" }?.content?.trim().orEmpty()
        val reply = buildDemoReply(lastUser)
        // Stream word-by-word to mimic a live model.
        val tokens = reply.split(" ")
        for ((i, w) in tokens.withIndex()) {
            onDelta(if (i == 0) w else " $w")
            delay(18)
        }
        return Result(true, usage = Usage(lastUser.length / 4, reply.length / 4))
    }

    private fun buildDemoReply(prompt: String): String {
        if (prompt.startsWith("/")) {
            return "Ran command `${prompt.substringBefore(' ')}` (offline demo). " +
                "Connect a backend in Settings to execute it for real."
        }
        return "🕊️ Hermes (offline demo): I received \"" +
            prompt.take(160) +
            "\". I'm running without a connected model right now, so this is a " +
            "canned reply. Open Settings, pick a provider (Nous Portal, OpenRouter, " +
            "OpenAI, a local Ollama/vLLM server, or a remote Hermes backend), add your " +
            "API key and turn off Demo mode — then I'll stream real answers, use tools, " +
            "and remember this conversation across sessions."
    }
}
