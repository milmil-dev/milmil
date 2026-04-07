package worker

import (
	"context"
	"log/slog"

	"github.com/milmil/api/internal/cache"
	"github.com/milmil/api/internal/downloader"
	"github.com/milmil/api/internal/integration/tmdb"
	"github.com/milmil/api/internal/matcher"
	"github.com/milmil/api/internal/notification"
	"github.com/milmil/api/internal/resolver"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/store"
	"github.com/milmil/api/internal/ws"
)

// downloadProgress is the per-download payload broadcast over WebSocket.
type downloadProgress struct {
	GID            string `json:"gid"`
	Status         string `json:"status"`
	TotalBytes     int64  `json:"total_bytes"`
	CompletedBytes int64  `json:"completed_bytes"`
	SpeedBytes     int64  `json:"speed_bytes"`
}

// DownloadSyncWorker polls the download engine for status updates and triggers
// the full scan -> match -> resolve chain on completion.
type DownloadSyncWorker struct {
	queries    *store.Queries
	downloader downloader.Manager
	scanner    *scanner.Scanner
	matcher    *matcher.Matcher
	resolver   *resolver.Resolver
	tmdb       tmdb.Client
	cache      cache.Cache
	notifier   *notification.Service
	wsHub      *ws.Hub
}

func (w *DownloadSyncWorker) Run(ctx context.Context) {
	downloads, err := w.queries.ListActiveDownloads(ctx)
	if err != nil {
		slog.Error("download_sync: list active", "err", err)
		return
	}
	if len(downloads) == 0 {
		return
	}

	// Collect progress for all active downloads to broadcast in one WS event
	progressBatch := make([]downloadProgress, 0, len(downloads))

	for _, dl := range downloads {
		status, err := w.downloader.Status(ctx, dl.Gid)
		if err != nil {
			// GID no longer exists in engine — mark as removed
			_ = w.queries.UpdateDownloadStatus(ctx, store.UpdateDownloadStatusParams{
				Status:         "removed",
				TotalBytes:     dl.TotalBytes,
				CompletedBytes: dl.CompletedBytes,
				SpeedBytes:     0,
				Gid:            dl.Gid,
			})
			progressBatch = append(progressBatch, downloadProgress{
				GID: dl.Gid, Status: "removed",
				TotalBytes: dl.TotalBytes, CompletedBytes: dl.CompletedBytes,
			})
			continue
		}

		newStatus := status.Status

		// Always collect progress for WS broadcast
		progressBatch = append(progressBatch, downloadProgress{
			GID:            dl.Gid,
			Status:         newStatus,
			TotalBytes:     status.TotalBytes,
			CompletedBytes: status.CompletedBytes,
			SpeedBytes:     status.SpeedBytes,
		})

		// Skip DB write if nothing meaningful changed (non-active unchanged)
		if newStatus == dl.Status && newStatus != "active" &&
			status.TotalBytes == dl.TotalBytes && status.CompletedBytes == dl.CompletedBytes {
			continue
		}

		_ = w.queries.UpdateDownloadStatus(ctx, store.UpdateDownloadStatusParams{
			Status:         newStatus,
			TotalBytes:     status.TotalBytes,
			CompletedBytes: status.CompletedBytes,
			SpeedBytes:     status.SpeedBytes,
			Gid:            dl.Gid,
		})

		if newStatus == "complete" && dl.Status != "complete" {
			w.notifier.Send(ctx, "download.completed", "Download Complete", dl.Name, "success",
				map[string]any{"download_id": dl.ID, "gid": dl.Gid})
		}
		if newStatus == "error" && dl.Status != "error" {
			w.notifier.Send(ctx, "download.failed", "Download Failed", dl.Name, "error",
				map[string]any{"download_id": dl.ID, "gid": dl.Gid})
		}

		// Trigger full scan -> match -> resolve chain when download completes
		if newStatus == "complete" && dl.Status != "complete" {
			libraryID := dl.LibraryID
			// Fall back to rule's library_id if download doesn't have one directly
			if !libraryID.Valid && dl.RuleID.Valid {
				if rule, ruleErr := w.queries.GetDownloadRule(ctx, dl.RuleID.String); ruleErr == nil && rule.LibraryID.Valid {
					libraryID = rule.LibraryID
				}
			}
			if libraryID.Valid {
				slog.Info("download_sync: download complete, triggering full pipeline",
					"name", dl.Name, "library_id", libraryID.String)
				go w.triggerFullPipeline(libraryID.String)
			}
		}
	}

	// Broadcast all progress in a single WS event
	if w.wsHub != nil && len(progressBatch) > 0 {
		w.wsHub.Broadcast(ws.Event{
			Type: "download:progress",
			Data: progressBatch,
		})
	}
}

// triggerFullPipeline runs scan -> match -> resolve -> enrich for a library.
func (w *DownloadSyncWorker) triggerFullPipeline(libraryID string) {
	ctx := context.Background()

	lib, err := w.queries.GetLibrary(ctx, libraryID)
	if err != nil {
		slog.Error("download_sync: get library", "err", err)
		return
	}

	// Step 1: Scan — discover new files on disk
	configJSON := "{}"
	if err := w.scanner.ScanLibrary(ctx, lib, configJSON); err != nil {
		slog.Error("download_sync: scan library", "library", lib.Name, "err", err)
		w.notifier.Send(ctx, "system.error", "Library Scan Failed", err.Error(), "error",
			map[string]any{"library_name": lib.Name, "worker": "download_sync"})
		return
	}
	slog.Info("download_sync: scan complete", "library", lib.Name)

	// Step 2: Match — identify anime/episode for each file
	if w.matcher != nil {
		summary, err := w.matcher.MatchLibrary(ctx, libraryID)
		if err != nil {
			slog.Error("download_sync: match failed", "library", lib.Name, "err", err)
		} else {
			slog.Info("download_sync: match complete", "library", lib.Name,
				"matched", summary.Matched, "unmatched", summary.Unmatched,
				"by_dandanplay", summary.ByDandanplay, "by_bangumi", summary.ByBangumi, "by_tmdb", summary.ByTMDB)
		}
	}

	// Step 3: Resolve — create anime/episode records and link files
	if w.resolver != nil {
		if rs, err := w.resolver.ResolveLibrary(ctx, libraryID); err != nil {
			slog.Error("download_sync: ResolveLibrary failed", "library", lib.Name, "err", err)
		} else {
			slog.Info("download_sync: ResolveLibrary done", "library", lib.Name,
				"anime_created", rs.AnimeCreated, "episodes_created", rs.EpisodesCreated, "files_linked", rs.FilesLinked)
		}

		if rs, err := w.resolver.ResolveBangumiMatched(ctx, libraryID); err != nil {
			slog.Error("download_sync: ResolveBangumiMatched failed", "library", lib.Name, "err", err)
		} else {
			slog.Info("download_sync: ResolveBangumiMatched done", "library", lib.Name,
				"anime_created", rs.AnimeCreated, "episodes_created", rs.EpisodesCreated, "files_linked", rs.FilesLinked)
		}
	}

	// Step 4: Enrich — add Chinese metadata from TMDB
	if w.tmdb != nil && w.cache != nil {
		enriched, err := matcher.EnrichEpisodesFromTMDB(ctx, w.queries, w.tmdb, w.cache, libraryID)
		if err != nil {
			slog.Error("download_sync: TMDB enrichment failed", "library", lib.Name, "err", err)
		} else if enriched > 0 {
			slog.Info("download_sync: TMDB enrichment done", "library", lib.Name, "episodes_enriched", enriched)
		}
	}

	slog.Info("download_sync: full pipeline complete", "library", lib.Name)
	w.notifier.Send(ctx, "library.scan_complete", "Library Scan Complete", lib.Name, "info",
		map[string]any{"library_id": libraryID, "library_name": lib.Name})
}
