package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/api"
	"github.com/milmil/api/internal/config"
	"github.com/stretchr/testify/require"
)

func TestHealthEndpoint(t *testing.T) {
	cfg := &config.Config{
		APIPort:     8080,
		JWTSecret:   "test",
		DatabaseURL: "sqlite://data/test.db",
	}
	e := api.NewRouter(cfg, nil, nil, nil, nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"status":"ok"`)
}
