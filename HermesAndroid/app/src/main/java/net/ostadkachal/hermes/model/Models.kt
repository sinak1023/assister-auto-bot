package net.ostadkachal.hermes.model

import java.util.UUID

enum class Role { USER, ASSISTANT, SYSTEM }

/** API dialect a provider speaks. */
enum class ProviderKind { ANTHROPIC, OPENAI }

/** Reasoning effort levels (map to provider-specific params). */
enum class Effort(val label: String) {
    LOW("Low"),
    MEDIUM("Medium"),
    HIGH("High"),
    MAX("Max");

    /** Anthropic output_config.effort value. */
    fun anthropic(): String = when (this) {
        LOW -> "low"; MEDIUM -> "medium"; HIGH -> "high"; MAX -> "max"
    }

    /** OpenAI reasoning_effort value (no "max"; clamp to high). */
    fun openai(): String = when (this) {
        LOW -> "low"; MEDIUM -> "medium"; HIGH, MAX -> "high"
    }
}

/** A configured provider account: its own key, base URL and discovered models. */
data class ProviderProfile(
    val id: String = UUID.randomUUID().toString(),
    var name: String,
    var kind: ProviderKind,
    var baseUrl: String,
    var apiKey: String,
    var models: List<String> = emptyList()
) {
    val isConfigured: Boolean get() = apiKey.isNotBlank()

    companion object {
        fun anthropic() = ProviderProfile(
            name = "Anthropic", kind = ProviderKind.ANTHROPIC,
            baseUrl = "https://api.anthropic.com", apiKey = ""
        )
        fun openai() = ProviderProfile(
            name = "OpenAI", kind = ProviderKind.OPENAI,
            baseUrl = "https://api.openai.com/v1", apiKey = ""
        )
        fun nous() = ProviderProfile(
            name = "Nous Portal", kind = ProviderKind.OPENAI,
            baseUrl = "https://inference-api.nousresearch.com/v1", apiKey = ""
        )
    }
}

/** Uniquely identifies a model across all provider profiles. */
data class ModelRef(val profileId: String, val modelId: String) {
    fun encode(): String = "$profileId|$modelId"
    companion object {
        fun decode(s: String?): ModelRef? {
            if (s.isNullOrBlank()) return null
            val i = s.indexOf('|')
            if (i <= 0) return null
            return ModelRef(s.substring(0, i), s.substring(i + 1))
        }
    }
}

/** A file attached to a user message. */
data class Attachment(
    val id: String = UUID.randomUUID().toString(),
    val kind: Kind,
    val name: String,
    val mimeType: String,
    /** Base64 (images) — data only, no prefix. */
    val base64: String? = null,
    /** Inlined text content (text files). */
    val text: String? = null
) {
    enum class Kind { IMAGE, TEXT }
}

data class ChatMessage(
    val id: String = UUID.randomUUID().toString(),
    val role: Role,
    var text: String,
    var thinking: String = "",
    val attachments: MutableList<Attachment> = mutableListOf(),
    val ts: Long = System.currentTimeMillis(),
    var streaming: Boolean = false,
    var error: Boolean = false
)

data class Conversation(
    val id: String = UUID.randomUUID().toString(),
    var title: String = "New chat",
    var modelRef: ModelRef? = null,
    var think: Boolean = false,
    var effort: Effort = Effort.MEDIUM,
    val createdAt: Long = System.currentTimeMillis(),
    var updatedAt: Long = System.currentTimeMillis(),
    val messages: MutableList<ChatMessage> = mutableListOf()
)

/** Whole-app configuration. */
data class AppConfig(
    val profiles: List<ProviderProfile> = emptyList(),
    val selectedModel: ModelRef? = null,
    val systemPrompt: String = DEFAULT_SYSTEM_PROMPT,
    val enabledSkills: Set<String> = DEFAULT_ENABLED_SKILLS
) {
    fun profile(id: String?): ProviderProfile? = profiles.firstOrNull { it.id == id }

    /** Flat list of every (profile, model) pair for pickers. */
    fun allModels(): List<Pair<ProviderProfile, String>> =
        profiles.flatMap { p -> p.models.map { p to it } }

    fun modelLabel(ref: ModelRef?): String {
        if (ref == null) return "No model"
        val p = profile(ref.profileId) ?: return ref.modelId
        return ref.modelId
    }

    val hasUsableModel: Boolean
        get() = selectedModel != null && profile(selectedModel.profileId)?.isConfigured == true

    companion object {
        const val DEFAULT_SYSTEM_PROMPT =
            "You are Hermes, a helpful, autonomous AI agent that grows with the user. " +
            "You are precise, proactive, and remember context across the conversation. " +
            "Answer clearly and use your enabled skills when relevant."
        val DEFAULT_ENABLED_SKILLS = setOf("memory", "web_reasoning", "coding", "planning")
    }
}

data class Skill(
    val id: String,
    val name: String,
    val emoji: String,
    val description: String
)
