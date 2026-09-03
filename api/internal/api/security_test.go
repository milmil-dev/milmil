package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/milmil/api/internal/api"
)

// --- WebSocket handshake ---------------------------------------------------

func TestWebSocketRejectsMissingTicket(t *testing.T) {
	e := newTestApp(t)
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 for an unticketed upgrade, got %d", rec.Code)
	}
}

func TestWebSocketRejectsUnknownTicket(t *testing.T) {
	e := newTestApp(t)
	req := httptest.NewRequest(http.MethodGet, "/ws?ticket=deadbeef", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 for an unknown ticket, got %d", rec.Code)
	}
}

func TestWSTicketRequiresAuth(t *testing.T) {
	e := newTestApp(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws/ticket", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 without a token, got %d", rec.Code)
	}
}

func TestWSTicketIssuedToAuthenticatedCaller(t *testing.T) {
	e := newTestApp(t)
	token := getToken(t, e)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws/ticket", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if ticket, _ := resp["ticket"].(string); ticket == "" {
		t.Error("want a non-empty ticket in the response")
	}
}

// A ticket authorises exactly one upgrade, so replaying it must fail even
// though it was valid moments earlier.
func TestWSTicketCannotBeReplayed(t *testing.T) {
	e := newTestApp(t)
	token := getToken(t, e)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws/ticket", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	var resp map[string]any
	json.NewDecoder(rec.Body).Decode(&resp)
	ticket, _ := resp["ticket"].(string)
	if ticket == "" {
		t.Fatal("no ticket issued")
	}

	// The first redeem gets past the ticket check and on to the upgrade, which
	// fails for a non-WebSocket request — any status but 401 means the ticket
	// was accepted.
	first := httptest.NewRecorder()
	e.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/ws?ticket="+ticket, nil))
	if first.Code == http.StatusUnauthorized {
		t.Fatalf("first redeem should have been accepted, got 401")
	}

	second := httptest.NewRecorder()
	e.ServeHTTP(second, httptest.NewRequest(http.MethodGet, "/ws?ticket="+ticket, nil))
	if second.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 on replay, got %d", second.Code)
	}
}

// --- Origin guard ----------------------------------------------------------

func TestCheckWSOrigin(t *testing.T) {
	tests := []struct {
		name   string
		host   string
		origin string
		want   bool
	}{
		{"no origin (non-browser client)", "milmil.example:8080", "", true},
		{"same origin", "milmil.example:8080", "http://milmil.example:8080", true},
		{"same origin over https", "milmil.example", "https://milmil.example", true},
		// The deployment that matters most: reached over the LAN, not localhost.
		{"lan address same origin", "192.168.1.5:8080", "http://192.168.1.5:8080", true},
		{"vite dev server on another loopback port", "localhost:8080", "http://localhost:5173", true},
		{"loopback ip dev server", "localhost:8080", "http://127.0.0.1:5173", true},
		{"different site", "milmil.example", "https://evil.example", false},
		// A prefix test would wave this through; a hostname comparison must not.
		{"localhost prefix impersonation", "milmil.example", "http://localhost.evil.example", false},
		{"different port on another host", "milmil.example:8080", "http://attacker.example:8080", false},
		{"malformed origin", "milmil.example", "://not a url", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/ws", nil)
			req.Host = tt.host
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			if got := api.CheckWSOrigin(req); got != tt.want {
				t.Errorf("CheckWSOrigin(host=%q, origin=%q) = %v, want %v",
					tt.host, tt.origin, got, tt.want)
			}
		})
	}
}

// --- CORS preflight --------------------------------------------------------

// The SPA on :5173 is a different origin from the API on :8080, so every
// request that carries a non-simple header (Content-Type: application/json
// plus X-Milmil-Locale) is preceded by an OPTIONS preflight. The browser
// refuses the real request unless Access-Control-Allow-Headers names every
// requested header; a miss surfaces as TypeError "Failed to fetch".
func TestCORSPreflightAllowsLocaleHeader(t *testing.T) {
	e := newTestApp(t)
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/auth/login", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	req.Header.Set("Access-Control-Request-Headers", "content-type,x-milmil-locale")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent && rec.Code != http.StatusOK {
		t.Fatalf("want 204/200 from preflight, got %d: %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Errorf("Access-Control-Allow-Origin = %q, want the Vite origin", got)
	}
	allowed := strings.ToLower(rec.Header().Get("Access-Control-Allow-Headers"))
	if !strings.Contains(allowed, "x-milmil-locale") {
		t.Errorf("Access-Control-Allow-Headers = %q, want it to include X-Milmil-Locale", rec.Header().Get("Access-Control-Allow-Headers"))
	}
	if !strings.Contains(allowed, "content-type") {
		t.Errorf("Access-Control-Allow-Headers = %q, want it to include Content-Type", rec.Header().Get("Access-Control-Allow-Headers"))
	}
}

// --- Access-log redaction --------------------------------------------------

func TestRedactURI(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"no query", "/api/v1/libraries", "/api/v1/libraries"},
		{"harmless query", "/api/v1/search?q=frieren", "/api/v1/search?q=frieren"},
		{
			"stream token",
			"/api/v1/stream/abc?token=mlml_deadbeef",
			"/api/v1/stream/abc?token=%5BREDACTED%5D",
		},
		{
			"websocket ticket",
			"/ws?ticket=abc123",
			"/ws?ticket=%5BREDACTED%5D",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := api.RedactURI(tt.in); got != tt.want {
				t.Errorf("RedactURI(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

// --- Endpoint exposure -----------------------------------------------------

// Listing rclone remotes names the operator's cloud accounts; it used to be
// reachable without a token.
func TestRcloneRemotesRequiresAuth(t *testing.T) {
	e := newTestApp(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/rclone/remotes", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}

// --- Session revocation ----------------------------------------------------

func authedGet(t *testing.T, e http.Handler, path, token string) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec.Code
}

func TestLogoutRevokesTheTokenItUsed(t *testing.T) {
	e := newTestApp(t)
	token := getToken(t, e)

	if code := authedGet(t, e, "/api/v1/auth/me", token); code != http.StatusOK {
		t.Fatalf("token should start out valid, got %d", code)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("want 204 from logout, got %d: %s", rec.Code, rec.Body.String())
	}

	if code := authedGet(t, e, "/api/v1/auth/me", token); code != http.StatusUnauthorized {
		t.Fatalf("want 401 after logout, got %d", code)
	}
}

func TestChangePasswordRevokesOtherSessions(t *testing.T) {
	e := newTestApp(t)
	sessionA := getToken(t, e) // created by setup
	sessionB := getToken(t, e) // created by a second login
	if sessionA == "" || sessionB == "" || sessionA == sessionB {
		t.Fatalf("want two distinct sessions, got %q and %q", sessionA, sessionB)
	}

	body := `{"current_password":"Tr0ub4dor&3xplod3","new_password":"An0ther-Tr0ub4dor!"}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/auth/password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+sessionA)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("want 204 from change password, got %d: %s", rec.Code, rec.Body.String())
	}

	if code := authedGet(t, e, "/api/v1/auth/me", sessionB); code != http.StatusUnauthorized {
		t.Fatalf("the other session should have been revoked, got %d", code)
	}
	if code := authedGet(t, e, "/api/v1/auth/me", sessionA); code != http.StatusOK {
		t.Fatalf("the session that changed the password should survive, got %d", code)
	}
}

// --- Credential brute-force protection -------------------------------------

// The global limiter allows 100 req/s, which is no obstacle to sweeping a
// 6-digit TOTP code. The credential endpoints get their own, far tighter
// budget; this proves it is actually attached to the route.
//
// The username deliberately does not exist. A real one would send every
// attempt through bcrypt, and under -race that costs seconds per call — slow
// enough that the limiter refills faster than the loop can spend, so nothing
// is ever refused and the test fails for a reason that has nothing to do with
// rate limiting. Unknown users are rejected before the password check, so the
// requests are fast and the burst is genuinely exhausted.
func TestLoginIsRateLimited(t *testing.T) {
	e := newTestApp(t)

	const wrongCreds = `{"username":"nobody-here","password":"not-the-password"}`
	sawTooManyRequests := false
	for range 30 {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(wrongCreds))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		if rec.Code == http.StatusTooManyRequests {
			sawTooManyRequests = true
			break
		}
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("want 401 or 429, got %d: %s", rec.Code, rec.Body.String())
		}
	}
	if !sawTooManyRequests {
		t.Error("30 failed logins from one IP were all allowed through")
	}
}

func TestTwoFactorEndpointIsRateLimited(t *testing.T) {
	e := newTestApp(t)

	const body = `{"user_id":"00000000-0000-0000-0000-000000000000","code":"123456"}`
	sawTooManyRequests := false
	for range 30 {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login/2fa", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		if rec.Code == http.StatusTooManyRequests {
			sawTooManyRequests = true
			break
		}
	}
	if !sawTooManyRequests {
		t.Error("30 TOTP guesses from one IP were all allowed through")
	}
}
