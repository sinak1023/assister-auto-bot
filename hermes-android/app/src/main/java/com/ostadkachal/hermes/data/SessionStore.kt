package com.ostadkachal.hermes.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * File-backed session archive. Persists conversations as JSON in the app's
 * private storage and offers simple full-text search over titles + content
 * (the mobile stand-in for Hermes' SQLite FTS5 archive).
 */
class SessionStore(context: Context) {
    private val file = File(context.filesDir, "sessions.json")
    private val sessions = mutableListOf<Session>()

    init {
        load()
    }

    @Synchronized
    fun all(): List<Session> = sessions.sortedByDescending { it.updatedAt }

    @Synchronized
    fun get(id: String): Session? = sessions.firstOrNull { it.id == id }

    @Synchronized
    fun upsert(session: Session) {
        val idx = sessions.indexOfFirst { it.id == session.id }
        session.updatedAt = System.currentTimeMillis()
        if (idx >= 0) sessions[idx] = session else sessions.add(session)
        save()
    }

    @Synchronized
    fun delete(id: String) {
        sessions.removeAll { it.id == id }
        save()
    }

    @Synchronized
    fun search(query: String): List<Session> {
        if (query.isBlank()) return all()
        val q = query.trim().lowercase()
        return all().filter { s ->
            s.title.lowercase().contains(q) ||
                s.messages.any { it.content.lowercase().contains(q) }
        }
    }

    private fun load() {
        sessions.clear()
        if (!file.exists()) return
        runCatching {
            val arr = JSONArray(file.readText())
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val msgs = mutableListOf<ChatMessage>()
                val ma = o.optJSONArray("messages") ?: JSONArray()
                for (j in 0 until ma.length()) {
                    val m = ma.getJSONObject(j)
                    msgs.add(
                        ChatMessage(
                            role = m.optString("role"),
                            content = m.optString("content"),
                            timestamp = m.optLong("timestamp"),
                            toolName = m.optString("toolName").ifBlank { null }
                        )
                    )
                }
                sessions.add(
                    Session(
                        id = o.optString("id"),
                        title = o.optString("title"),
                        createdAt = o.optLong("createdAt"),
                        updatedAt = o.optLong("updatedAt"),
                        messages = msgs
                    )
                )
            }
        }
    }

    private fun save() {
        val arr = JSONArray()
        for (s in sessions) {
            val o = JSONObject()
            o.put("id", s.id)
            o.put("title", s.title)
            o.put("createdAt", s.createdAt)
            o.put("updatedAt", s.updatedAt)
            val ma = JSONArray()
            for (m in s.messages) {
                val mo = JSONObject()
                mo.put("role", m.role)
                mo.put("content", m.content)
                mo.put("timestamp", m.timestamp)
                if (m.toolName != null) mo.put("toolName", m.toolName)
                ma.put(mo)
            }
            o.put("messages", ma)
            arr.put(o)
        }
        runCatching { file.writeText(arr.toString()) }
    }
}
