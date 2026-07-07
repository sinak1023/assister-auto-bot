package net.ostadkachal.hermes.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.ostadkachal.hermes.model.Attachment
import net.ostadkachal.hermes.model.ChatMessage
import net.ostadkachal.hermes.model.Conversation
import net.ostadkachal.hermes.model.Effort
import net.ostadkachal.hermes.model.ModelRef
import net.ostadkachal.hermes.model.Role
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Persists conversations (Hermes' "memory") to a single JSON file in internal storage. */
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
        o.put("modelRef", c.modelRef?.encode() ?: JSONObject.NULL)
        o.put("think", c.think)
        o.put("effort", c.effort.name)
        o.put("createdAt", c.createdAt)
        o.put("updatedAt", c.updatedAt)
        val msgs = JSONArray()
        c.messages.forEach { m ->
            val mo = JSONObject()
            mo.put("id", m.id)
            mo.put("role", m.role.name)
            mo.put("text", m.text)
            mo.put("thinking", m.thinking)
            mo.put("ts", m.ts)
            mo.put("error", m.error)
            val atts = JSONArray()
            m.attachments.forEach { a ->
                val ao = JSONObject()
                ao.put("id", a.id)
                ao.put("kind", a.kind.name)
                ao.put("name", a.name)
                ao.put("mimeType", a.mimeType)
                ao.put("base64", a.base64 ?: JSONObject.NULL)
                ao.put("text", a.text ?: JSONObject.NULL)
                atts.put(ao)
            }
            mo.put("attachments", atts)
            msgs.put(mo)
        }
        o.put("messages", msgs)
        return o
    }

    private fun fromJson(o: JSONObject): Conversation {
        val c = Conversation(
            id = o.optString("id"),
            title = o.optString("title", "Chat"),
            modelRef = ModelRef.decode(o.optString("modelRef", null)),
            think = o.optBoolean("think", false),
            effort = runCatching { Effort.valueOf(o.optString("effort", "MEDIUM")) }
                .getOrDefault(Effort.MEDIUM),
            createdAt = o.optLong("createdAt", System.currentTimeMillis()),
            updatedAt = o.optLong("updatedAt", System.currentTimeMillis())
        )
        val msgs = o.optJSONArray("messages") ?: JSONArray()
        for (i in 0 until msgs.length()) {
            val mo = msgs.getJSONObject(i)
            val role = runCatching { Role.valueOf(mo.optString("role", "USER")) }.getOrDefault(Role.USER)
            val msg = ChatMessage(
                id = mo.optString("id"),
                role = role,
                text = mo.optString("text"),
                thinking = mo.optString("thinking", ""),
                ts = mo.optLong("ts", System.currentTimeMillis()),
                error = mo.optBoolean("error", false)
            )
            val atts = mo.optJSONArray("attachments") ?: JSONArray()
            for (j in 0 until atts.length()) {
                val ao = atts.getJSONObject(j)
                msg.attachments.add(
                    Attachment(
                        id = ao.optString("id"),
                        kind = runCatching { Attachment.Kind.valueOf(ao.optString("kind", "TEXT")) }
                            .getOrDefault(Attachment.Kind.TEXT),
                        name = ao.optString("name", "file"),
                        mimeType = ao.optString("mimeType", "application/octet-stream"),
                        base64 = if (ao.isNull("base64")) null else ao.optString("base64"),
                        text = if (ao.isNull("text")) null else ao.optString("text")
                    )
                )
            }
            c.messages.add(msg)
        }
        return c
    }
}
