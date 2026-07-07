package net.ostadkachal.hermes.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.ostadkachal.hermes.model.AppConfig
import net.ostadkachal.hermes.model.ProviderKind
import net.ostadkachal.hermes.model.ProviderProfile

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    state: UiState,
    onBack: () -> Unit,
    onSaveProfile: (ProviderProfile) -> Unit,
    onDeleteProfile: (String) -> Unit,
    onDetect: (String) -> Unit,
    onSaveSystemPrompt: (String) -> Unit
) {
    val config = state.config
    var systemPrompt by remember(config.systemPrompt) { mutableStateOf(config.systemPrompt) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") }
                }
            )
        }
    ) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(16.dp)
        ) {
            Text("Providers", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text(
                "Add one or more providers, each with its own API key. Tap Detect to auto-load its models.",
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp, bottom = 8.dp)
            )

            config.profiles.forEach { profile ->
                ProviderCard(
                    profile = profile,
                    detecting = state.detectingProfileId == profile.id,
                    onSave = onSaveProfile,
                    onDelete = { onDeleteProfile(profile.id) },
                    onDetect = { onDetect(profile.id) }
                )
            }

            OutlinedButton(
                onClick = {
                    onSaveProfile(
                        ProviderProfile(
                            name = "Custom", kind = ProviderKind.OPENAI,
                            baseUrl = "http://10.0.2.2:8000/v1", apiKey = ""
                        )
                    )
                },
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
            ) {
                Icon(Icons.Filled.Add, null); Spacer(Modifier.width(8.dp)); Text("Add provider")
            }

            Spacer(Modifier.height(20.dp))
            Text("System prompt", fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
                color = MaterialTheme.colorScheme.primary)
            OutlinedTextField(
                value = systemPrompt,
                onValueChange = { systemPrompt = it },
                modifier = Modifier.fillMaxWidth().height(140.dp).padding(top = 6.dp)
            )
            Button(
                onClick = { onSaveSystemPrompt(systemPrompt) },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
            ) { Text("Save system prompt") }

            Spacer(Modifier.height(20.dp))
            Text(
                "Keys are stored locally on this device only.",
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun ProviderCard(
    profile: ProviderProfile,
    detecting: Boolean,
    onSave: (ProviderProfile) -> Unit,
    onDelete: () -> Unit,
    onDetect: () -> Unit
) {
    var name by remember(profile.id) { mutableStateOf(profile.name) }
    var kind by remember(profile.id) { mutableStateOf(profile.kind) }
    var baseUrl by remember(profile.id) { mutableStateOf(profile.baseUrl) }
    var apiKey by remember(profile.id, profile.apiKey) { mutableStateOf(profile.apiKey) }
    var showKey by remember { mutableStateOf(false) }

    fun current() = profile.copy(name = name.trim(), kind = kind, baseUrl = baseUrl.trim(), apiKey = apiKey.trim())

    Card(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = name, onValueChange = { name = it },
                    label = { Text("Name") }, singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onDelete) { Icon(Icons.Filled.DeleteOutline, "Delete provider") }
            }

            Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ProviderKind.entries.forEach { k ->
                    FilterChip(
                        selected = kind == k,
                        onClick = { kind = k },
                        label = { Text(if (k == ProviderKind.ANTHROPIC) "Anthropic API" else "OpenAI-compatible", fontSize = 12.sp) }
                    )
                }
            }

            OutlinedTextField(
                value = baseUrl, onValueChange = { baseUrl = it },
                label = { Text("Base URL") }, singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp)
            )
            OutlinedTextField(
                value = apiKey, onValueChange = { apiKey = it },
                label = { Text("API key") }, singleLine = true,
                visualTransformation = if (showKey) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    IconButton(onClick = { showKey = !showKey }) {
                        Icon(if (showKey) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, "toggle")
                    }
                },
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp)
            )

            Text(
                if (profile.models.isEmpty()) "No models detected yet"
                else "${profile.models.size} models detected",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp)
            )

            Row(
                Modifier.fillMaxWidth().padding(top = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TextButton(onClick = { onSave(current()) }) { Text("Save") }
                Spacer(Modifier.weight(1f))
                Button(onClick = { onSave(current()); onDetect() }, enabled = !detecting) {
                    if (detecting) {
                        CircularProgressIndicator(
                            modifier = Modifier.height(16.dp).width(16.dp), strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary
                        )
                        Spacer(Modifier.width(8.dp)); Text("Detecting…")
                    } else {
                        Icon(Icons.Filled.Search, null, Modifier.height(18.dp).width(18.dp))
                        Spacer(Modifier.width(6.dp)); Text("Detect models")
                    }
                }
            }
        }
    }
}
