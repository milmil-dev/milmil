package db

import (
	"errors"
	"fmt"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // postgres
	_ "github.com/golang-migrate/migrate/v4/database/sqlite"  // sqlite (modernc, no CGO)
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

// MigrateUp runs all pending up migrations from the migrations directory.
// The working directory must be api/ so that "file://migrations" resolves correctly.
func MigrateUp(dsn string) error {
	migrateURL := toMigrateURL(dsn)

	m, err := migrate.New("file://migrations", migrateURL)
	if err != nil {
		return fmt.Errorf("migrate.New: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrate up: %w", err)
	}
	return nil
}

// toMigrateURL converts milmil DSN format to golang-migrate database URL format.
func toMigrateURL(dsn string) string {
	if strings.HasPrefix(dsn, "sqlite://") {
		// golang-migrate sqlite driver expects: sqlite://path/to/file.db
		return dsn
	}
	// postgres DSN is passed through unchanged
	return dsn
}
