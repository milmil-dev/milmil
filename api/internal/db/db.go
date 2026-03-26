package db

import (
	"database/sql"
	"fmt"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib" // postgres driver: "pgx"
	_ "modernc.org/sqlite"              // sqlite driver: "sqlite"
)

// Open creates a database/sql connection for either SQLite or PostgreSQL.
// DSN format: "sqlite://path/to/file.db" or "postgres://..."
func Open(dsn string) (*sql.DB, error) {
	driver, dataSourceName, err := parseDSN(dsn)
	if err != nil {
		return nil, err
	}

	database, err := sql.Open(driver, dataSourceName)
	if err != nil {
		return nil, fmt.Errorf("sql.Open(%s): %w", driver, err)
	}

	// SQLite: single writer, multiple readers
	if driver == "sqlite" {
		database.SetMaxOpenConns(1)
	}

	if err := database.Ping(); err != nil {
		database.Close()
		return nil, fmt.Errorf("db ping (%s): %w", driver, err)
	}
	return database, nil
}

// parseDSN converts a milmil-style DSN to a driver name + data source name.
func parseDSN(dsn string) (driver, dataSourceName string, err error) {
	switch {
	case strings.HasPrefix(dsn, "sqlite://"):
		// sqlite://./data/milmil.db  →  driver="sqlite", dsn="./data/milmil.db"
		// sqlite://file::memory:?...  →  driver="sqlite", dsn="file::memory:?..."
		raw := strings.TrimPrefix(dsn, "sqlite://")
		return "sqlite", raw, nil
	case strings.HasPrefix(dsn, "postgres://"), strings.HasPrefix(dsn, "postgresql://"):
		return "pgx", dsn, nil
	default:
		return "", "", fmt.Errorf("unsupported database URL scheme: %q", dsn)
	}
}
