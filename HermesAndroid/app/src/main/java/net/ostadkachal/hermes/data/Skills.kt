package net.ostadkachal.hermes.data

import net.ostadkachal.hermes.model.Skill

/**
 * Built-in skills catalogue, mirroring Hermes' "procedural memory" concept.
 * Enabled skills are injected into the system prompt so the agent behaves accordingly.
 */
object Skills {
    val ALL: List<Skill> = listOf(
        Skill("memory", "Persistent Memory", "🧠",
            "Remembers facts, preferences and context across the whole conversation and past sessions."),
        Skill("web_reasoning", "Research & Reasoning", "🔍",
            "Breaks down questions, reasons step by step and synthesises clear answers."),
        Skill("coding", "Coding", "💻",
            "Writes, explains and debugs code across many languages with runnable snippets."),
        Skill("planning", "Planning", "🗓️",
            "Turns fuzzy goals into concrete, ordered, actionable step-by-step plans."),
        Skill("writing", "Writing & Editing", "✍️",
            "Drafts, rewrites and polishes text in the tone and length you ask for."),
        Skill("summarize", "Summarisation", "📝",
            "Condenses long content into tight, faithful summaries and bullet points."),
        Skill("data", "Data & Math", "📊",
            "Works through calculations, tables and structured data reasoning."),
        Skill("translate", "Translation", "🌐",
            "Translates between languages while preserving tone and meaning.")
    )

    fun byId(id: String): Skill? = ALL.firstOrNull { it.id == id }

    /** System-prompt fragment describing which skills are active. */
    fun promptFragment(enabled: Set<String>): String {
        val active = ALL.filter { enabled.contains(it.id) }
        if (active.isEmpty()) return ""
        val lines = active.joinToString("\n") { "- ${it.name}: ${it.description}" }
        return "\n\nActive skills:\n$lines"
    }
}
