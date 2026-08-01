package app.netscope.agent.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Mirrors the dashboard's near-black surfaces and single cyan-teal accent. */
private val DarkScheme = darkColorScheme(
    primary = Color(0xFF2DD4BF),
    onPrimary = Color(0xFF042F2A),
    background = Color(0xFF0B0E11),
    onBackground = Color(0xFFE6EAEE),
    surface = Color(0xFF12161A),
    onSurface = Color(0xFFE6EAEE),
    surfaceVariant = Color(0xFF1A1F25),
    onSurfaceVariant = Color(0xFF9BA6B2),
    error = Color(0xFFF87171),
)

private val LightScheme = lightColorScheme(
    primary = Color(0xFF0D9488),
    onPrimary = Color(0xFFFFFFFF),
    background = Color(0xFFFAFAFA),
    onBackground = Color(0xFF11151A),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF11151A),
    surfaceVariant = Color(0xFFEFF2F5),
    onSurfaceVariant = Color(0xFF56616D),
    error = Color(0xFFDC2626),
)

@Composable
fun NetScopeAgentTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkScheme else LightScheme,
        content = content,
    )
}
