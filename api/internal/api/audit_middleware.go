package api

import (
	"bytes"
	"context"
	"database/sql"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/google/uuid"
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
//
// Sensitive bodies (anything under /api/v1/auth/*) are NOT captured into
// after_json — those endpoints take password / 2FA secret fields that must
// not land in the audit log. For other paths the request body is captured
// after redactSensitiveFields() (the same redactor the request logger uses)
// scrubs top-level password/token/secret keys.
func auditMiddleware(q *store.Queries) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			method := c.Request().Method
			if method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions {
				return next(c)
			}

			// Capture request body so the handler can still bind/read it.
			// Auth paths intentionally skip body capture entirely — even
			// after redaction, a malformed-JSON body containing a password
			// would round-trip into after_json, and the action_type alone
			// is enough audit value for those routes.
			isAuthPath := strings.HasPrefix(c.Path(), "/api/v1/auth/")
			var reqBody []byte
			if !isAuthPath && c.Request().Body != nil {
				reqBody, _ = io.ReadAll(c.Request().Body)
				c.Request().Body = io.NopCloser(bytes.NewReader(reqBody))
			} else if c.Request().Body != nil {
				// Drain + restore so the handler's c.Bind still works without
				// us holding a copy.
				raw, _ := io.ReadAll(c.Request().Body)
				c.Request().Body = io.NopCloser(bytes.NewReader(raw))
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

			afterJSON := sql.NullString{}
			if len(reqBody) > 0 {
				afterJSON = sql.NullString{String: redactSensitiveFields(string(reqBody)), Valid: true}
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
				AfterJson:  afterJSON,
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

// newAuditID returns a fresh audit-log row ID. The schema column is TEXT,
// so any unique string works; using uuid.NewString matches every other
// entity in the codebase and keeps birthday-collision risk negligible.
func newAuditID() string {
	return uuid.NewString()
}

func auditNullStr(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
