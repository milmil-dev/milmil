package httpclient

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestClient_DoJSON_AttachesBearer(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		require.Equal(t, "milmil-cli/0.1.0", r.Header.Get("User-Agent"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	c := New(srv.URL, "mlml_secret")
	var resp struct {
		OK bool `json:"ok"`
	}
	require.NoError(t, c.DoJSON("GET", "/test", nil, nil, &resp))
	require.True(t, resp.OK)
	require.Equal(t, "Bearer mlml_secret", gotAuth)
}

func TestClient_DoJSON_PostsJSONBody(t *testing.T) {
	var gotContentType string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotContentType = r.Header.Get("Content-Type")
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	c := New(srv.URL, "mlml_x")
	require.NoError(t, c.DoJSON("POST", "/things", map[string]any{"name": "alpha"}, nil, nil))
	require.Equal(t, "application/json", gotContentType)
	require.Equal(t, "alpha", gotBody["name"])
}

func TestClient_DoJSON_ReturnsHTTPErrorOn401(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"invalid token"}`))
	}))
	defer srv.Close()

	c := New(srv.URL, "mlml_bad")
	err := c.DoJSON("GET", "/api/v1/auth/me", nil, nil, nil)
	require.Error(t, err)

	var httpErr *HTTPError
	require.True(t, errors.As(err, &httpErr))
	require.Equal(t, http.StatusUnauthorized, httpErr.Status)
	require.True(t, IsUnauthorized(err))
}

func TestClient_DoJSON_AppendsQueryString(t *testing.T) {
	var gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	c := New(srv.URL, "mlml_x")
	q := url.Values{"action": {"match.apply"}, "limit": {"50"}}
	require.NoError(t, c.DoJSON("GET", "/audit", nil, q, &map[string]any{}))
	require.Contains(t, gotQuery, "action=match.apply")
	require.Contains(t, gotQuery, "limit=50")
}
