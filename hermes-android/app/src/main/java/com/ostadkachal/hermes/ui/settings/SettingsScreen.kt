package com.ostadkachal.hermes.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.ostadkachal.hermes.HermesApp
import com.ostadkachal.hermes.data.ProviderPreset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen() {
    val settings = HermesApp.instance.settings
    var provider by remember { mutableStateOf(settings.providerLabel) }
    var baseUrl by remember { mutableStateOf(settings.baseUrl) }
    var apiKey by remember { mutableStateOf(settings.apiKey) }
    var model by remember { mutableStateOf(settings.model) }
    var temperature by remember { mutableFloatStateOf(settings.temperature) }
    var streaming by remember { mutableStateOf(settings.streaming) }
    var demoMode by remember { mutableStateOf(settings.demoMode) }
    var guard by remember { mutableStateOf(settings.minContextGuard) }
    var profile by remember { mutableStateOf(settings.activeProfile) }
    var expanded by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)
    ) {
        Text("Connection", style = MaterialTheme.typography.titleMedium)

        Box(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            OutlinedTextField(
                value = provider,
                onValueChange = {},
                readOnly = true,
                label = { Text("Provider") },
                trailingIcon = { Icon(Icons.Filled.ArrowDropDown, contentDescription = null) },
                modifier = Modifier.fillMaxWidth()
            )
            // Transparent overlay: a read-only text field swallows clicks, so this
            // catches the tap and opens the menu.
            Box(modifier = Modifier.matchParentSize().clickable { expanded = true })
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                ProviderPreset.entries.forEach { preset ->
                    DropdownMenuItem(
                        text = { Text(preset.label) },
                        onClick = {
                            provider = preset.label
                            if (preset != ProviderPreset.CUSTOM) {
                                baseUrl = preset.baseUrl
                                model = preset.defaultModel
                            }
                            expanded = false
                        }
                    )
                }
            }
        }

        OutlinedTextField(baseUrl, { baseUrl = it }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            label = { Text("Base URL (OpenAI-compatible /v1)") }, singleLine = true)
        OutlinedTextField(apiKey, { apiKey = it }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            label = { Text("API key") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation())
        OutlinedTextField(model, { model = it }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            label = { Text("Model") }, singleLine = true)
        OutlinedTextField(profile, { profile = it }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            label = { Text("Active profile") }, singleLine = true)

        Text("Generation", style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 16.dp))
        Text("Temperature: ${"%.2f".format(temperature)}",
            style = MaterialTheme.typography.bodySmall)
        Slider(value = temperature, onValueChange = { temperature = it }, valueRange = 0f..1.5f)

        ToggleRow("Stream responses (SSE)", streaming) { streaming = it }
        ToggleRow("Demo mode (offline canned replies)", demoMode) { demoMode = it }
        ToggleRow("Reject models under 64k context", guard) { guard = it }

        Button(
            onClick = {
                settings.providerLabel = provider
                settings.baseUrl = baseUrl.trim()
                settings.apiKey = apiKey.trim()
                settings.model = model.trim()
                settings.temperature = temperature
                settings.streaming = streaming
                settings.demoMode = demoMode
                settings.minContextGuard = guard
                settings.activeProfile = profile.trim().ifBlank { "default" }
                saved = true
            },
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp)
        ) { Text("Save settings") }

        if (saved) {
            Text("Saved ✓", color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 8.dp))
        }

        Text(
            "Your API key is stored only in this app's private storage on-device.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 16.dp)
        )
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
