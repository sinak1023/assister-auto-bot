package net.ostadkachal.hermes.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val HermesBlue = Color(0xFF5B8DEF)
val HermesViolet = Color(0xFF7C5CFF)
val HermesBg = Color(0xFF0B0F14)
val HermesSurface = Color(0xFF141B24)
val HermesSurfaceHi = Color(0xFF1D2733)

private val DarkColors = darkColorScheme(
    primary = HermesBlue,
    onPrimary = Color.White,
    secondary = HermesViolet,
    onSecondary = Color.White,
    background = HermesBg,
    onBackground = Color(0xFFE6ECF3),
    surface = HermesSurface,
    onSurface = Color(0xFFE6ECF3),
    surfaceVariant = HermesSurfaceHi,
    onSurfaceVariant = Color(0xFFA9B6C6),
    outline = Color(0xFF2C3846)
)

private val LightColors = lightColorScheme(
    primary = HermesBlue,
    onPrimary = Color.White,
    secondary = HermesViolet,
    background = Color(0xFFF6F8FB),
    surface = Color.White,
    onSurface = Color(0xFF10151C)
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
