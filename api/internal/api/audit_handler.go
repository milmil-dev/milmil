package api

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/macro"
	"github.com/milmil/api/internal/store"
)

// handleListAudit returns a paginated list of the caller's audit entries.
//
// Query params:
//   - action: optional action_type exact match (e.g. "match.apply")
//   - since:  optional RFC3339 timestamp; only entries created at-or-after
//   - limit:  page size, default 50, max 200
//   - offset: zero-based, default 0
func (h *handler) handleListAudit(c echo.Context) error {
	limit := int64(50)
	if l, err := strconv.ParseInt(c.QueryParam("limit"), 10, 64); err == nil && l > 0 && l <= 200 {
		limit = l
	}
	offset := int64(0)
	if o, err := strconv.ParseInt(c.QueryParam("offset"), 10, 64); err == nil && o >= 0 {
		offset = o
	}

	params := store.ListAuditLogByUserParams{
		UserID:  getUserID(c),
		Limit:   limit,
		OffsetN: offset,
	}
	if action := c.QueryParam("action"); action != "" {
		params.ActionType = sql.NullString{String: action, Valid: true}
	}
	if since := c.QueryParam("since"); since != "" {
		params.Since = sql.NullString{String: since, Valid: true}
	}

	rows, err := h.queries.ListAuditLogByUser(c.Request().Context(), params)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]any{
		"items":  rows,
		"limit":  limit,
		"offset": offset,
	})
}

// handleGetAudit returns one audit entry plus any child entries (macro
// children). 403 if the entry belongs to another user.
func (h *handler) handleGetAudit(c echo.Context) error {
	id := c.Param("id")
	row, err := h.queries.GetAuditLog(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "audit entry not found")
	}
	if row.UserID != getUserID(c) {
		return echo.NewHTTPError(http.StatusForbidden, "not your audit entry")
	}
	children, err := h.queries.ListAuditLogChildren(c.Request().Context(), sql.NullString{String: id, Valid: true})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, map[string]any{
		"entry":    row,
		"children": children,
	})
}

type auditUndoRequest struct {
	ID     string `json:"id"`
	Since  string `json:"since"`
	DryRun bool   `json:"dry_run"`
}

// handleUndoAudit reverses one audit entry (when id is provided) or every
// entry created since the given timestamp.
func (h *handler) handleUndoAudit(c echo.Context) error {
	var req auditUndoRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if req.ID == "" && req.Since == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "must provide id or since")
	}

	res, err := macro.Undo(c.Request().Context(), h.queries, h.undoDeps(), getUserID(c), macro.UndoParams{
		ID:     req.ID,
		Since:  req.Since,
		DryRun: req.DryRun,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	// macro.Undo writes its own per-action audit entries; suppress the
	// generic middleware row.
	c.Set(auditSkipKey, true)
	return c.JSON(http.StatusOK, res)
}

// undoDeps returns the optional clients the undo engine may need. Each
// field stays nil until the surrounding services land in later phases; the
// engine reports "dep not configured" rather than crashing.
func (h *handler) undoDeps() macro.Deps {
	return macro.Deps{}
}
