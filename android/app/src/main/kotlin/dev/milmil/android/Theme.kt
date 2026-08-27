package dev.milmil.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * The Material 3 scheme from the design canvas, derived from the brand accent
 * `#a78bfa` (`web/src/styles/theme.css` `--mm-accent`). M3 expresses elevation
 * as surface tone, so the container steps matter as much as the colours.
 */
private val MilmilDarkScheme = darkColorScheme(
    primary = Color(0xFFCBB8FD),
    onPrimary = Color(0xFF2C1A63),
    primaryContainer = Color(0xFF43307C),
    onPrimaryContainer = Color(0xFFE8DDFF),
    secondaryContainer = Color(0xFF453D58),
    onSecondaryContainer = Color(0xFFE5DFF4),
    background = Color(0xFF070707),
    onBackground = Color(0xFFEDEDED),
    surface = Color(0xFF070707),
    onSurface = Color(0xFFEDEDED),
    surfaceContainerLow = Color(0xFF101010),
    surfaceContainer = Color(0xFF151515),
    surfaceContainerHigh = Color(0xFF1D1D1D),
    surfaceContainerHighest = Color(0xFF262626),
    onSurfaceVariant = Color(0xFF9E9E9E),
    outlineVariant = Color(0xFF2A2A2A),
)

@Composable
public fun MilmilTheme(content: @Composable () -> Unit) {
    // Dark only for now — the web app's light theme lands with the ink token,
    // which the mobile client has not adopted yet.
    MaterialTheme(colorScheme = MilmilDarkScheme, content = content)
}
