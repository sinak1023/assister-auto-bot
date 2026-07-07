package net.ostadkachal.hermes.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import net.ostadkachal.hermes.data.ConversationStore
import net.ostadkachal.hermes.data.SettingsStore
import net.ostadkachal.hermes.model.ChatMessage
import net.ostadkachal.hermes.model.Conversation
import net.ostadkachal.hermes.model.Role
import net.ostadkachal.hermes.model.Settings
import net.ostadkachal.hermes.net.LlmClient

data class UiState(
    val settings: Settings = Settings(),
    val conversations: List<Conversation> = emptyList(),
    val current: Conversation = Conversation(),
    val sending: Boolean = false,
    val loaded: Boolean = false
)

class HermesViewModel(app: Application) : AndroidViewModel(app) {

    private val settingsStore = SettingsStore(app)
    private val convStore = ConversationStore(app)
    private val llm = LlmClient()

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var streamJob: Job? = null

    init {
        viewModelScope.launch {
            settingsStore.settings.collect { s ->
                _state.update { it.copy(settings = s) }
            }
        }
        viewModelScope.launch {
            val all = convStore.loadAll()
            val current = all.firstOrNull() ?: Conversation()
            _state.update { it.copy(conversations = all, current = current, loaded = true) }
        }
    }

    fun newChat() {
        streamJob?.cancel()
        _state.update { it.copy(current = Conversation(), sending = false) }
    }

    fun openConversation(id: String) {
        streamJob?.cancel()
        val c = _state.value.conversations.firstOrNull { it.id == id } ?: return
        _state.update { it.copy(current = c, sending = false) }
    }

    fun deleteConversation(id: String) {
        viewModelScope.launch {
            val remaining = _state.value.conversations.filterNot { it.id == id }.toMutableList()
            convStore.saveAll(remaining)
            val current = if (_state.value.current.id == id)
                (remaining.firstOrNull() ?: Conversation()) else _state.value.current
            _state.update { it.copy(conversations = remaining, current = current) }
        }
    }

    fun updateSettings(s: Settings) {
        viewModelScope.launch { settingsStore.update(s) }
    }

    fun stopStreaming() {
        streamJob?.cancel()
        _state.update { st ->
            st.current.messages.lastOrNull()?.let { if (it.streaming) it.streaming = false }
            st.copy(sending = false, current = st.current.copy())
        }
    }

    fun send(text: String) {
        val content = text.trim()
        if (content.isEmpty() || _state.value.sending) return

        val conv = _state.value.current
        conv.messages.add(ChatMessage(role = Role.USER, text = content))
        if (conv.messages.count { it.role == Role.USER } == 1) {
            conv.title = content.take(40)
        }
        val assistant = ChatMessage(role = Role.ASSISTANT, text = "", streaming = true)
        conv.messages.add(assistant)
        conv.updatedAt = System.currentTimeMillis()
        _state.update { it.copy(current = conv.copy(), sending = true) }
        persistCurrent()

        val historyForApi = conv.messages.dropLast(1) // exclude the empty assistant placeholder

        streamJob = viewModelScope.launch {
            try {
                llm.complete(_state.value.settings, historyForApi) { delta ->
                    assistant.text += delta
                    bump()
                }
                assistant.streaming = false
            } catch (ce: kotlinx.coroutines.CancellationException) {
                assistant.streaming = false
                if (assistant.text.isEmpty()) assistant.text = "⏹️ Stopped."
                throw ce
            } catch (e: Exception) {
                assistant.streaming = false
                assistant.error = true
                assistant.text = "⚠️ " + (e.message ?: "Request failed") +
                    "\n\nCheck your provider, base URL, model name and API key in Settings."
            } finally {
                conv.updatedAt = System.currentTimeMillis()
                _state.update { it.copy(sending = false, current = conv.copy()) }
                persistCurrent()
            }
        }
    }

    /** Force a state emission so Compose observes the mutated streaming message. */
    private fun bump() {
        _state.update { it.copy(current = it.current.copy()) }
    }

    private fun persistCurrent() {
        viewModelScope.launch {
            val conv = _state.value.current
            if (conv.messages.isEmpty()) return@launch
            val list = _state.value.conversations.toMutableList()
            val idx = list.indexOfFirst { it.id == conv.id }
            if (idx >= 0) list[idx] = conv else list.add(0, conv)
            list.sortByDescending { it.updatedAt }
            convStore.saveAll(list)
            _state.update { it.copy(conversations = list) }
        }
    }
}
