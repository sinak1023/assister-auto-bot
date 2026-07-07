package com.ostadkachal.hermes.ui.persona

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ostadkachal.hermes.HermesApp
import com.ostadkachal.hermes.data.Settings

@Composable
fun PersonaScreen() {
    val settings = HermesApp.instance.settings
    var text by remember { mutableStateOf(settings.persona) }
    var saved by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Persona / System prompt", style = MaterialTheme.typography.titleMedium)
        Text(
            "Defines how Hermes behaves. Applied to every conversation.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 12.dp)
        )
        OutlinedTextField(
            value = text,
            onValueChange = { text = it; saved = false },
            modifier = Modifier.fillMaxWidth().height(240.dp),
            placeholder = { Text("You are Hermes…") }
        )
        Column(modifier = Modifier.padding(top = 12.dp)) {
            Button(
                onClick = { settings.persona = text; saved = true },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Save persona") }
            OutlinedButton(
                onClick = { text = Settings.DEFAULT_PERSONA; saved = false },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
            ) { Text("Reset to default") }
        }
        if (saved) {
            Text("Saved ✓", color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 8.dp))
        }
    }
}
