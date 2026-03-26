// Package migrations embeds all SQL migration files for use with golang-migrate.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
