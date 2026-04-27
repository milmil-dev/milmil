package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/store"
)

const auditSkipKey = "audit_skip"

// auditMiddleware writes an audit_log row for any successful mutating request
// (POST/PUT/PATCH/DELETE) under /api/v1. Read requests (GET/HEAD/OPTIONS) are
// skipped.
//
// The middleware is intentionally generic: action_type is derived from the
// route + HTTP method (e.g. "POST /api-tokens" -> "api_token.create"). Macro
// endpoints write their own richer entries inside the handler and signal the
// middleware to skip via the auditSkipKey context value.
func auditMiddleware(q *store.Queries) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			method := c.Request().Method
			if method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions {
				return next(c)
			}

			// Capture request body so the handler can still bind/read it.
			var reqBody []byte
			if c.Request().Body != nil {
				reqBody, _ = io.ReadAll(c.Request().Body)
				c.Request().Body = io.NopCloser(bytes.NewReader(reqBody))
			}

			if err := next(c); err != nil {
				return err
			}

			if c.Get(auditSkipKey) == true {
				return nil
			}

			status := c.Response().Status
			if status < 200 || status >= 300 {
				return nil
			}

			userID := getUserID(c)
			if userID == "" {
				return nil
			}

			_, err := q.CreateAuditLog(context.Background(), store.CreateAuditLogParams{
				ID:         newAuditID(),
				UserID:     userID,
				TokenID:    auditNullStr(getTokenID(c)),
				AgentLabel: auditNullStr(getTokenName(c)),
				ActionType: deriveActionType(c.Path(), method),
				TargetType: sql.NullString{},
				TargetID:   sql.NullString{},
				BeforeJson: sql.NullString{},
				AfterJson:  sql.NullString{String: string(reqBody), Valid: len(reqBody) > 0},
				Confidence: sql.NullFloat64{},
				ParentID:   sql.NullString{},
				DryRun:     0,
			})
			if err != nil {
				slog.Warn("audit middleware: failed to write entry", "err", err)
			}
			return nil
		}
	}
}

// deriveActionType maps "POST /api/v1/api-tokens" to "api_token.create".
// Macro handlers override by setting auditSkipKey and writing their own entries.
func deriveActionType(path, method string) string {
	path = strings.TrimPrefix(path, "/api/v1")
	parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
	resource := parts[0]
	if resource == "" {
		resource = "unknown"
	}
	resource = strings.TrimSuffix(resource, "s")
	resource = strings.ReplaceAll(resource, "-", "_")

	verb := map[string]string{
		http.MethodPost:   "create",
		http.MethodPut:    "update",
		http.MethodPatch:  "update",
		http.MethodDelete: "delete",
	}[method]
	if verb == "" {
		verb = strings.ToLower(method)
	}

	return resource + "." + verb
}

func newAuditID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func auditNullStr(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
