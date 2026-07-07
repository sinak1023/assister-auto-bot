package com.ostadkachal.hermes.ui.chat

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ostadkachal.hermes.HermesApp
import com.ostadkachal.hermes.data.ChatMessage
import com.ostadkachal.hermes.data.Session
import kotlinx.coroutines.launch

class ChatViewModel(app: Application) : AndroidViewModel(app) {
    private val appCtx = app as HermesApp

    val messages = mutableStateListOf<ChatMessage>()
    var input by mutableStateOf("")
    var isStreaming by mutableStateOf(false)
        private set
    var lastError by mutableStateOf<String?>(null)
        private set
    var totalTokens by mutableIntStateOf(0)
        private set

    private var session: Session = Session(title = "New session")

    fun loadSession(id: String?) {
        if (id != null && id == session.id && messages.isNotEmpty()) return
        if (id != null) {
            appCtx.sessionStore.get(id)?.let {
                session = it
                messages.clear()
                messages.addAll(it.messages)
                totalTokens = 0
                return
            }
        }
        newSession()
    }

    fun newSession() {
        session = Session(title = "New session")
        messages.clear()
        totalTokens = 0
        lastError = null
    }

    fun send() {
        val text = input.trim()
        if (text.isEmpty() || isStreaming) return
        input = ""
        lastError = null

        if (text == "/clear" || text == "/reset") {
            newSession()
            return
        }

        messages.add(ChatMessage(role = "user", content = text))
        if (session.title == "New session") {
            session.title = text.take(48)
        }

        val assistantIndex = messages.size
        messages.add(ChatMessage(role = "assistant", content = "", streaming = true))
        isStreaming = true

        viewModelScope.launch {
            val builder = StringBuilder()
            val result = appCtx.client.streamChat(
                persona = appCtx.settings.persona,
                history = messages.filter { it.role == "user" || it.role == "assistant" }
            ) { delta ->
                builder.append(delta)
                messages[assistantIndex] =
                    messages[assistantIndex].copy(content = builder.toString(), streaming = true)
            }

            messages[assistantIndex] = messages[assistantIndex].copy(
                content = if (result.ok) builder.toString()
                else "⚠️ ${result.error}",
                streaming = false
            )
            result.usage?.let { totalTokens += it.total }
            if (!result.ok) lastError = result.error
            isStreaming = false

            // Persist the session after each exchange.
            session.messages.clear()
            session.messages.addAll(messages)
            appCtx.sessionStore.upsert(session)
        }
    }
}
