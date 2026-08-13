package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
)

// sensitiveFields are exact JSON keys whose values must be redacted in request
// logs. Suffix-based matches are handled separately by isSensitiveKey.
var sensitiveFields = map[string]bool{
	"password":       true,
	"pw":             true,
	"token":          true,
	"secret":         true,
	"api_key":        true,
	"apikey":         true,
	"access_token":   true,
	"refresh_token":  true,
	"app_id":         true,
	"app_secret":     true,
	"client_id":      true,
	"client_secret":  true,
	"private_key":    true,
	"jwt_secret":     true,
	"encryption_key": true,
}

// sensitiveSuffixes catch credential field variants like smb_password,
// webdav_password, source_token, etc. Matched case-insensitively as a suffix.
var sensitiveSuffixes = []string{
	"_password",
	"_secret",
	"_token",
	"_key",
	"_apikey",
	"_credentials",
}

func isSensitiveKey(key string) bool {
	k := strings.ToLower(key)
	if sensitiveFields[k] {
		return true
	}
	// Skip non-sensitive *_id fields that would otherwise match _key, etc.
	if strings.HasSuffix(k, "_id") {
		return false
	}
	for _, suf := range sensitiveSuffixes {
		if strings.HasSuffix(k, suf) {
			return true
		}
	}
	return false
}

func attachMiddleware(e *echo.Echo) {
	e.Use(middleware.Recover())
	e.Use(prettyLogger())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		// v5 no longer supports wildcard ports in AllowOrigins; allow any
		// localhost/127.0.0.1 port via the origin callback instead.
		UnsafeAllowOriginFunc: func(c *echo.Context, origin string) (string, bool, error) {
			if u, err := url.Parse(origin); err == nil && u.Scheme == "http" &&
				(u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1") {
				return origin, true, nil
			}
			return "", false, nil
		},
		AllowHeaders: []string{
			echo.HeaderOrigin,
			echo.HeaderContentType,
			echo.HeaderAccept,
			echo.HeaderAuthorization,
		},
		AllowMethods: []string{
			http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch,
			http.MethodDelete, http.MethodOptions,
		},
	}))
	e.Use(middleware.RateLimiterWithConfig(middleware.RateLimiterConfig{
		Store: middleware.NewRateLimiterMemoryStoreWithConfig(
			middleware.RateLimiterMemoryStoreConfig{Rate: 100},
		),
	}))
}

// prettyLogger uses slog (which is wired to zerolog ConsoleWriter) for
// colorful, human-readable request logs in dev mode.
func prettyLogger() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			start := time.Now()
			req := c.Request()

			// Skip OPTIONS preflight and WebSocket upgrades
			if req.Method == http.MethodOptions {
				return next(c)
			}
			if strings.EqualFold(req.Header.Get("Upgrade"), "websocket") {
				return next(c)
			}

			// Capture request body for mutation requests (POST/PUT/PATCH/DELETE)
			var reqBody string
			if req.Method != http.MethodGet && req.Body != nil {
				bodyBytes, readErr := io.ReadAll(req.Body)
				if readErr == nil {
					reqBody = string(bodyBytes)
					// Truncate large bodies
					if len(reqBody) > 1024 {
						reqBody = reqBody[:1024] + "...(truncated)"
					}
					// Restore body for handler
					req.Body = io.NopCloser(bytes.NewReader(bodyBytes))
				}
			}

			// Capture response body for error responses
			resBodyBuf := new(bytes.Buffer)
			origWriter := c.Response()
			mw := &responseCapture{ResponseWriter: origWriter, buf: resBodyBuf}
			c.SetResponse(mw)

			err := next(c)

			latency := time.Since(start)
			_, status := echo.ResolveResponseStatus(c.Response(), err)

			attrs := []any{
				"method", req.Method,
				"uri", req.RequestURI,
				"status", status,
				"latency", latency.Round(time.Millisecond).String(),
			}
			if err != nil {
				attrs = append(attrs, "err", err.Error())
			}

			// Add request body for mutation requests (with sensitive fields redacted)
			if reqBody != "" {
				attrs = append(attrs, "req_body", redactSensitiveFields(reqBody))
			}

			// Add response body for errors (always) and all requests (debug mode)
			if resBodyBuf.Len() > 0 {
				if status >= 400 || slog.Default().Enabled(c.Request().Context(), slog.LevelDebug) {
					resBody := resBodyBuf.String()
					if len(resBody) > 512 {
						resBody = resBody[:512] + "...(truncated)"
					}
					attrs = append(attrs, "res_body", resBody)
				}
			}

			switch {
			case status >= 500:
				slog.Error("request", attrs...)
			case status >= 400:
				slog.Warn("request", attrs...)
			default:
				slog.Info("request", attrs...)
			}

			return err
		}
	}
}

// responseCapture wraps http.ResponseWriter to capture response body for logging.
type responseCapture struct {
	http.ResponseWriter
	buf *bytes.Buffer
}

func (w *responseCapture) Write(b []byte) (int, error) {
	// Only capture first 512 bytes to avoid memory overhead
	if w.buf.Len() < 512 {
		w.buf.Write(b)
	}
	return w.ResponseWriter.Write(b)
}

// Unwrap lets echo.UnwrapResponse reach the underlying *echo.Response
// through this wrapper (required for status resolution in v5).
func (w *responseCapture) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

// redactSensitiveFields replaces values of known credential fields with
// "[REDACTED]" anywhere they appear in a JSON document, including nested
// objects and arrays. Falls back to the original string if the body isn't
// valid JSON.
func redactSensitiveFields(body string) string {
	var v any
	if err := json.Unmarshal([]byte(body), &v); err != nil {
		return body
	}
	redacted := redactValue(v)
	out, err := json.Marshal(redacted)
	if err != nil {
		return body
	}
	return string(out)
}

func redactValue(v any) any {
	switch val := v.(type) {
	case map[string]any:
		for k, child := range val {
			if isSensitiveKey(k) {
				if child == nil || child == "" {
					// preserve empty/null — useful for "is the field set" debugging
					continue
				}
				val[k] = "[REDACTED]"
				continue
			}
			val[k] = redactValue(child)
		}
		return val
	case []any:
		for i, item := range val {
			val[i] = redactValue(item)
		}
		return val
	default:
		return val
	}
}
