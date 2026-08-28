package dev.milmil.android

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.milmil.api.ApiClient
import dev.milmil.api.ApiError
import dev.milmil.api.PairLink
import dev.milmil.api.health
import dev.milmil.api.me
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

/** What the pairing screen can be showing. */
public sealed interface PairState {
    public data object Waiting : PairState
    public data class Connecting(val name: String) : PairState
    public data class Paired(
        val name: String,
        val username: String,
        val version: String,
        val url: String,
        val token: String,
        val avatarUrl: String? = null,
    ) : PairState
    public data class Failed(val message: String) : PairState
}

/**
 * Takes a scanned or deep-linked `milmil://pair` URL and proves it works:
 * `/health` for reachability, then `/api/v1/auth/me` to confirm the token is
 * live. A revoked token comes back 401, which is the one case that must land
 * on the login screen rather than an error.
 */
public class PairViewModel(private val store: SessionStore) : ViewModel() {
    private val _state = MutableStateFlow<PairState>(PairState.Waiting)
    public val state: StateFlow<PairState> = _state.asStateFlow()

    /**
     * A pairing already on this device — checked before showing the scanner,
     * and the retry after a failure. With nothing stored it falls back to the
     * scanner rather than leaving a dead button on the failure screen.
     */
    public fun restore() {
        val saved = store.load()
        if (saved == null) {
            _state.value = PairState.Waiting
            return
        }
        connect(saved, remember = false)
    }

    /**
     * Forget this device's pairing. The token still exists server-side — only
     * the Web tokens page can revoke it — so the wording has to say so rather
     * than imply this signed anything out.
     */
    public fun unpair() {
        store.clear()
        _state.value = PairState.Waiting
    }

    public fun pair(link: String) {
        val parsed = PairLink.parse(link)
        if (parsed == null) {
            _state.value = PairState.Failed("這個連結唔係配對碼")
            return
        }
        connect(parsed, remember = true)
    }

    private fun connect(parsed: PairLink, remember: Boolean) {
        _state.value = PairState.Connecting(parsed.name)
        viewModelScope.launch {
            // Closed by the caller once the session ends; Home reuses the token.
            val client = ApiClient(parsed.url) { parsed.token }
            try {
                // A server that is off, or on a network this phone is no longer
                // on, otherwise leaves the app on a spinner with no way out —
                // an emulator run sat there for a quarter of a minute.
                val (health, user) = withTimeout(CONNECT_TIMEOUT_MILLIS) {
                    client.health() to client.me()
                }
                if (remember) store.save(parsed)
                _state.value = PairState.Paired(
                    name = parsed.name,
                    username = user.username,
                    version = health.version,
                    url = parsed.url,
                    token = parsed.token,
                    avatarUrl = user.avatarUrl,
                )
            } catch (error: ApiError.Unauthorized) {
                // The token never expires, so 401 means it was revoked. Drop
                // the stored pairing or every later launch retries a dead one.
                store.clear()
                _state.value = PairState.Failed("配對碼已經失效，請喺 Web 版重新產生")
            } catch (error: ApiError) {
                _state.value = PairState.Failed(error.message ?: "連唔到伺服器")
            } catch (timeout: TimeoutCancellationException) {
                _state.value = PairState.Failed("連唔到 ${parsed.url}，請確認伺服器開咗機同埋喺同一個網絡。")
            }
        }
    }

    private companion object {
        const val CONNECT_TIMEOUT_MILLIS = 12_000L
    }
}
