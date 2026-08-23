package db

import (
	"errors"
	"fmt"
	"io/fs"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // postgres driver
	_ "github.com/golang-migrate/migrate/v4/database/sqlite" // sqlite driver (modernc, no CGO)
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

// MigrateUp runs all pending up migrations from the provided embedded FS.
func MigrateUp(migrationsFS fs.FS, dsn string) error {
	src, err := iofs.New(migrationsFS, ".")
	if err != nil {
		return fmt.Errorf("iofs.New: %w", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", src, toMigrateURL(dsn))
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
		return dsn
	}
	return dsn
}
