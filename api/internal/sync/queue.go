package sync

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"uuid"

	"github.com/milmil/api/internal/store"
)

// Queue owns the sync outbox. Enqueue and related writes are transactional
// so concurrent callers cannot race past the supersede step (A2 fix).
type Queue struct {
	q  *store.Queries
	db *sql.DB
}

// NewQueue wires a Queue to the shared sqlc handle and raw *sql.DB. The raw
// *sql.DB is required to open transactions.
func NewQueue(q *store.Queries, db *sql.DB) *Queue {
	return &Queue{q: q, db: db}
}

// Enqueue inserts a new outbox row. For KindProgress, older unfinished rows
// for the same (user, provider, anime) are marked superseded in the same
// transaction so only the newest snapshot is ever processed.
func (qu *Queue) Enqueue(ctx context.Context, userID string, provider ProviderName, animeID string, op SyncOp) error {
	payload, err := json.Marshal(op)
	if err != nil {
		return fmt.Errorf("sync: marshal op: %w", err)
	}
	return qu.inTx(ctx, func(tx *store.Queries) error {
		if op.Kind == KindProgress {
			if err := tx.SupersedeProgressOps(ctx, store.SupersedeProgressOpsParams{
				UserID:   userID,
				Provider: string(provider),
				AnimeID:  animeID,
			}); err != nil {
				return fmt.Errorf("supersede: %w", err)
			}
		}
		return tx.EnqueueSyncOp(ctx, store.EnqueueSyncOpParams{
			ID:       uuid.New().String(),
			UserID:   userID,
			Provider: string(provider),
			AnimeID:  animeID,
			Kind:     string(op.Kind),
			Payload:  string(payload),
		})
	})
}

func (qu *Queue) inTx(ctx context.Context, fn func(*store.Queries) error) error {
	tx, err := qu.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if err := fn(qu.q.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit()
}

// Backoff returns the delay before the next attempt: 1m, 2m, 4m, 8m, ...,
// capped at 24h. attempts is 1-indexed (first retry is attempts=1 -> 1m).
func Backoff(attempts int) time.Duration {
	if attempts < 1 {
		attempts = 1
	}
	d := time.Minute
	for i := 1; i < attempts; i++ {
		d *= 2
		if d >= 24*time.Hour {
			return 24 * time.Hour
		}
	}
	return d
}
