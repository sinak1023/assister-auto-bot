package com.ostadkachal.hermes.ui.scheduler

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import com.ostadkachal.hermes.data.ScheduledTask

@Composable
fun SchedulerScreen() {
    val tasks = HermesApp.instance.tasks
    var name by remember { mutableStateOf("") }
    var cron by remember { mutableStateOf("0 9 * * *") }
    var prompt by remember { mutableStateOf("") }
    var delivery by remember { mutableStateOf("Telegram") }
    var tick by remember { mutableStateOf(0) }
    val list = remember(tick) { tasks.toList() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Cron scheduler", style = MaterialTheme.typography.titleMedium)
        Text(
            "Recurring tasks with a delivery target (parity with Hermes cron jobs).",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        OutlinedTextField(name, { name = it }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            label = { Text("Task name") }, singleLine = true)
        OutlinedTextField(cron, { cron = it }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            label = { Text("Cron (min hour dom mon dow)") }, singleLine = true)
        OutlinedTextField(prompt, { prompt = it }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            label = { Text("Prompt") })
        OutlinedTextField(delivery, { delivery = it }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            label = { Text("Delivery (Telegram, Email, …)") }, singleLine = true)
        Button(
            onClick = {
                if (name.isNotBlank()) {
                    tasks.add(0, ScheduledTask(name = name.trim(), cron = cron.trim(),
                        prompt = prompt.trim(), delivery = delivery.trim()))
                    name = ""; prompt = ""; tick++
                }
            },
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
        ) { Text("Add task") }

        LazyColumn(modifier = Modifier.padding(top = 12.dp)) {
            items(list, key = { it.id }) { t ->
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(t.name, style = MaterialTheme.typography.titleSmall)
                            Text("${t.cron} → ${t.delivery}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary)
                            if (t.prompt.isNotBlank()) {
                                Text(t.prompt, style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Switch(checked = t.enabled, onCheckedChange = { t.enabled = it; tick++ })
                        IconButton(onClick = { tasks.remove(t); tick++ }) {
                            Icon(Icons.Filled.Delete, contentDescription = "Delete",
                                tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }
}
