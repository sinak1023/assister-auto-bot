package net.ostadkachal.hermes.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.ostadkachal.hermes.model.ChatMessage
import net.ostadkachal.hermes.model.Conversation
import net.ostadkachal.hermes.model.Role
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Persists conversations (Hermes' "memory") to a single JSON file in internal storage.
 * Simple and dependency-free; robust enough for on-device history.
 */
class ConversationStore(context: Context) {

    private val file = File(context.filesDir, "conversations.json")

    suspend fun loadAll(): MutableList<Conversation> = withContext(Dispatchers.IO) {
        if (!file.exists()) return@withContext mutableListOf()
        runCatching {
            val arr = JSONArray(file.readText())
            val out = ArrayList<Conversation>(arr.length())
            for (i in 0 until arr.length()) out.add(fromJson(arr.getJSONObject(i)))
            out.sortByDescending { it.updatedAt }
            out
        }.getOrDefault(mutableListOf())
    }

    suspend fun saveAll(list: List<Conversation>) = withContext(Dispatchers.IO) {
        val arr = JSONArray()
        list.forEach { arr.put(toJson(it)) }
        runCatching { file.writeText(arr.toString()) }
        Unit
    }

    private fun toJson(c: Conversation): JSONObject {
        val o = JSONObject()
        o.put("id", c.id)
        o.put("title", c.title)
        o.put("createdAt", c.createdAt)
        o.put("updatedAt", c.updatedAt)
        val msgs = JSONArray()
        c.messages.forEach { m ->
            val mo = JSONObject()
            mo.put("id", m.id)
            mo.put("role", m.role.name)
            mo.put("text", m.text)
            mo.put("ts", m.ts)
            mo.put("error", m.error)
            msgs.put(mo)
        }
        o.put("messages", msgs)
        return o
    }

    private fun fromJson(o: JSONObject): Conversation {
        val c = Conversation(
            id = o.optString("id"),
            title = o.optString("title", "Chat"),
            createdAt = o.optLong("createdAt", System.currentTimeMillis()),
            updatedAt = o.optLong("updatedAt", System.currentTimeMillis())
        )
        val msgs = o.optJSONArray("messages") ?: JSONArray()
        for (i in 0 until msgs.length()) {
            val mo = msgs.getJSONObject(i)
            val role = runCatching { Role.valueOf(mo.optString("role", "USER")) }.getOrDefault(Role.USER)
            c.messages.add(
                ChatMessage(
                    id = mo.optString("id"),
                    role = role,
                    text = mo.optString("text"),
                    ts = mo.optLong("ts", System.currentTimeMillis()),
                    error = mo.optBoolean("error", false)
                )
            )
        }
        return c
    }
}
