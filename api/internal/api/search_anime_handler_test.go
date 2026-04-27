package api_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/store"
	"github.com/stretchr/testify/require"
)

func TestSearchAnime_LocalDBHit(t *testing.T) {
	srv := newAuditTestServer(t)

	_, err := srv.queries.CreateAnime(context.Background(), store.CreateAnimeParams{
		ID:           "anime-1",
		Title:        "Sousou no Frieren",
		TitleZh:      sql.NullString{String: "葬送的芙莉蓮", Valid: true},
		TitleEn:      sql.NullString{String: "Frieren: Beyond Journey's End", Valid: true},
		Status:       "ongoing",
		WatchStatus:  "watching",
		Genres:       "fantasy",
	})
	require.NoError(t, err)

	tok := srv.mintAPIToken(t, "search-agent")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/search/anime?q=Frieren", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, "body=%s", rec.Body.String())

	var resp struct {
		Items []struct {
			ID        string   `json:"id"`
			Title     string   `json:"title"`
			AltTitles []string `json:"alt_titles"`
			Score     float64  `json:"score"`
			Source    string   `json:"source"`
		} `json:"items"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.NotEmpty(t, resp.Items)
	require.Equal(t, "anime-1", resp.Items[0].ID)
	require.Equal(t, "local", resp.Items[0].Source)
	require.GreaterOrEqual(t, resp.Items[0].Score, 0.5)
	require.Contains(t, resp.Items[0].AltTitles, "葬送的芙莉蓮")
}

func TestSearchAnime_RequiresQuery(t *testing.T) {
	srv := newAuditTestServer(t)
	tok := srv.mintAPIToken(t, "search-agent")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/search/anime", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	srv.e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}
