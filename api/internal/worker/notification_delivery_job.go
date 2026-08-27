package worker

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/store"
)

// NotificationDeliveryWorker retries failed/pending external notification
// deliveries with exponential backoff.
type NotificationDeliveryWorker struct {
	queries *store.Queries
}

// Run processes all pending deliveries whose next_retry_at has elapsed.
func (w *NotificationDeliveryWorker) Run(ctx context.Context) error {
	now := time.Now().Format(time.RFC3339)
	deliveries, err := w.queries.ListPendingDeliveries(ctx, sql.NullString{String: now, Valid: true})
	if err != nil {
		return fmt.Errorf("list pending deliveries: %w", err)
	}
	if len(deliveries) == 0 {
		return nil
	}

	cfg, err := notification.LoadNotificationConfig(ctx, w.queries)
	if err != nil {
		return fmt.Errorf("load notification config: %w", err)
	}

	for _, d := range deliveries {
		provider := notification.BuildProvider(d.Provider, &cfg)
		if provider == nil {
			_ = w.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{
				LastError:   sql.NullString{String: "provider not configured", Valid: true},
				NextRetryAt: sql.NullString{Valid: false},
				ID:          d.ID,
			})
			continue
		}

		notif, err := w.queries.GetNotification(ctx, d.NotificationID)
		if err != nil {
			_ = w.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{
				LastError:   sql.NullString{String: "notification not found", Valid: true},
				NextRetryAt: sql.NullString{Valid: false},
				ID:          d.ID,
			})
			continue
		}

		strMeta := make(map[string]string)
		if notif.Metadata.Valid {
			var rawMeta map[string]any
			if err := json.Unmarshal([]byte(notif.Metadata.String), &rawMeta); err == nil {
				for k, v := range rawMeta {
					strMeta[k] = fmt.Sprintf("%v", v)
				}
			}
		}

		event := notification.NotificationEvent{
			Type:     notif.Type,
			Title:    notif.Title,
			Message:  notif.Message,
			Severity: notif.Severity,
			Metadata: strMeta,
		}

		if sendErr := provider.Send(ctx, event); sendErr != nil {
			backoff := 5 * time.Minute
			if d.Attempts >= 1 {
				backoff = 15 * time.Minute
			}
			nextRetry := time.Now().Add(backoff).Format(time.RFC3339)
			_ = w.queries.UpdateDeliveryFailure(ctx, store.UpdateDeliveryFailureParams{
				LastError:   sql.NullString{String: sendErr.Error(), Valid: true},
				NextRetryAt: sql.NullString{String: nextRetry, Valid: true},
				ID:          d.ID,
			})
		} else {
			_ = w.queries.UpdateDeliverySuccess(ctx, d.ID)
		}
	}
	return nil
}
