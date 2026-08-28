package dev.milmil.android.player

import android.app.Activity
import android.content.pm.ActivityInfo
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Turns the screen over to the video for as long as this is composed:
 * landscape, and no status or navigation bar.
 *
 * Applied only in full-screen mode. Portrait playback is the default — you
 * watch with the episode list under the picture, the way every phone video app
 * behaves — and this is what the full-screen button turns on. Both settings are
 * undone on the way out, so the rest of the app stays portrait.
 */
@Composable
public fun ImmersiveLandscape() {
    val context = LocalContext.current
    DisposableEffect(Unit) {
        val activity = context as? Activity ?: return@DisposableEffect onDispose { }
        val previousOrientation = activity.requestedOrientation
        val controller = WindowInsetsControllerCompat(activity.window, activity.window.decorView)

        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
        // A swipe brings the bars back for a moment rather than for good, which
        // is what a video app wants and what the system default does not do.
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

        onDispose {
            activity.requestedOrientation = previousOrientation
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }
}
