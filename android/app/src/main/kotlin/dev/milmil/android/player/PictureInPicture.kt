package dev.milmil.android.player

import android.app.Activity
import android.app.PictureInPictureParams
import android.os.Build
import android.util.Rational
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext

/**
 * Keeps the picture when the user leaves the app mid-episode.
 *
 * A phone player that stops the moment you check a message is the one place a
 * desktop player has nothing to teach it — the web and macOS clients have no
 * equivalent, so this is the parity table's one "phone only" row.
 */
@Composable
public fun PictureInPictureOnLeave(playing: Boolean) {
    val context = LocalContext.current
    DisposableEffect(playing) {
        val activity = context as? Activity ?: return@DisposableEffect onDispose { }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@DisposableEffect onDispose { }
        // Android S+ can be told to enter automatically; before that the app
        // had to call enterPictureInPictureMode from onUserLeaveHint, which
        // never fires for a gesture-navigation swipe.
        activity.setPictureInPictureParams(
            PictureInPictureParams.Builder()
                .setAspectRatio(Rational(16, 9))
                .setAutoEnterEnabled(playing)
                .build(),
        )
        onDispose {
            activity.setPictureInPictureParams(
                PictureInPictureParams.Builder().setAutoEnterEnabled(false).build(),
            )
        }
    }
}
