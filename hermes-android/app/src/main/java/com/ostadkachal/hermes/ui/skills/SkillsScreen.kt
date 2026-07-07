package com.ostadkachal.hermes.ui.skills

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
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
import com.ostadkachal.hermes.data.Skill

@Composable
fun SkillsScreen() {
    val skills = HermesApp.instance.skills
    var query by remember { mutableStateOf("") }
    var tick by remember { mutableStateOf(0) }
    val filtered = remember(query, tick) {
        skills.filter {
            query.isBlank() || it.name.contains(query, true) ||
                it.category.contains(query, true) || it.description.contains(query, true)
        }
    }
    val installed = remember(tick) { skills.count { it.installed } }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(
            "${skills.size} skills across ${skills.map { it.category }.distinct().size} categories · $installed installed",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            placeholder = { Text("Search skills") },
            singleLine = true
        )
        LazyColumn(modifier = Modifier.padding(top = 12.dp)) {
            items(filtered, key = { it.name }) { skill -> SkillRow(skill) { tick++ } }
        }
    }
}

@Composable
private fun SkillRow(skill: Skill, onToggle: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(skill.name, style = MaterialTheme.typography.titleSmall)
                Text(
                    skill.category,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    skill.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Switch(
                checked = skill.installed,
                onCheckedChange = { skill.installed = it; onToggle() }
            )
        }
    }
}
