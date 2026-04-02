package api

import (
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
			err := next(c)
			if err != nil {
				c.Error(err)
			}

			req := c.Request()
			res := c.Response()
			latency := time.Since(start)

			// Skip noisy OPTIONS preflight and WebSocket upgrade logs
			if req.Method == http.MethodOptions {
				return nil
			}

			status := res.Status
			attrs := []any{
				"method", req.Method,
				"uri", req.RequestURI,
				"status", status,
				"latency", latency.Round(time.Millisecond).String(),
			}

			switch {
			case status >= 500:
				slog.Error("request", attrs...)
			case status >= 400:
				slog.Warn("request", attrs...)
			default:
				slog.Info("request", attrs...)
			}

			return nil
		}
	}
}
