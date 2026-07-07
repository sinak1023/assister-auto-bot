package com.ostadkachal.hermes.ui.memory

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ostadkachal.hermes.HermesApp
import com.ostadkachal.hermes.data.MemoryEntry

@Composable
fun MemoryScreen() {
    val memory = HermesApp.instance.memory
    var draft by remember { mutableStateOf("") }
    var tick by remember { mutableStateOf(0) }
    val entries = remember(tick) { memory.toList() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(
            "Memory layers: Prompt · Session · Semantic · Procedural",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Remember something…") },
                singleLine = true
            )
            IconButton(
                onClick = {
                    if (draft.isNotBlank()) {
                        memory.add(0, MemoryEntry(layer = "Semantic", content = draft.trim()))
                        draft = ""; tick++
                    }
                }
            ) { Icon(Icons.Filled.Add, contentDescription = "Add", tint = MaterialTheme.colorScheme.primary) }
        }
        LazyColumn(modifier = Modifier.padding(top = 12.dp)) {
            items(entries, key = { it.id }) { e ->
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(e.layer, style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary)
                            Text(e.content, style = MaterialTheme.typography.bodyMedium)
                        }
                        IconButton(onClick = { memory.remove(e); tick++ }) {
                            Icon(Icons.Filled.Delete, contentDescription = "Delete",
                                tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }
}
