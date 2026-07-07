package com.ostadkachal.hermes.data

import android.content.Context

/** Thin SharedPreferences wrapper holding connection + agent configuration. */
class Settings(context: Context) {
    private val prefs = context.getSharedPreferences("hermes_settings", Context.MODE_PRIVATE)

    var providerLabel: String
        get() = prefs.getString("provider", ProviderPreset.NOUS.label) ?: ProviderPreset.NOUS.label
        set(v) = prefs.edit().putString("provider", v).apply()

    var baseUrl: String
        get() = prefs.getString("base_url", ProviderPreset.NOUS.baseUrl) ?: ""
        set(v) = prefs.edit().putString("base_url", v).apply()

    var apiKey: String
        get() = prefs.getString("api_key", "") ?: ""
        set(v) = prefs.edit().putString("api_key", v).apply()

    var model: String
        get() = prefs.getString("model", ProviderPreset.NOUS.defaultModel) ?: ""
        set(v) = prefs.edit().putString("model", v).apply()

    var persona: String
        get() = prefs.getString("persona", DEFAULT_PERSONA) ?: DEFAULT_PERSONA
        set(v) = prefs.edit().putString("persona", v).apply()

    var temperature: Float
        get() = prefs.getFloat("temperature", 0.7f)
        set(v) = prefs.edit().putFloat("temperature", v).apply()

    var streaming: Boolean
        get() = prefs.getBoolean("streaming", true)
        set(v) = prefs.edit().putBoolean("streaming", v).apply()

    var demoMode: Boolean
        get() = prefs.getBoolean("demo_mode", true)
        set(v) = prefs.edit().putBoolean("demo_mode", v).apply()

    var minContextGuard: Boolean
        get() = prefs.getBoolean("min_context_guard", true)
        set(v) = prefs.edit().putBoolean("min_context_guard", v).apply()

    var activeProfile: String
        get() = prefs.getString("profile", "default") ?: "default"
        set(v) = prefs.edit().putString("profile", v).apply()

    /** True when we have enough config to reach a real backend. */
    fun isConfigured(): Boolean =
        baseUrl.isNotBlank() && (apiKey.isNotBlank() || providerLabel == ProviderPreset.LOCAL.label
                || providerLabel == ProviderPreset.HERMES_BACKEND.label)

    companion object {
        const val DEFAULT_PERSONA =
            "You are Hermes, an autonomous, self-improving AI agent by Nous Research. " +
            "You are direct, capable and resourceful. You plan, use tools, remember what " +
            "you learn across sessions, and get more helpful the longer you run."
    }
}
