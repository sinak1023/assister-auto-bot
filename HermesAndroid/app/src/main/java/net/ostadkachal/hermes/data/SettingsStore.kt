package net.ostadkachal.hermes.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import net.ostadkachal.hermes.model.ProviderType
import net.ostadkachal.hermes.model.Settings

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "hermes_settings")

class SettingsStore(private val context: Context) {

    private object Keys {
        val PROVIDER = stringPreferencesKey("provider")
        val BASE_URL = stringPreferencesKey("base_url")
        val API_KEY = stringPreferencesKey("api_key")
        val MODEL = stringPreferencesKey("model")
        val SYSTEM_PROMPT = stringPreferencesKey("system_prompt")
        val TEMPERATURE = floatPreferencesKey("temperature")
        val SKILLS = stringSetPreferencesKey("skills")
    }

    val settings: Flow<Settings> = context.dataStore.data.map { p ->
        val provider = runCatching { ProviderType.valueOf(p[Keys.PROVIDER] ?: "") }
            .getOrDefault(ProviderType.ANTHROPIC)
        Settings(
            provider = provider,
            baseUrl = p[Keys.BASE_URL] ?: provider.defaultBaseUrl,
            apiKey = p[Keys.API_KEY] ?: "",
            model = p[Keys.MODEL] ?: provider.defaultModel,
            systemPrompt = p[Keys.SYSTEM_PROMPT] ?: Settings.DEFAULT_SYSTEM_PROMPT,
            temperature = p[Keys.TEMPERATURE] ?: 0.7f,
            enabledSkills = p[Keys.SKILLS] ?: Settings.DEFAULT_ENABLED_SKILLS
        )
    }

    suspend fun update(s: Settings) {
        context.dataStore.edit { p ->
            p[Keys.PROVIDER] = s.provider.name
            p[Keys.BASE_URL] = s.baseUrl
            p[Keys.API_KEY] = s.apiKey
            p[Keys.MODEL] = s.model
            p[Keys.SYSTEM_PROMPT] = s.systemPrompt
            p[Keys.TEMPERATURE] = s.temperature
            p[Keys.SKILLS] = s.enabledSkills
        }
    }
}
