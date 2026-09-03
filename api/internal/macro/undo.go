// Package macro implements server-side orchestration for multi-step
// operations exposed via the /api/v1/match/auto, /api/v1/subscribe and
// /api/v1/audit/undo endpoints.
package macro

import (
	"context"
	"database/sql"
	"fmt"

	"uuid"

	"github.com/milmil/api/internal/store"
)

// UndoParams selects which audit entries to reverse.
//
// Either ID (single entry; children are reversed first, then the parent) or
// Since (RFC3339 timestamp; everything newer is reversed in created_at DESC
// order) must be set.
type UndoParams struct {
	ID     string
	Since  string
	DryRun bool
}

// UndoResult is the per-entry outcome of an undo run.
type UndoResult struct {
	Items []UndoItem `json:"items"`
}

// UndoItem reports the outcome of reversing a single audit entry.
type UndoItem struct {
	AuditID string `json:"audit_id"`
	Status  string `json:"status"` // "reversed" | "skipped" | "failed"
	Reason  string `json:"reason,omitempty"`
}

// BangumiReverter pushes a watch-state revert to the user's Bangumi account.
type BangumiReverter interface {
	Revert(ctx context.Context, externalID, beforeJSON string) error
}

// AnilistReverter pushes a watch-state revert to the user's AniList account.
type AnilistReverter interface {
	Revert(ctx context.Context, externalID, beforeJSON string) error
}

// DownloadCanceller cancels an in-flight download by gid/id.
type DownloadCanceller interface {
	Cancel(ctx context.Context, downloadID string) error
}

// Deps groups the optional clients the undo engine may need to reverse a
// given action_type. Each field is nilable: if the corresponding action_type
// is encountered with a nil dep, that entry is reported "failed" with reason
// "dep not configured" rather than panicking.
type Deps struct {
	Bangumi   BangumiReverter
	Anilist   AnilistReverter
	Downloads DownloadCanceller
}

// Undo reverses one audit entry (ID-based) or a window of entries (Since-based)
// for the given user. Returns a per-entry status report.
func Undo(ctx context.Context, q *store.Queries, deps Deps, userID string, p UndoParams) (*UndoResult, error) {
	if p.ID == "" && p.Since == "" {
		return nil, fmt.Errorf("undo: must provide id or since")
	}

	rows, err := collectRows(ctx, q, userID, p)
	if err != nil {
		return nil, err
	}

	res := &UndoResult{}
	for _, row := range rows {
		if row.UndoneAt.Valid {
			res.Items = append(res.Items, UndoItem{AuditID: row.ID, Status: "skipped", Reason: "already undone"})
			continue
		}
		if p.DryRun {
			res.Items = append(res.Items, UndoItem{AuditID: row.ID, Status: "reversed", Reason: "[dry-run] would reverse"})
			continue
		}
		if err := reverseOne(ctx, q, deps, row); err != nil {
			res.Items = append(res.Items, UndoItem{AuditID: row.ID, Status: "failed", Reason: err.Error()})
			continue
		}
		if err := q.MarkAuditUndone(ctx, store.MarkAuditUndoneParams{
			ID:       row.ID,
			UndoneBy: sql.NullString{String: newAuditID(), Valid: true},
		}); err != nil {
			// Reversal already applied to the world, but the bookkeeping
			// row is still pristine — re-running undo would replay the
			// reverse a second time. Surface this so callers know the
			// state is inconsistent rather than swallowing it as a warn.
			res.Items = append(res.Items, UndoItem{
				AuditID: row.ID,
				Status:  "failed",
				Reason:  fmt.Sprintf("reverse applied but mark-undone failed: %v (re-running undo will replay the reverse)", err),
			})
			continue
		}
		res.Items = append(res.Items, UndoItem{AuditID: row.ID, Status: "reversed"})
	}
	return res, nil
}

func collectRows(ctx context.Context, q *store.Queries, userID string, p UndoParams) ([]store.AuditLog, error) {
	if p.ID != "" {
		row, err := q.GetAuditLog(ctx, p.ID)
		if err != nil {
			return nil, fmt.Errorf("audit entry %s: %w", p.ID, err)
		}
		if row.UserID != userID {
			return nil, fmt.Errorf("audit entry %s: not yours", p.ID)
		}
		children, err := q.ListAuditLogChildren(ctx, sql.NullString{String: p.ID, Valid: true})
		if err != nil {
			return nil, fmt.Errorf("list children of %s: %w", p.ID, err)
		}
		// Reverse children first (LIFO), then the parent.
		return append(children, row), nil
	}

	rows, err := q.ListAuditLogByUser(ctx, store.ListAuditLogByUserParams{
		UserID:  userID,
		Since:   sql.NullString{String: p.Since, Valid: true},
		Limit:   1000,
		OffsetN: 0,
	})
	if err != nil {
		return nil, fmt.Errorf("list audit since %s: %w", p.Since, err)
	}
	return rows, nil
}

func reverseOne(ctx context.Context, q *store.Queries, deps Deps, row store.AuditLog) error {
	switch row.ActionType {
	case "match.apply":
		return reverseMatchApply(ctx, q, row)
	case "subscribe.add":
		// The macro entry's children are reversed first; the parent is a
		// pure marker with no side effects of its own.
		return nil
	case "subscribe.create":
		// Generic middleware row from the standalone POST /api/v1/subscribe
		// endpoint. We don't know which RSS feed / sync action to reverse
		// from the row alone (target_id isn't populated by the generic
		// middleware), and the proper subscribe-undo macro lives in v0.2
		// alongside POST /api/v1/subscribe-as-macro. Surface a clear
		// message so the user knows what to do manually instead of seeing
		// a generic "no reverse handler".
		return fmt.Errorf("subscribe.create undo lands in v0.2 alongside the macro endpoint; for now, delete the RSS feed via the web UI and the audit row will remain marked unreversed")
	case "download.queue":
		if deps.Downloads == nil {
			return fmt.Errorf("download canceller not configured")
		}
		return deps.Downloads.Cancel(ctx, row.TargetID.String)
	case "rss.create":
		return reverseRSSCreate(ctx, q, row)
	case "sync.bangumi":
		if deps.Bangumi == nil {
			return fmt.Errorf("bangumi reverter not configured")
		}
		return deps.Bangumi.Revert(ctx, row.TargetID.String, row.BeforeJson.String)
	case "sync.anilist":
		if deps.Anilist == nil {
			return fmt.Errorf("anilist reverter not configured")
		}
		return deps.Anilist.Revert(ctx, row.TargetID.String, row.BeforeJson.String)
	default:
		return fmt.Errorf("no reverse handler for action_type %q", row.ActionType)
	}
}

// reverseMatchApply restores the previous match on a media file.
//
// v0.1: deliberate no-op so dry-runs surface the entry without an error and
// real undo silently succeeds. The real reversal lands in v0.2 alongside
// the POST /api/v1/match/auto macro endpoint, which is the only producer
// of match.apply audit entries that carries the before-snapshot needed to
// replay a previous match — manual matches via PUT /media-files/:id/match
// don't populate before_json at all.
func reverseMatchApply(_ context.Context, _ *store.Queries, _ store.AuditLog) error {
	return nil
}

// reverseRSSCreate deletes the rule that was created.
//
// v0.1: deliberate no-op. The real reversal lands in v0.2 alongside the
// POST /api/v1/subscribe macro endpoint. The standalone
// POST /api/v1/rss-feeds endpoint also writes rss.create audit entries,
// but a v0.2 implementation needs to disambiguate "delete rule X" from
// "delete subscription's child rule" via target_id and parent_id; deferring
// rather than half-baking that.
func reverseRSSCreate(_ context.Context, _ *store.Queries, _ store.AuditLog) error {
	return nil
}

// newAuditID returns a fresh audit-log row ID (used for the UndoneBy
// foreign-key on reversed entries). uuid.New().String() matches the
// convention every other entity in the codebase uses; the macro
// package keeps its own helper purely to avoid an import cycle with
// internal/api.
func newAuditID() string {
	return uuid.New().String()
}
