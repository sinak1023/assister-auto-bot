package com.ostadkachal.hermes.ui.gateways

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
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

@Composable
fun GatewaysScreen() {
    val gateways = HermesApp.instance.gateways
    var tick by remember { mutableStateOf(0) }
    val list = remember(tick) { gateways.toList() }
    val connected = remember(tick) { gateways.count { it.connected } }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(
            "${gateways.size} messaging gateways · $connected connected",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            "Route agent messages in and out over these channels.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        LazyColumn {
            items(list, key = { it.name }) { g ->
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(g.name, style = MaterialTheme.typography.titleSmall)
                            Text(if (g.connected) "Connected" else "Not connected",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (g.connected) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(checked = g.connected, onCheckedChange = { g.connected = it; tick++ })
                    }
                }
            }
        }
    }
}
