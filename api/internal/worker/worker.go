package worker

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riversqlite"
)

// Workers holds the River workers registry.
// Job workers are added in Plans 3–6 via river.AddWorker(Workers, &MyWorker{}).
var Workers = river.NewWorkers()

// NewClient creates a River client for SQLite (Phase 1).
// PostgreSQL support is added in a later plan via the riverpgxv5 driver.
func NewClient(_ context.Context, db *sql.DB, databaseURL string) (*river.Client[*sql.Tx], error) {
	if strings.HasPrefix(databaseURL, "postgres") {
		return nil, fmt.Errorf("postgres River client not yet implemented — use SQLite for Phase 1")
	}
	return newSQLiteClient(db)
}

func newSQLiteClient(db *sql.DB) (*river.Client[*sql.Tx], error) {
	client, err := river.NewClient(riversqlite.New(db), &river.Config{
		Workers: Workers,
	})
	if err != nil {
		return nil, fmt.Errorf("river sqlite client: %w", err)
	}
	return client, nil
}
