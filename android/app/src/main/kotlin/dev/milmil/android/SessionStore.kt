package dev.milmil.android

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dev.milmil.api.PairLink

/**
 * Where a paired server lives between launches. The macOS client keeps its
 * `mlml_` token in the Keychain; this is the Android equivalent — an
 * AES256-GCM `EncryptedSharedPreferences` behind a Keystore-held master key.
 *
 * Without this the app forgets the pairing the moment the process dies, which
 * an emulator run made obvious: relaunching landed back on the pairing screen
 * with a perfectly good token already issued.
 */
public class SessionStore(context: Context) {
    private val prefs: SharedPreferences = run {
        val key = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "milmil.session",
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    public fun save(link: PairLink) {
        prefs.edit()
            .putString(KEY_URL, link.url)
            .putString(KEY_TOKEN, link.token)
            .putString(KEY_NAME, link.name)
            .apply()
    }

    public fun load(): PairLink? {
        val url = prefs.getString(KEY_URL, null) ?: return null
        val token = prefs.getString(KEY_TOKEN, null) ?: return null
        return PairLink(prefs.getString(KEY_NAME, null).orEmpty().ifBlank { url }, url, token)
    }

    /** Called when the server says 401: the token was revoked, so drop it. */
    public fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_URL = "server_url"
        const val KEY_TOKEN = "token"
        const val KEY_NAME = "server_name"
    }
}
