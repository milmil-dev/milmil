package api

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func attachMiddleware(e *echo.Echo) {
	e.Use(middleware.Recover())
	e.Use(prettyLogger())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:*", "http://127.0.0.1:*"},
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
		return func(c echo.Context) error {
			start := time.Now()
			req := c.Request()

			// Skip noisy OPTIONS preflight
			if req.Method == http.MethodOptions {
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
			origWriter := c.Response().Writer
			mw := &responseCapture{ResponseWriter: origWriter, buf: resBodyBuf}
			c.Response().Writer = mw

			err := next(c)
			if err != nil {
				c.Error(err)
			}

			res := c.Response()
			latency := time.Since(start)
			status := res.Status

			attrs := []any{
				"method", req.Method,
				"uri", req.RequestURI,
				"status", status,
				"latency", latency.Round(time.Millisecond).String(),
			}

			// Add request body for mutation requests
			if reqBody != "" {
				attrs = append(attrs, "req_body", reqBody)
			}

			// Add response body for 4xx/5xx errors
			if status >= 400 && resBodyBuf.Len() > 0 {
				resBody := resBodyBuf.String()
				if len(resBody) > 512 {
					resBody = resBody[:512] + "...(truncated)"
				}
				attrs = append(attrs, "res_body", resBody)
			}

			switch {
			case status >= 500:
				slog.Error("request", attrs...)
			case status >= 400:
				slog.Warn("request", attrs...)
			default:
				slog.Debug("request", attrs...)
			}

			return nil
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
