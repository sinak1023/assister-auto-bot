package com.ostadkachal.hermes

import android.app.Application
import com.ostadkachal.hermes.data.Gateway
import com.ostadkachal.hermes.data.Catalog
import com.ostadkachal.hermes.data.MemoryEntry
import com.ostadkachal.hermes.data.ScheduledTask
import com.ostadkachal.hermes.data.Session
import com.ostadkachal.hermes.data.SessionStore
import com.ostadkachal.hermes.data.Settings
import com.ostadkachal.hermes.data.Skill
import com.ostadkachal.hermes.net.HermesClient

/** Holds process-wide singletons and lightweight in-memory state stores. */
class HermesApp : Application() {

    lateinit var settings: Settings
        private set
    lateinit var sessionStore: SessionStore
        private set
    lateinit var client: HermesClient
        private set

    // In-memory stores for feature screens (persist-lite).
    val memory = mutableListOf<MemoryEntry>()
    val tasks = mutableListOf<ScheduledTask>()
    val skills = mutableListOf<Skill>()
    val gateways = mutableListOf<Gateway>()

    override fun onCreate() {
        super.onCreate()
        settings = Settings(this)
        sessionStore = SessionStore(this)
        client = HermesClient(settings)
        memory.addAll(Catalog.sampleMemory())
        skills.addAll(Catalog.skills)
        gateways.addAll(Catalog.gateways)
        tasks.add(
            ScheduledTask(
                name = "Morning brief",
                cron = "0 8 * * *",
                prompt = "Summarize overnight emails and news.",
                delivery = "Telegram"
            )
        )
    }

    companion object {
        lateinit var instance: HermesApp
            private set
    }

    init {
        instance = this
    }
}
