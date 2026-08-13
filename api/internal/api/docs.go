package api

import (
	_ "embed"
	"net/http"

	"github.com/labstack/echo/v5"
)

//go:embed openapi.json
var openapiSpec []byte

func handleDocs(c *echo.Context) error {
	html := `<!doctype html>
<html>
  <head>
    <title>milmil API Docs</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`
	return c.HTML(http.StatusOK, html)
}

func handleOpenAPISpec(c *echo.Context) error {
	return c.JSONBlob(http.StatusOK, openapiSpec)
}
