package store_test

import (
	"context"
	"database/sql"
	"testing"

	milmildb "github.com/milmil/api/internal/db"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/migrations"
	"github.com/stretchr/testify/require"
)

func TestAuditLogCRUD(t *testing.T) {
	// Same driver and migration runner as production: this used to open the
	// cgo mattn/go-sqlite3 driver and replay the .up.sql files by hand, so the
	// tests exercised a different SQLite than the server ever runs.
	dsn := "sqlite://" + t.TempDir() + "/audit.db"
	db, err := milmildb.Open(dsn)
	require.NoError(t, err)
	defer db.Close()

	require.NoError(t, milmildb.MigrateUp(migrations.FS, dsn))

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
