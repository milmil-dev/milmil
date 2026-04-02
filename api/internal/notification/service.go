package notification

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/ws"
)

type Service struct {
	queries *store.Queries
	wsHub   *ws.Hub
}

func NewService(queries *store.Queries, wsHub *ws.Hub) *Service {
	return &Service{queries: queries, wsHub: wsHub}
}

func (s *Service) Send(ctx context.Context, notifType, title, message, severity string, metadata map[string]any) {
	var meta sql.NullString
	if metadata != nil {
		if b, err := json.Marshal(metadata); err == nil {
			meta = sql.NullString{String: string(b), Valid: true}
		}
	}

	notif, err := s.queries.CreateNotification(ctx, store.CreateNotificationParams{
		ID:       uuid.NewString(),
		Type:     notifType,
		Title:    title,
		Message:  message,
		Severity: severity,
		Metadata: meta,
	})
	if err != nil {
		slog.Error("notification: create failed", "type", notifType, "err", err)
		return
	}

	if s.wsHub != nil {
		s.wsHub.Broadcast(ws.Event{
			Type: "notification:new",
			Data: notif,
		})
	}
}

func (s *Service) UnreadCount(ctx context.Context) (int64, error) {
	return s.queries.CountUnreadNotifications(ctx)
}

func (s *Service) List(ctx context.Context, limit, offset int64, typeFilter string) ([]store.Notification, error) {
	if typeFilter != "" {
		return s.queries.ListNotificationsByType(ctx, store.ListNotificationsByTypeParams{
			Type:   typeFilter + "%",
			Limit:  limit,
			Offset: offset,
		})
	}
	return s.queries.ListNotifications(ctx, store.ListNotificationsParams{
		Limit:  limit,
		Offset: offset,
	})
}

func (s *Service) MarkRead(ctx context.Context, id string) error {
	return s.queries.MarkNotificationRead(ctx, id)
}

func (s *Service) MarkAllRead(ctx context.Context) error {
	return s.queries.MarkAllNotificationsRead(ctx)
}

func (s *Service) Clear(ctx context.Context) error {
	return s.queries.DeleteAllNotifications(ctx)
}

func (s *Service) CleanupOld(ctx context.Context, days int) error {
	cutoff := time.Now().AddDate(0, 0, -days).Format(time.RFC3339)
	return s.queries.DeleteOldReadNotifications(ctx, cutoff)
}
