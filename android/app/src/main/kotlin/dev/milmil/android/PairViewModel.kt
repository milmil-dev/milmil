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
import kotlinx.coroutines.launch

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

    /** A pairing already on this device — checked before showing the scanner. */
    public fun restore() {
        val saved = store.load() ?: return
        connect(saved, remember = false)
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
                val health = client.health()
                val user = client.me()
                if (remember) store.save(parsed)
                _state.value = PairState.Paired(parsed.name, user.username, health.version, parsed.url, parsed.token)
            } catch (error: ApiError.Unauthorized) {
                // The token never expires, so 401 means it was revoked. Drop
                // the stored pairing or every later launch retries a dead one.
                store.clear()
                _state.value = PairState.Failed("配對碼已經失效，請喺 Web 版重新產生")
            } catch (error: ApiError) {
                _state.value = PairState.Failed(error.message ?: "連唔到伺服器")
            }
        }
    }
}
