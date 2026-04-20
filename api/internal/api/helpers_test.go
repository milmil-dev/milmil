package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

// getToken returns a JWT by calling setup (first time) or login (if already initialized).
func getToken(t *testing.T, e *echo.Echo) string {
	t.Helper()
	const creds = `{"username":"testuser","password":"Tr0ub4dor&3xplod3"}`

	// Try setup first
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", strings.NewReader(creds))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	// If already initialized (403), fall back to login
	if rec.Code == http.StatusForbidden {
		req2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(creds))
		req2.Header.Set("Content-Type", "application/json")
		rec2 := httptest.NewRecorder()
		e.ServeHTTP(rec2, req2)
		var resp map[string]any
		json.NewDecoder(rec2.Body).Decode(&resp)
		token, _ := resp["token"].(string)
		return token
	}

	var resp map[string]any
	json.NewDecoder(rec.Body).Decode(&resp)
	token, _ := resp["token"].(string)
	return token
}

// makeAuthRequest creates a JWT-authenticated request.
func makeAuthRequest(t *testing.T, e *echo.Echo, method, path, body string) *http.Request {
	t.Helper()
	token := getToken(t, e)

	var bodyReader *strings.Reader
	if body != "" {
		bodyReader = strings.NewReader(body)
	} else {
		bodyReader = strings.NewReader("")
	}
	req := httptest.NewRequest(method, path, bodyReader)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req
}
