package api

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/milmil/api/internal/auth"
	"github.com/milmil/api/internal/store"
)

type apiTokenDTO struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	TokenPrefix   string  `json:"token_prefix"`
	LastUsedAt    *string `json:"last_used_at"`
	LastIP        string  `json:"last_ip"`
	LastUserAgent string  `json:"last_user_agent"`
	CreatedAt     string  `json:"created_at"`
	IsCurrent     bool    `json:"is_current"`
}

type apiTokenCreateRequest struct {
	Name string `json:"name"`
}

type apiTokenCreateResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Token       string `json:"token"`
	TokenPrefix string `json:"token_prefix"`
	CreatedAt   string `json:"created_at"`
}

func (h *handler) handleListAPITokens(c echo.Context) error {
	tokens, err := h.queries.ListAPITokensByUser(c.Request().Context(), getUserID(c))
	if err != nil {
		return echo.ErrInternalServerError
	}
	currentTokenID := getTokenID(c)
	dtos := make([]apiTokenDTO, len(tokens))
	for i, t := range tokens {
		dto := apiTokenDTO{
			ID:            t.ID,
			Name:          t.Name,
			TokenPrefix:   t.TokenPrefix,
			LastIP:        t.LastIp,
			LastUserAgent: t.LastUserAgent,
			CreatedAt:     t.CreatedAt,
			IsCurrent:     t.ID == currentTokenID,
		}
		if t.LastUsedAt.Valid {
			dto.LastUsedAt = &t.LastUsedAt.String
		}
		dtos[i] = dto
	}
	return c.JSON(http.StatusOK, dtos)
}

func (h *handler) handleCreateAPIToken(c echo.Context) error {
	var req apiTokenCreateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request")
	}
	if req.Name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}
	if len(req.Name) > 100 {
		return echo.NewHTTPError(http.StatusBadRequest, "name must be 100 characters or fewer")
	}

	count, err := h.queries.CountAPITokensByUser(c.Request().Context(), getUserID(c))
	if err != nil {
		return echo.ErrInternalServerError
	}
	if count >= 25 {
		return echo.NewHTTPError(http.StatusBadRequest, "maximum of 25 API tokens reached")
	}

	plaintext, hash, prefix, err := auth.GenerateAPIToken()
	if err != nil {
		return echo.ErrInternalServerError
	}

	token, err := h.queries.CreateAPIToken(c.Request().Context(), store.CreateAPITokenParams{
		ID:            uuid.NewString(),
		Name:          req.Name,
		TokenHash:     hash,
		TokenPrefix:   prefix,
		UserID:        getUserID(c),
		LastIp:        c.RealIP(),
		LastUserAgent: c.Request().UserAgent(),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}

	return c.JSON(http.StatusCreated, apiTokenCreateResponse{
		ID:          token.ID,
		Name:        token.Name,
		Token:       plaintext,
		TokenPrefix: token.TokenPrefix,
		CreatedAt:   token.CreatedAt,
	})
}

func (h *handler) handleDeleteAPIToken(c echo.Context) error {
	id := c.Param("id")
	if err := h.queries.DeleteAPIToken(c.Request().Context(), store.DeleteAPITokenParams{
		ID:     id,
		UserID: getUserID(c),
	}); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *handler) handleGetCurrentToken(c echo.Context) error {
	tokenID := getTokenID(c)
	token, err := h.queries.GetAPITokenByID(c.Request().Context(), store.GetAPITokenByIDParams{
		ID:     tokenID,
		UserID: getUserID(c),
	})
	if err != nil {
		return echo.ErrInternalServerError
	}
	dto := apiTokenDTO{
		ID:            token.ID,
		Name:          token.Name,
		TokenPrefix:   token.TokenPrefix,
		LastIP:        token.LastIp,
		LastUserAgent: token.LastUserAgent,
		CreatedAt:     token.CreatedAt,
		IsCurrent:     true,
	}
	if token.LastUsedAt.Valid {
		dto.LastUsedAt = &token.LastUsedAt.String
	}
	return c.JSON(http.StatusOK, dto)
}

func (h *handler) handleDeleteOtherTokens(c echo.Context) error {
	tokenID := getTokenID(c)
	if err := h.queries.DeleteOtherAPITokens(c.Request().Context(), store.DeleteOtherAPITokensParams{
		UserID: getUserID(c),
		ID:     tokenID,
	}); err != nil {
		return echo.ErrInternalServerError
	}
	return c.NoContent(http.StatusNoContent)
}
