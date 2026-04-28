package store_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"sort"
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"github.com/milmil/api/internal/store"
	"github.com/stretchr/testify/require"
)

// applyAllMigrations reads every *.up.sql file from api/migrations/ and runs
// them in name-sorted order against the given DB. Used to bring an in-memory
// SQLite to current schema for unit tests.
func applyAllMigrations(t *testing.T, db *sql.DB) {
	t.Helper()
	migDir := "../../migrations"
	entries, err := os.ReadDir(migDir)
	require.NoError(t, err)

	var ups []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if filepath.Ext(name) == ".sql" && len(name) > 7 && name[len(name)-7:] == ".up.sql" {
			ups = append(ups, name)
		}
	}
	sort.Strings(ups)

	for _, name := range ups {
		path := filepath.Join(migDir, name)
		body, err := os.ReadFile(path)
		require.NoError(t, err, "read %s", name)
		_, err = db.Exec(string(body))
		require.NoError(t, err, "exec %s", name)
	}
}

func TestAuditLogCRUD(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:?_foreign_keys=on")
	require.NoError(t, err)
	defer db.Close()

	applyAllMigrations(t, db)

	q := store.New(db)

	// Seed a user (foreign key target).
	_, err = db.Exec(`INSERT INTO users (id, username, password_hash, created_at, updated_at)
		VALUES ('user-1', 'tester', 'unused', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`)
	require.NoError(t, err)

	created, err := q.CreateAuditLog(context.Background(), store.CreateAuditLogParams{
		ID:         "abcd1234",
		UserID:     "user-1",
		TokenID:    sql.NullString{String: "tok-1", Valid: true},
		AgentLabel: sql.NullString{String: "claude-code-laptop", Valid: true},
		ActionType: "match.apply",
		TargetType: sql.NullString{String: "file", Valid: true},
		TargetID:   sql.NullString{String: "file-1", Valid: true},
		BeforeJson: sql.NullString{String: `{"anime_id":null}`, Valid: true},
		AfterJson:  sql.NullString{String: `{"anime_id":"abc"}`, Valid: true},
		Confidence: sql.NullFloat64{Float64: 0.92, Valid: true},
		ParentID:   sql.NullString{},
		DryRun:     0,
	})
	require.NoError(t, err)
	require.Equal(t, "abcd1234", created.ID)

	got, err := q.GetAuditLog(context.Background(), "abcd1234")
	require.NoError(t, err)
	require.Equal(t, "match.apply", got.ActionType)
	require.Equal(t, 0.92, got.Confidence.Float64)

	// MarkAuditUndone
	require.NoError(t, q.MarkAuditUndone(context.Background(), store.MarkAuditUndoneParams{
		ID:       "abcd1234",
		UndoneBy: sql.NullString{String: "ef567890", Valid: true},
	}))
	again, err := q.GetAuditLog(context.Background(), "abcd1234")
	require.NoError(t, err)
	require.True(t, again.UndoneAt.Valid)
	require.Equal(t, "ef567890", again.UndoneBy.String)
}
