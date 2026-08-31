package dev.milmil.android

import android.content.Context
import dev.milmil.api.DanmakuComment
import dev.milmil.api.DanmakuParser
import dev.milmil.api.DandanPlayResponse
import dev.milmil.api.MilmilJson
import java.io.File

/**
 * A Debug-only way to see danmaku without DandanPlay credentials — the Android
 * twin of the macOS client's `MILMIL_SNAPSHOT_DANMAKU`. A dev server with no
 * credentials answers "file not matched" for every file, so without this the
 * renderer cannot be verified on a running app at all.
 *
 *     adb push comments.json \
 *       /sdcard/Android/data/dev.milmil.android/files/danmaku-sample.json
 *
 * The file is a `GET /danmaku/{fileId}` response verbatim, so a real capture
 * from a credentialed server can be dropped in unchanged. Release builds never
 * look for it.
 */
public object DanmakuSample {
    private const val NAME = "danmaku-sample.json"

    public fun file(context: Context): File? =
        if (BuildConfig.DEBUG) File(context.getExternalFilesDir(null), NAME) else null

    public fun load(file: File?): List<DanmakuComment>? {
        if (file == null || !file.isFile) return null
        return runCatching {
            DanmakuParser.comments(
                MilmilJson.decodeFromString(DandanPlayResponse.serializer(), file.readText()),
            )
        }.getOrNull()
    }
}
