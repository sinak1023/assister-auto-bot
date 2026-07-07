package com.ostadkachal.hermes.ui.nav

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.ui.graphics.vector.ImageVector

enum class Screen(val route: String, val title: String, val icon: ImageVector) {
    Chat("chat", "Chat", Icons.AutoMirrored.Filled.Chat),
    Sessions("sessions", "Sessions", Icons.Filled.History),
    Skills("skills", "Skills", Icons.Filled.Extension),
    Memory("memory", "Memory", Icons.Filled.Memory),
    Persona("persona", "Persona", Icons.Filled.Person),
    Scheduler("scheduler", "Scheduler", Icons.Filled.Schedule),
    Gateways("gateways", "Gateways", Icons.Filled.Forum),
    Settings("settings", "Settings", Icons.Filled.Settings);

    companion object {
        val drawerOrder = listOf(Chat, Sessions, Skills, Memory, Persona, Scheduler, Gateways, Settings)
        fun fromRoute(route: String?): Screen = entries.firstOrNull { it.route == route } ?: Chat
    }
}
