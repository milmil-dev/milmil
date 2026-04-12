package notification

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/milmil/api/internal/metadata"
	"github.com/milmil/api/internal/rss"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/ws"
)

// MetadataLookup is the subset of metadata.Service needed for enrichment.
type MetadataLookup interface {
	GetAnimeDetail(ctx context.Context, bangumiID int) (*metadata.AnimeDetail, error)
}

type Service struct {
	queries  *store.Queries
	wsHub    *ws.Hub
	metadata MetadataLookup
}

func NewService(queries *store.Queries, wsHub *ws.Hub, lookups ...MetadataLookup) *Service {
	s := &Service{queries: queries, wsHub: wsHub}
	if len(lookups) > 0 {
		s.metadata = lookups[0]
	}
	return s
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

	go s.dispatchExternal(notifType, title, message, severity, metadata, notif.ID)
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

// dispatchExternal sends the notification to all enabled external providers
// for the given event type. Failures are recorded as pending deliveries for
// the retry worker to pick up.
func (s *Service) dispatchExternal(notifType, title, message, severity string, metadata map[string]any, notifID string) {
	ctx := context.Background()

	cfg, err := LoadNotificationConfig(ctx, s.queries)
	if err != nil {
		slog.Error("notification: load config for dispatch", "err", err)
		return
	}

	providerNames := cfg.EnabledProvidersForEvent(notifType)
	if len(providerNames) == 0 {
		return
	}

	// Enrich download events with anime metadata when possible.
	if metadata == nil {
		metadata = make(map[string]any)
	}
	if strings.HasPrefix(notifType, "download.") && s.metadata != nil {
		if rawID, ok := metadata["download_id"]; ok {
			downloadID := fmt.Sprintf("%v", rawID)
			if downloadID != "" {
				dl, err := s.queries.GetDownloadByID(ctx, downloadID)
				if err == nil {
					if ep := rss.ParseEpisode(dl.Name); ep != "" {
						metadata["episode"] = ep
					}
					if sg := rss.ParseSubgroup(dl.Name); sg != "" {
						metadata["subgroup"] = sg
					}
					if dl.BangumiID.Valid {
						if detail, derr := s.metadata.GetAnimeDetail(ctx, int(dl.BangumiID.Int64)); derr == nil && detail != nil {
							metadata["anime_name"] = detail.Title
							metadata["cover_image"] = detail.CoverImage
							if name, _ := metadata["anime_name"].(string); name != "" {
								if ep, _ := metadata["episode"].(string); ep != "" {
									title = fmt.Sprintf("%s - %s", name, ep)
								} else {
									title = name
								}
								message = fmt.Sprintf("%s: %s", title, dl.Status)
							}
						} else if derr != nil {
							slog.Debug("notification: enrich metadata lookup failed", "err", derr)
						}
					}
				} else {
					slog.Debug("notification: enrich download lookup failed", "id", downloadID, "err", err)
				}
			}
		}
	}

	strMeta := make(map[string]string, len(metadata))
	for k, v := range metadata {
		strMeta[k] = fmt.Sprintf("%v", v)
	}

	event := NotificationEvent{
		Type:     notifType,
		Title:    title,
		Message:  message,
		Severity: severity,
		Metadata: strMeta,
	}

	for _, name := range providerNames {
		deliveryID := uuid.NewString()
		_, err := s.queries.CreateNotificationDelivery(ctx, store.CreateNotificationDeliveryParams{
			ID:             deliveryID,
			NotificationID: notifID,
			Provider:       name,
		})
		if err != nil {
			slog.Error("notification: create delivery", "provider", name, "err", err)
			continue
		}

		provider := BuildProvider(name, &cfg)
		if provider == nil {
			continue
		}

		if sendErr := provider.Send(ctx, event); sendErr != nil {
			nextRetry := time.Now().Add(1 * time.Minute).Format(time.RFC3339)
			if dbErr := s.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{
				LastError:   sql.NullString{String: sendErr.Error(), Valid: true},
				NextRetryAt: sql.NullString{String: nextRetry, Valid: true},
				ID:          deliveryID,
			}); dbErr != nil {
				slog.Error("notification: record delivery failure failed", "provider", name, "deliveryID", deliveryID, "err", dbErr)
			}
			slog.Warn("notification: delivery failed, will retry", "provider", name, "err", sendErr)
		} else {
			if dbErr := s.queries.UpdateDeliverySuccess(ctx, deliveryID); dbErr != nil {
				slog.Error("notification: record delivery success failed", "provider", name, "deliveryID", deliveryID, "err", dbErr)
			}
		}
	}
}
