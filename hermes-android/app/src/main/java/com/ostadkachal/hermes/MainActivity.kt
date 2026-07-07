package com.ostadkachal.hermes

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.ostadkachal.hermes.ui.SplashScreen
import com.ostadkachal.hermes.ui.chat.ChatScreen
import com.ostadkachal.hermes.ui.gateways.GatewaysScreen
import com.ostadkachal.hermes.ui.memory.MemoryScreen
import com.ostadkachal.hermes.ui.nav.Screen
import com.ostadkachal.hermes.ui.persona.PersonaScreen
import com.ostadkachal.hermes.ui.scheduler.SchedulerScreen
import com.ostadkachal.hermes.ui.sessions.SessionsScreen
import com.ostadkachal.hermes.ui.settings.SettingsScreen
import com.ostadkachal.hermes.ui.skills.SkillsScreen
import com.ostadkachal.hermes.ui.theme.HermesTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HermesTheme {
                var showSplash by remember { mutableStateOf(true) }
                if (showSplash) {
                    SplashScreen(onDone = { showSplash = false })
                } else {
                    AppScaffold()
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppScaffold() {
    val navController = rememberNavController()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val backStack by navController.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route?.substringBefore("?")
    val current = Screen.fromRoute(currentRoute)

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                Text(
                    "Hermes Agent",
                    style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(20.dp)
                )
                Screen.drawerOrder.forEach { screen ->
                    NavigationDrawerItem(
                        icon = { Icon(screen.icon, contentDescription = null) },
                        label = { Text(screen.title) },
                        selected = screen == current,
                        onClick = {
                            scope.launch { drawerState.close() }
                            navController.navigate(screen.route) {
                                popUpTo(navController.graph.startDestinationId) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        modifier = Modifier.padding(horizontal = 12.dp)
                    )
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "developed by ostad kachal",
                    style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                    color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(20.dp)
                )
            }
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(current.title) },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Filled.Menu, contentDescription = "Menu")
                        }
                    },
                    actions = {
                        if (current == Screen.Chat) {
                            IconButton(onClick = {
                                navController.navigate(Screen.Chat.route) {
                                    popUpTo(navController.graph.startDestinationId)
                                    launchSingleTop = true
                                }
                            }) {
                                Icon(Icons.Filled.Add, contentDescription = "New session")
                            }
                        }
                    }
                )
            }
        ) { padding ->
            NavHost(
                navController = navController,
                startDestination = Screen.Chat.route,
                modifier = Modifier.fillMaxSize().padding(padding)
            ) {
                composable(
                    route = "${Screen.Chat.route}?sessionId={sessionId}",
                    arguments = listOf(navArgument("sessionId") {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    })
                ) { entry ->
                    ChatScreen(sessionId = entry.arguments?.getString("sessionId"))
                }
                composable(Screen.Sessions.route) {
                    SessionsScreen(onOpen = { id ->
                        navController.navigate("${Screen.Chat.route}?sessionId=$id")
                    })
                }
                composable(Screen.Skills.route) { SkillsScreen() }
                composable(Screen.Memory.route) { MemoryScreen() }
                composable(Screen.Persona.route) { PersonaScreen() }
                composable(Screen.Scheduler.route) { SchedulerScreen() }
                composable(Screen.Gateways.route) { GatewaysScreen() }
                composable(Screen.Settings.route) { SettingsScreen() }
            }
        }
    }
}
