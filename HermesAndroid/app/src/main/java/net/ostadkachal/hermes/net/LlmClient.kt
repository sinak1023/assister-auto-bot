package net.ostadkachal.hermes.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import net.ostadkachal.hermes.data.Skills
import net.ostadkachal.hermes.model.Attachment
import net.ostadkachal.hermes.model.ChatMessage
import net.ostadkachal.hermes.model.Effort
import net.ostadkachal.hermes.model.ProviderKind
import net.ostadkachal.hermes.model.ProviderProfile
import net.ostadkachal.hermes.model.Role
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.coroutines.coroutineContext

/**
 * Streaming chat + model discovery for Anthropic and OpenAI-compatible providers.
 * Supports extended thinking (reasoning), effort levels, and image/text attachments.
 */
class LlmClient {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(300, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val json = "application/json".toMediaType()

    // ---------- Model discovery ----------

    /** Fetches available model IDs for a provider. Throws on failure. */
    suspend fun listModels(profile: ProviderProfile): List<String> = withContext(Dispatchers.IO) {
        val (url, req) = when (profile.kind) {
            ProviderKind.ANTHROPIC -> {
                val u = profile.baseUrl.trimEnd('/') + "/v1/models?limit=1000"
                u to Request.Builder().url(u)
                    .header("x-api-key", profile.apiKey)
                    .header("anthropic-version", "2023-06-01")
                    .get().build()
            }
            ProviderKind.OPENAI -> {
                val u = profile.baseUrl.trimEnd('/') + "/models"
                u to Request.Builder().url(u)
                    .header("Authorization", "Bearer ${profile.apiKey}")
                    .get().build()
            }
        }
        client.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw RuntimeException("HTTP ${resp.code}: ${body.take(300).ifBlank { resp.message }}")
            val data = JSONObject(body).optJSONArray("data") ?: JSONArray()
            val out = ArrayList<String>(data.length())
            for (i in 0 until data.length()) {
                val id = data.getJSONObject(i).optString("id")
                if (id.isNotBlank()) out.add(id)
            }
            out.sorted()
        }
    }

    // ---------- Chat completion ----------

    suspend fun complete(
        profile: ProviderProfile?,
        modelId: String?,
        systemPrompt: String,
        enabledSkills: Set<String>,
        history: List<ChatMessage>,
        think: Boolean,
        effort: Effort,
        onText: (String) -> Unit,
        onThinking: (String) -> Unit
    ) = withContext(Dispatchers.IO) {
        if (profile == null || !profile.isConfigured || modelId.isNullOrBlank()) {
            demoReply(history, onText); return@withContext
        }
        val system = systemPrompt + Skills.promptFragment(enabledSkills)
        when (profile.kind) {
            ProviderKind.ANTHROPIC -> streamAnthropic(profile, modelId, system, history, think, effort, onText, onThinking)
            ProviderKind.OPENAI -> streamOpenAi(profile, modelId, system, history, think, effort, onText, onThinking)
        }
    }

    // ---------- Anthropic ----------

    private suspend fun streamAnthropic(
        p: ProviderProfile, model: String, system: String, history: List<ChatMessage>,
        think: Boolean, effort: Effort, onText: (String) -> Unit, onThinking: (String) -> Unit
    ) {
        val messages = JSONArray()
        for (m in history) {
            if (m.role == Role.SYSTEM) continue
            val role = if (m.role == Role.USER) "user" else "assistant"
            messages.put(JSONObject().put("role", role).put("content", anthropicContent(m)))
        }
        val body = JSONObject().apply {
            put("model", model)
            put("max_tokens", if (think) 8192 else 4096)
            put("stream", true)
            put("system", system)
            put("messages", messages)
            if (think) {
                put("thinking", JSONObject().put("type", "adaptive").put("display", "summarized"))
                put("output_config", JSONObject().put("effort", effort.anthropic()))
            }
        }
        val url = p.baseUrl.trimEnd('/') + "/v1/messages"
        val req = Request.Builder().url(url)
            .header("x-api-key", p.apiKey)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .post(body.toString().toRequestBody(json))
            .build()
        runSse(req) { data ->
            val evt = JSONObject(data)
            when (evt.optString("type")) {
                "content_block_delta" -> {
                    val d = evt.optJSONObject("delta") ?: return@runSse
                    when (d.optString("type")) {
                        "text_delta" -> d.optString("text").takeIf { it.isNotEmpty() }?.let(onText)
                        "thinking_delta" -> d.optString("thinking").takeIf { it.isNotEmpty() }?.let(onThinking)
                    }
                }
                "error" -> throw RuntimeException(evt.optJSONObject("error")?.optString("message") ?: "API error")
            }
        }
    }

    /** Anthropic user/assistant content: array of image + text blocks. */
    private fun anthropicContent(m: ChatMessage): Any {
        val images = m.attachments.filter { it.kind == Attachment.Kind.IMAGE && it.base64 != null }
        val text = composeText(m)
        if (images.isEmpty()) return text
        val arr = JSONArray()
        for (img in images) {
            arr.put(
                JSONObject().put("type", "image").put(
                    "source",
                    JSONObject().put("type", "base64").put("media_type", img.mimeType).put("data", img.base64)
                )
            )
        }
        if (text.isNotEmpty()) arr.put(JSONObject().put("type", "text").put("text", text))
        return arr
    }

    // ---------- OpenAI-compatible ----------

    private suspend fun streamOpenAi(
        p: ProviderProfile, model: String, system: String, history: List<ChatMessage>,
        think: Boolean, effort: Effort, onText: (String) -> Unit, onThinking: (String) -> Unit
    ) {
        val messages = JSONArray()
        messages.put(JSONObject().put("role", "system").put("content", system))
        for (m in history) {
            if (m.role == Role.SYSTEM) continue
            val role = if (m.role == Role.USER) "user" else "assistant"
            messages.put(JSONObject().put("role", role).put("content", openAiContent(m)))
        }
        val body = JSONObject().apply {
            put("model", model)
            put("stream", true)
            put("messages", messages)
            if (think) put("reasoning_effort", effort.openai())
        }
        val url = p.baseUrl.trimEnd('/') + "/chat/completions"
        val req = Request.Builder().url(url)
            .header("Authorization", "Bearer ${p.apiKey}")
            .header("content-type", "application/json")
            .post(body.toString().toRequestBody(json))
            .build()
        runSse(req) { data ->
            if (data.trim() == "[DONE]") return@runSse
            val choices = JSONObject(data).optJSONArray("choices") ?: return@runSse
            if (choices.length() == 0) return@runSse
            val delta = choices.getJSONObject(0).optJSONObject("delta") ?: return@runSse
            delta.optString("content").takeIf { it.isNotEmpty() }?.let(onText)
            // reasoning models stream thinking under various keys
            (delta.optString("reasoning_content").ifEmpty { delta.optString("reasoning") })
                .takeIf { it.isNotEmpty() }?.let(onThinking)
        }
    }

    private fun openAiContent(m: ChatMessage): Any {
        val images = m.attachments.filter { it.kind == Attachment.Kind.IMAGE && it.base64 != null }
        val text = composeText(m)
        if (images.isEmpty()) return text
        val arr = JSONArray()
        if (text.isNotEmpty()) arr.put(JSONObject().put("type", "text").put("text", text))
        for (img in images) {
            arr.put(
                JSONObject().put("type", "image_url").put(
                    "image_url", JSONObject().put("url", "data:${img.mimeType};base64,${img.base64}")
                )
            )
        }
        return arr
    }

    /** Message text plus any inlined text-file attachments. */
    private fun composeText(m: ChatMessage): String {
        val textFiles = m.attachments.filter { it.kind == Attachment.Kind.TEXT && it.text != null }
        if (textFiles.isEmpty()) return m.text
        val sb = StringBuilder(m.text)
        for (f in textFiles) {
            sb.append("\n\n--- attached file: ${f.name} ---\n").append(f.text)
        }
        return sb.toString().trim()
    }

    // ---------- SSE plumbing ----------

    private suspend fun runSse(req: Request, handle: (String) -> Unit) {
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
                    if (payload.isNotEmpty()) handle(payload)
                }
            }
        }
    }

    // ---------- Demo mode ----------

    private suspend fun demoReply(history: List<ChatMessage>, onText: (String) -> Unit) {
        val last = history.lastOrNull { it.role == Role.USER }?.text?.trim().orEmpty()
        val reply = buildString {
            append("👋 Hermes (demo mode)\n\n")
            if (last.isNotEmpty()) append("You said: \"$last\".\n\n")
            append("No provider is configured yet. Open Settings ⚙️, add an API key to a provider, ")
            append("tap \"Detect models\", then pick a model from the top bar. ")
            append("You can also toggle Think mode and choose the reasoning effort per chat.")
        }
        for (word in reply.split(" ")) {
            coroutineContext.ensureActive()
            onText("$word ")
            kotlinx.coroutines.delay(16)
        }
    }
}
