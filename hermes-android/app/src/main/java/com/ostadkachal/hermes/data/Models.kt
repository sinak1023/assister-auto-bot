package com.ostadkachal.hermes.data

import java.util.UUID

/** A single turn in a conversation. Roles follow the OpenAI chat schema. */
data class ChatMessage(
    val role: String,
    val content: String,
    val timestamp: Long = System.currentTimeMillis(),
    val toolName: String? = null,
    val streaming: Boolean = false
)

/** A saved conversation. Mirrors Hermes' session archive (title + timeline). */
data class Session(
    val id: String = UUID.randomUUID().toString(),
    var title: String,
    val createdAt: Long = System.currentTimeMillis(),
    var updatedAt: Long = System.currentTimeMillis(),
    val messages: MutableList<ChatMessage> = mutableListOf()
)

/** An entry in the bundled skill catalog (agentskills.io-style). */
data class Skill(
    val name: String,
    val category: String,
    val description: String,
    var installed: Boolean = true
)

/** A memory record across Hermes' memory layers. */
data class MemoryEntry(
    val id: String = UUID.randomUUID().toString(),
    val layer: String,
    val content: String,
    val createdAt: Long = System.currentTimeMillis()
)

/** A cron-scheduled task with a delivery target. */
data class ScheduledTask(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val cron: String,
    val prompt: String,
    val delivery: String,
    var enabled: Boolean = true
)

/** A messaging-gateway integration entry. */
data class Gateway(
    val name: String,
    val category: String,
    var connected: Boolean = false
)

/** Preset connection profiles for OpenAI-compatible backends Hermes supports. */
enum class ProviderPreset(
    val label: String,
    val baseUrl: String,
    val defaultModel: String
) {
    NOUS("Nous Portal", "https://inference-api.nousresearch.com/v1", "Hermes-4-405B"),
    OPENROUTER("OpenRouter", "https://openrouter.ai/api/v1", "nousresearch/hermes-4-405b"),
    OPENAI("OpenAI", "https://api.openai.com/v1", "gpt-4o-mini"),
    LOCAL("Local (Ollama / vLLM / LM Studio)", "http://10.0.2.2:11434/v1", "llama3.1"),
    HERMES_BACKEND("Hermes backend (remote)", "http://10.0.2.2:8642/v1", "hermes"),
    CUSTOM("Custom OpenAI-compatible", "", "");

    companion object {
        fun fromLabel(label: String): ProviderPreset =
            entries.firstOrNull { it.label == label } ?: CUSTOM
    }
}
