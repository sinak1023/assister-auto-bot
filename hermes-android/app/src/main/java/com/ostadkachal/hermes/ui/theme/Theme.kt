package com.ostadkachal.hermes.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Indigo = Color(0xFF7C9CFF)
private val IndigoDeep = Color(0xFF4A6BFF)
private val Navy = Color(0xFF0B0F1A)
private val NavySurface = Color(0xFF141A2A)
private val NavyCard = Color(0xFF1B2338)

private val DarkColors = darkColorScheme(
    primary = Indigo,
    onPrimary = Color(0xFF07132E),
    primaryContainer = IndigoDeep,
    onPrimaryContainer = Color.White,
    secondary = Color(0xFF9BE3C6),
    background = Navy,
    onBackground = Color(0xFFE6EAF5),
    surface = NavySurface,
    onSurface = Color(0xFFE6EAF5),
    surfaceVariant = NavyCard,
    onSurfaceVariant = Color(0xFFAAB4CF),
    outline = Color(0xFF33405C)
)

private val LightColors = lightColorScheme(
    primary = IndigoDeep,
    secondary = Color(0xFF1E8E63),
    background = Color(0xFFF6F8FF),
    surface = Color.White
)

@Composable
fun HermesTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = Typography(),
        content = content
    )
}
