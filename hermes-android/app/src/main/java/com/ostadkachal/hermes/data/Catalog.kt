package com.ostadkachal.hermes.data

/**
 * Static catalogs mirroring what ships with Hermes: the bundled skills across
 * their categories, the messaging gateways, the toolsets, and the slash
 * commands surfaced in chat. Data is local; it reflects the desktop feature set.
 */
object Catalog {

    val skills: List<Skill> = listOf(
        // Software Development
        Skill("code-review", "Software Development", "Review diffs for bugs, style and security."),
        Skill("write-tests", "Software Development", "Generate unit/integration tests for a module."),
        Skill("refactor", "Software Development", "Restructure code without changing behavior."),
        Skill("debug", "Software Development", "Reproduce, isolate and fix a defect."),
        Skill("scaffold-project", "Software Development", "Bootstrap a new project skeleton."),
        // MLOps
        Skill("train-model", "MLOps", "Launch and monitor a training run."),
        Skill("eval-harness", "MLOps", "Run evaluation suites and summarize metrics."),
        Skill("deploy-endpoint", "MLOps", "Serve a model behind an inference endpoint."),
        // GitHub
        Skill("open-pr", "GitHub", "Create a pull request from the working branch."),
        Skill("triage-issues", "GitHub", "Label, group and prioritize open issues."),
        Skill("review-pr", "GitHub", "Leave a structured review on a pull request."),
        // Research
        Skill("web-research", "Research", "Search the web and synthesize findings."),
        Skill("literature-review", "Research", "Summarize papers on a topic."),
        Skill("fact-check", "Research", "Verify claims against sources."),
        Skill("summarize", "Research", "Condense long documents."),
        // Creative
        Skill("write-article", "Creative", "Draft long-form articles."),
        Skill("brainstorm", "Creative", "Generate and rank ideas."),
        Skill("image-gen", "Creative", "Generate images from prompts."),
        Skill("storyboard", "Creative", "Plan a narrative or campaign."),
        // Productivity
        Skill("inbox-zero", "Productivity", "Triage and draft email replies."),
        Skill("meeting-notes", "Productivity", "Turn transcripts into action items."),
        Skill("calendar-plan", "Productivity", "Plan and schedule tasks."),
        // DevOps
        Skill("provision-infra", "DevOps", "Stand up infrastructure with IaC."),
        Skill("ci-pipeline", "DevOps", "Author or repair CI pipelines."),
        Skill("incident-response", "DevOps", "Diagnose and mitigate outages."),
        Skill("container-build", "DevOps", "Build and push container images."),
        // Data
        Skill("sql-explore", "Data", "Query and profile a dataset."),
        Skill("data-clean", "Data", "Normalize and de-duplicate records."),
        Skill("chart-it", "Data", "Produce charts from tabular data."),
        // Security
        Skill("threat-model", "Security", "Enumerate risks for a system."),
        Skill("secrets-scan", "Security", "Scan a repo for leaked secrets."),
        Skill("harden-config", "Security", "Apply secure defaults to configs."),
        // Web
        Skill("scrape-site", "Web", "Extract structured data from pages."),
        Skill("browse", "Web", "Drive a headless browser to complete tasks."),
        Skill("monitor-page", "Web", "Watch a page and alert on changes."),
        // Finance
        Skill("expense-report", "Finance", "Compile receipts into a report."),
        Skill("market-brief", "Finance", "Summarize market movements."),
        // Communication
        Skill("draft-message", "Communication", "Write a message for any channel."),
        Skill("translate", "Communication", "Translate between languages."),
        // Knowledge
        Skill("build-kb", "Knowledge", "Assemble a knowledge base."),
        Skill("qa-over-docs", "Knowledge", "Answer questions grounded in docs."),
        // Automation
        Skill("workflow", "Automation", "Chain steps into a repeatable workflow."),
        Skill("cron-task", "Automation", "Schedule recurring background work."),
        // Vision
        Skill("describe-image", "Vision", "Caption and analyze images."),
        Skill("ocr", "Vision", "Extract text from images."),
        // System
        Skill("shell", "System", "Run shell commands in the sandbox."),
        Skill("file-ops", "System", "Read, write and organize files."),
        Skill("self-improve", "System", "Run the GEPA loop to refine prompts.")
    )

    val categories: List<String> get() = skills.map { it.category }.distinct()

    val gateways: List<Gateway> = listOf(
        Gateway("Telegram", "Messaging"),
        Gateway("Discord", "Messaging"),
        Gateway("Slack", "Messaging"),
        Gateway("WhatsApp", "Messaging"),
        Gateway("Signal", "Messaging"),
        Gateway("Matrix", "Messaging"),
        Gateway("Email (SMTP/IMAP)", "Messaging"),
        Gateway("SMS", "Messaging"),
        Gateway("Microsoft Teams", "Messaging"),
        Gateway("Google Chat", "Messaging"),
        Gateway("Mattermost", "Messaging"),
        Gateway("Rocket.Chat", "Messaging"),
        Gateway("IRC", "Messaging"),
        Gateway("Webhook", "Messaging"),
        Gateway("Twilio Voice", "Messaging"),
        Gateway("Push (ntfy)", "Messaging")
    )

    val toolsets: List<Pair<String, String>> = listOf(
        "Web Browsing" to "Fetch and read pages, follow links.",
        "Terminal" to "Run commands inside the sandbox.",
        "File Operations" to "Read/write files in the scoped directory.",
        "Vision" to "Analyze images and screenshots.",
        "Image Generation" to "Create images from text.",
        "Code Execution" to "Run code and capture output.",
        "Search" to "Web and semantic search.",
        "Skill Management" to "Discover, install and run skills.",
        "Memory" to "Store and recall across sessions.",
        "Scheduler" to "Register cron tasks.",
        "Gateways" to "Send/receive over messaging channels.",
        "HTTP" to "Call arbitrary REST APIs.",
        "Secrets" to "Read credentials from a secrets manager.",
        "Multi-agent" to "Spawn and coordinate sub-agents."
    )

    /** Slash commands available in the chat composer. */
    val slashCommands: List<Pair<String, String>> = listOf(
        "/help" to "Show available commands",
        "/search" to "Web search",
        "/image" to "Generate an image",
        "/code" to "Run code in the sandbox",
        "/browse" to "Open a URL and read it",
        "/skills" to "List installed skills",
        "/memory" to "Recall from memory",
        "/remember" to "Store a memory",
        "/persona" to "Show or set the persona",
        "/model" to "Switch model",
        "/cost" to "Show token usage & cost",
        "/clear" to "Start a new session",
        "/summarize" to "Summarize this conversation",
        "/schedule" to "Create a cron task",
        "/tools" to "List available toolsets",
        "/reset" to "Reset the current context"
    )

    fun sampleMemory(): List<MemoryEntry> = listOf(
        MemoryEntry(layer = "Prompt", content = "User prefers concise, direct answers."),
        MemoryEntry(layer = "Session", content = "Working on an Android port of Hermes Desktop."),
        MemoryEntry(layer = "Semantic", content = "Project uses Kotlin + Jetpack Compose + OkHttp."),
        MemoryEntry(layer = "Procedural", content = "Skill 'open-pr' learned: branch, commit, push, then create PR.")
    )
}
