package worker

import (
	"context"
	"log/slog"
	"strconv"

	"github.com/milmil/api/internal/integration/aria2"
	"github.com/milmil/api/internal/scanner"
	"github.com/milmil/api/internal/store"
	"github.com/riverqueue/river"
)

// DownloadSyncArgs is the job payload for syncing download status with Aria2.
type DownloadSyncArgs struct{}

func (DownloadSyncArgs) Kind() string { return "download_sync" }

// DownloadSyncWorker polls Aria2 for status updates and triggers library scans on completion.
type DownloadSyncWorker struct {
	river.WorkerDefaults[DownloadSyncArgs]
	queries *store.Queries
	aria2   aria2.Client
	scanner *scanner.Scanner
}

func (w *DownloadSyncWorker) Work(ctx context.Context, _ *river.Job[DownloadSyncArgs]) error {
	// Get all non-terminal downloads from DB
	downloads, err := w.queries.ListActiveDownloads(ctx)
	if err != nil {
		slog.Error("download_sync: list active", "err", err)
		return nil
	}
	if len(downloads) == 0 {
		return nil
	}

	for _, dl := range downloads {
		status, err := w.aria2.GetStatus(ctx, dl.Gid)
		if err != nil {
			continue
		}

		total, _ := strconv.ParseInt(status.TotalLength, 10, 64)
		completed, _ := strconv.ParseInt(status.CompletedLength, 10, 64)
		speed, _ := strconv.ParseInt(status.DownloadSpeed, 10, 64)

		newStatus := mapAria2Status(status.Status)
		if newStatus == dl.Status && total == dl.TotalBytes && completed == dl.CompletedBytes {
			continue // No change
		}

		_ = w.queries.UpdateDownloadStatus(ctx, store.UpdateDownloadStatusParams{
			Status:         newStatus,
			TotalBytes:     total,
			CompletedBytes: completed,
			SpeedBytes:     speed,
			Gid:            dl.Gid,
		})

		// Trigger library scan when download completes
		if newStatus == "complete" && dl.Status != "complete" && dl.LibraryID.Valid {
			slog.Info("download_sync: download complete, triggering scan",
				"name", dl.Name, "library_id", dl.LibraryID.String)
			go w.triggerLibraryScan(ctx, dl.LibraryID.String)
		}
	}

	return nil
}

func (w *DownloadSyncWorker) triggerLibraryScan(ctx context.Context, libraryID string) {
	lib, err := w.queries.GetLibrary(ctx, libraryID)
	if err != nil {
		slog.Error("download_sync: get library for scan", "err", err)
		return
	}

	// Get source config for the library
	configJSON := "{}"
	if lib.SourceType == "local" {
		configJSON = "{}"
	}

	if err := w.scanner.ScanLibrary(ctx, lib, configJSON); err != nil {
		slog.Error("download_sync: scan library", "library", lib.Name, "err", err)
	} else {
		slog.Info("download_sync: library scan complete", "library", lib.Name)
	}
}

func mapAria2Status(s string) string {
	switch s {
	case "active":
		return "active"
	case "waiting":
		return "waiting"
	case "paused":
		return "paused"
	case "complete":
		return "complete"
	case "error":
		return "error"
	case "removed":
		return "removed"
	default:
		return s
	}
}
