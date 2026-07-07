package net.ostadkachal.hermes.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import net.ostadkachal.hermes.model.AppConfig
import net.ostadkachal.hermes.model.ModelRef
import net.ostadkachal.hermes.model.ProviderKind
import net.ostadkachal.hermes.model.ProviderProfile
import org.json.JSONArray
import org.json.JSONObject

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "hermes_config")

/** Persists the whole AppConfig as a single JSON blob. */
class ConfigStore(private val context: Context) {

    private val KEY = stringPreferencesKey("config_json")

    val config: Flow<AppConfig> = context.dataStore.data.map { p ->
        val raw = p[KEY]
        if (raw.isNullOrBlank()) defaultConfig() else runCatching { decode(raw) }.getOrElse { defaultConfig() }
    }

    suspend fun save(config: AppConfig) {
        context.dataStore.edit { it[KEY] = encode(config) }
    }

    private fun defaultConfig(): AppConfig = AppConfig(
        profiles = listOf(
            ProviderProfile.anthropic(),
            ProviderProfile.openai(),
            ProviderProfile.nous()
        )
    )

    private fun encode(c: AppConfig): String {
        val o = JSONObject()
        val profs = JSONArray()
        c.profiles.forEach { p ->
            val po = JSONObject()
            po.put("id", p.id)
            po.put("name", p.name)
            po.put("kind", p.kind.name)
            po.put("baseUrl", p.baseUrl)
            po.put("apiKey", p.apiKey)
            po.put("models", JSONArray(p.models))
            profs.put(po)
        }
        o.put("profiles", profs)
        o.put("selectedModel", c.selectedModel?.encode() ?: JSONObject.NULL)
        o.put("systemPrompt", c.systemPrompt)
        o.put("skills", JSONArray(c.enabledSkills.toList()))
        return o.toString()
    }

    private fun decode(raw: String): AppConfig {
        val o = JSONObject(raw)
        val profs = o.optJSONArray("profiles") ?: JSONArray()
        val list = ArrayList<ProviderProfile>(profs.length())
        for (i in 0 until profs.length()) {
            val po = profs.getJSONObject(i)
            val modelsArr = po.optJSONArray("models") ?: JSONArray()
            val models = ArrayList<String>(modelsArr.length())
            for (j in 0 until modelsArr.length()) models.add(modelsArr.getString(j))
            list.add(
                ProviderProfile(
                    id = po.optString("id"),
                    name = po.optString("name"),
                    kind = runCatching { ProviderKind.valueOf(po.optString("kind")) }
                        .getOrDefault(ProviderKind.OPENAI),
                    baseUrl = po.optString("baseUrl"),
                    apiKey = po.optString("apiKey"),
                    models = models
                )
            )
        }
        val skillsArr = o.optJSONArray("skills") ?: JSONArray()
        val skills = HashSet<String>()
        for (i in 0 until skillsArr.length()) skills.add(skillsArr.getString(i))
        return AppConfig(
            profiles = list,
            selectedModel = ModelRef.decode(o.optString("selectedModel", null)),
            systemPrompt = o.optString("systemPrompt", AppConfig.DEFAULT_SYSTEM_PROMPT),
            enabledSkills = if (skills.isEmpty()) AppConfig.DEFAULT_ENABLED_SKILLS else skills
        )
    }
}
