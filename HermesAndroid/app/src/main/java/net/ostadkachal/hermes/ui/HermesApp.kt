package net.ostadkachal.hermes.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Settings
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch

enum class Screen { CHAT, HISTORY, SKILLS, SETTINGS }

@Composable
fun HermesApp() {
    val vm: HermesViewModel = viewModel()
    val state by vm.state.collectAsState()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var screen by remember { mutableStateOf(Screen.CHAT) }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                Column(Modifier.padding(16.dp)) {
                    Text("Hermes", fontSize = 26.sp, fontWeight = FontWeight.Bold)
                    Text(
                        "The agent that grows with you",
                        color = MaterialTheme.colorScheme.primary,
                        fontSize = 12.sp
                    )
                }
                Spacer(Modifier.height(8.dp))
                DrawerRow("Chat", Icons.AutoMirrored.Filled.Chat, screen == Screen.CHAT) {
                    screen = Screen.CHAT; scope.launch { drawerState.close() }
                }
                DrawerRow("Memory", Icons.Filled.History, screen == Screen.HISTORY) {
                    screen = Screen.HISTORY; scope.launch { drawerState.close() }
                }
                DrawerRow("Skills", Icons.Filled.AutoAwesome, screen == Screen.SKILLS) {
                    screen = Screen.SKILLS; scope.launch { drawerState.close() }
                }
                DrawerRow("Settings", Icons.Filled.Settings, screen == Screen.SETTINGS) {
                    screen = Screen.SETTINGS; scope.launch { drawerState.close() }
                }
                Spacer(Modifier.height(16.dp))
                Text(
                    "developed by ostad kachal",
                    modifier = Modifier.padding(16.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
            }
        }
    ) {
        val openDrawer: () -> Unit = { scope.launch { drawerState.open() } }
        when (screen) {
            Screen.CHAT -> ChatScreen(
                state = state,
                onMenu = openDrawer,
                onSend = vm::send,
                onStop = vm::stopStreaming,
                onNewChat = vm::newChat,
                onOpenSettings = { screen = Screen.SETTINGS }
            )
            Screen.HISTORY -> HistoryScreen(
                state = state,
                onBack = { screen = Screen.CHAT },
                onOpen = { id -> vm.openConversation(id); screen = Screen.CHAT },
                onNew = { vm.newChat(); screen = Screen.CHAT },
                onDelete = vm::deleteConversation
            )
            Screen.SKILLS -> SkillsScreen(
                settings = state.settings,
                onBack = { screen = Screen.CHAT },
                onToggle = { id, on ->
                    val cur = state.settings.enabledSkills.toMutableSet()
                    if (on) cur.add(id) else cur.remove(id)
                    vm.updateSettings(state.settings.copy(enabledSkills = cur))
                }
            )
            Screen.SETTINGS -> SettingsScreen(
                settings = state.settings,
                onBack = { screen = Screen.CHAT },
                onSave = vm::updateSettings
            )
        }
    }
}

@Composable
private fun DrawerRow(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    selected: Boolean,
    onClick: () -> Unit
) {
    NavigationDrawerItem(
        label = { Text(label) },
        selected = selected,
        onClick = onClick,
        icon = { Icon(icon, contentDescription = label) },
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 2.dp)
    )
}
