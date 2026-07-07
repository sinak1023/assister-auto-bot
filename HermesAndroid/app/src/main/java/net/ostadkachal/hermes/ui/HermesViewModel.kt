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
import net.ostadkachal.hermes.data.ConfigStore
import net.ostadkachal.hermes.data.ConversationStore
import net.ostadkachal.hermes.model.AppConfig
import net.ostadkachal.hermes.model.Attachment
import net.ostadkachal.hermes.model.ChatMessage
import net.ostadkachal.hermes.model.Conversation
import net.ostadkachal.hermes.model.Effort
import net.ostadkachal.hermes.model.ModelRef
import net.ostadkachal.hermes.model.ProviderProfile
import net.ostadkachal.hermes.model.Role
import net.ostadkachal.hermes.net.LlmClient

data class UiState(
    val config: AppConfig = AppConfig(),
    val conversations: List<Conversation> = emptyList(),
    val current: Conversation = Conversation(),
    val pending: List<Attachment> = emptyList(),
    val sending: Boolean = false,
    val loaded: Boolean = false,
    val detectingProfileId: String? = null,
    val toast: String? = null
) {
    /** Model in effect for the current chat. */
    val effectiveModel: ModelRef?
        get() = current.modelRef ?: config.selectedModel
}

class HermesViewModel(app: Application) : AndroidViewModel(app) {

    private val configStore = ConfigStore(app)
    private val convStore = ConversationStore(app)
    private val llm = LlmClient()

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var streamJob: Job? = null

    init {
        viewModelScope.launch {
            configStore.config.collect { cfg -> _state.update { it.copy(config = cfg) } }
        }
        viewModelScope.launch {
            val all = convStore.loadAll()
            val current = all.firstOrNull() ?: Conversation()
            _state.update { it.copy(conversations = all, current = current, loaded = true) }
        }
    }

    // ---- chat lifecycle ----

    fun newChat() {
        streamJob?.cancel()
        val cfg = _state.value.config
        _state.update {
            it.copy(current = Conversation(modelRef = cfg.selectedModel), pending = emptyList(), sending = false)
        }
    }

    fun openConversation(id: String) {
        streamJob?.cancel()
        val c = _state.value.conversations.firstOrNull { it.id == id } ?: return
        _state.update { it.copy(current = c, pending = emptyList(), sending = false) }
    }

    fun deleteConversation(id: String) {
        viewModelScope.launch {
            val remaining = _state.value.conversations.filterNot { it.id == id }.toMutableList()
            convStore.saveAll(remaining)
            val current = if (_state.value.current.id == id)
                (remaining.firstOrNull() ?: Conversation(modelRef = _state.value.config.selectedModel))
            else _state.value.current
            _state.update { it.copy(conversations = remaining, current = current) }
        }
    }

    // ---- per-chat controls ----

    fun setThink(on: Boolean) {
        _state.value.current.think = on
        _state.update { it.copy(current = it.current.copy()) }
    }

    fun setEffort(e: Effort) {
        _state.value.current.effort = e
        _state.update { it.copy(current = it.current.copy()) }
    }

    fun selectModel(ref: ModelRef) {
        _state.value.current.modelRef = ref
        _state.update { it.copy(current = it.current.copy()) }
        // remember as the default for future chats too
        viewModelScope.launch { configStore.save(_state.value.config.copy(selectedModel = ref)) }
    }

    // ---- attachments ----

    fun addAttachment(a: Attachment) = _state.update { it.copy(pending = it.pending + a) }
    fun removeAttachment(id: String) = _state.update { it.copy(pending = it.pending.filterNot { a -> a.id == id }) }

    // ---- config editing ----

    fun saveProfile(p: ProviderProfile) {
        viewModelScope.launch {
            val cfg = _state.value.config
            val list = cfg.profiles.toMutableList()
            val idx = list.indexOfFirst { it.id == p.id }
            if (idx >= 0) list[idx] = p else list.add(p)
            configStore.save(cfg.copy(profiles = list))
        }
    }

    fun deleteProfile(id: String) {
        viewModelScope.launch {
            val cfg = _state.value.config
            val list = cfg.profiles.filterNot { it.id == id }
            val sel = if (cfg.selectedModel?.profileId == id) null else cfg.selectedModel
            configStore.save(cfg.copy(profiles = list, selectedModel = sel))
        }
    }

    fun updateSystemPrompt(text: String) {
        viewModelScope.launch { configStore.save(_state.value.config.copy(systemPrompt = text)) }
    }

    fun updateSkills(skills: Set<String>) {
        viewModelScope.launch { configStore.save(_state.value.config.copy(enabledSkills = skills)) }
    }

    fun detectModels(profileId: String) {
        val cfg = _state.value.config
        val profile = cfg.profile(profileId) ?: return
        if (!profile.isConfigured) {
            _state.update { it.copy(toast = "Add an API key first") }
            return
        }
        _state.update { it.copy(detectingProfileId = profileId, toast = null) }
        viewModelScope.launch {
            try {
                val models = llm.listModels(profile)
                val updated = profile.copy(models = models)
                val list = cfg.profiles.map { if (it.id == profileId) updated else it }
                // auto-select first model if nothing selected yet
                val sel = cfg.selectedModel ?: models.firstOrNull()?.let { ModelRef(profileId, it) }
                configStore.save(cfg.copy(profiles = list, selectedModel = sel))
                _state.update { it.copy(detectingProfileId = null, toast = "Found ${models.size} models") }
            } catch (e: Exception) {
                _state.update { it.copy(detectingProfileId = null, toast = "Detect failed: ${e.message}") }
            }
        }
    }

    fun clearToast() = _state.update { it.copy(toast = null) }

    // ---- sending ----

    fun stopStreaming() {
        streamJob?.cancel()
        _state.update { st ->
            st.current.messages.lastOrNull()?.let { if (it.streaming) it.streaming = false }
            st.copy(sending = false, current = st.current.copy())
        }
    }

    fun send(text: String) {
        val content = text.trim()
        val attachments = _state.value.pending
        if ((content.isEmpty() && attachments.isEmpty()) || _state.value.sending) return

        val conv = _state.value.current
        val userMsg = ChatMessage(role = Role.USER, text = content)
        userMsg.attachments.addAll(attachments)
        conv.messages.add(userMsg)
        if (conv.messages.count { it.role == Role.USER } == 1) {
            conv.title = content.take(40).ifBlank { "Chat" }
        }
        // pin the model actually used
        conv.modelRef = _state.value.effectiveModel

        val assistant = ChatMessage(role = Role.ASSISTANT, text = "", streaming = true)
        conv.messages.add(assistant)
        conv.updatedAt = System.currentTimeMillis()
        _state.update { it.copy(current = conv.copy(), pending = emptyList(), sending = true) }
        persistCurrent()

        val historyForApi = conv.messages.dropLast(1)
        val cfg = _state.value.config
        val ref = _state.value.effectiveModel
        val profile = cfg.profile(ref?.profileId)

        streamJob = viewModelScope.launch {
            try {
                llm.complete(
                    profile = profile,
                    modelId = ref?.modelId,
                    systemPrompt = cfg.systemPrompt,
                    enabledSkills = cfg.enabledSkills,
                    history = historyForApi,
                    think = conv.think,
                    effort = conv.effort,
                    onText = { delta -> assistant.text += delta; bump() },
                    onThinking = { delta -> assistant.thinking += delta; bump() }
                )
                assistant.streaming = false
            } catch (ce: kotlinx.coroutines.CancellationException) {
                assistant.streaming = false
                if (assistant.text.isEmpty()) assistant.text = "⏹️ Stopped."
                throw ce
            } catch (e: Exception) {
                assistant.streaming = false
                assistant.error = true
                assistant.text = "⚠️ " + (e.message ?: "Request failed") +
                    "\n\nCheck the provider, model, key and base URL in Settings."
            } finally {
                conv.updatedAt = System.currentTimeMillis()
                _state.update { it.copy(sending = false, current = conv.copy()) }
                persistCurrent()
            }
        }
    }

    private fun bump() = _state.update { it.copy(current = it.current.copy()) }

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
