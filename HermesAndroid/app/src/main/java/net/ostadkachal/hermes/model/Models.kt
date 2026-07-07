package net.ostadkachal.hermes.model

import java.util.UUID

enum class Role { USER, ASSISTANT, SYSTEM }

data class ChatMessage(
    val id: String = UUID.randomUUID().toString(),
    val role: Role,
    var text: String,
    val ts: Long = System.currentTimeMillis(),
    var streaming: Boolean = false,
    var error: Boolean = false
)

data class Conversation(
    val id: String = UUID.randomUUID().toString(),
    var title: String = "New chat",
    val createdAt: Long = System.currentTimeMillis(),
    var updatedAt: Long = System.currentTimeMillis(),
    val messages: MutableList<ChatMessage> = mutableListOf()
)

/** Provider families supported by the client. */
enum class ProviderType(val label: String, val defaultBaseUrl: String, val defaultModel: String) {
    ANTHROPIC("Anthropic", "https://api.anthropic.com", "claude-sonnet-4-20250514"),
    OPENAI("OpenAI", "https://api.openai.com/v1", "gpt-4o-mini"),
    NOUS("Nous Portal", "https://inference-api.nousresearch.com/v1", "Hermes-4-405B"),
    CUSTOM("Custom (OpenAI-compatible)", "http://10.0.2.2:8000/v1", "hermes")
}

data class Settings(
    val provider: ProviderType = ProviderType.ANTHROPIC,
    val baseUrl: String = ProviderType.ANTHROPIC.defaultBaseUrl,
    val apiKey: String = "",
    val model: String = ProviderType.ANTHROPIC.defaultModel,
    val systemPrompt: String = DEFAULT_SYSTEM_PROMPT,
    val temperature: Float = 0.7f,
    val enabledSkills: Set<String> = DEFAULT_ENABLED_SKILLS
) {
    val isConfigured: Boolean get() = apiKey.isNotBlank()

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
