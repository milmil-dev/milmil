package renamer

import (
	"context"
	"path/filepath"

	"github.com/milmil/api/internal/store"
)

// PlanStatus classifies what Apply should do with a given plan entry.
type PlanStatus string

const (
	StatusOK                PlanStatus = "ok"
	StatusSkipSameAsCurrent PlanStatus = "skip_same_as_current"
	StatusSkipCollision     PlanStatus = "skip_collision"
	StatusError             PlanStatus = "error"
)

// PlanResult is the per-file outcome of rendering the template. Serialised to
// JSON for the plan preview endpoint.
type PlanResult struct {
	MediaFileID string     `json:"media_file_id"`
	OldPath     string     `json:"old_path"`
	NewPath     string     `json:"new_path"`
	Status      PlanStatus `json:"status"`
	Error       string     `json:"error,omitempty"`
}

// FileContext is the bundle of records needed to render the template for one
// media file.
type FileContext struct {
	MediaFile store.MediaFile
	Anime     store.Anime
	Episode   store.Episode
}

// Stater is the minimum filesystem surface Plan needs to detect target
// collisions. The signature uses `any` so both storage.Provider (returning
// os.FileInfo) and test fakes can satisfy it via a tiny adapter.
type Stater interface {
	Stat(path string) (any, error)
}

// Plan renders the template for each FileContext, clamps the result to the
// library root, and classifies each entry (OK, same-as-current, collision, or
// error). Plan itself performs no I/O beyond the optional Stat probe.
func Plan(ctx context.Context, ctxs []FileContext, compiled *Compiled, libraryRoot string, stat Stater) []PlanResult {
	out := make([]PlanResult, 0, len(ctxs))
	for _, c := range ctxs {
		pr := PlanResult{MediaFileID: c.MediaFile.ID, OldPath: c.MediaFile.Path}
		tc := BuildVariables(c.MediaFile, c.Anime, c.Episode)
		rendered, err := compiled.Execute(tc)
		if err != nil {
			pr.Status = StatusError
			pr.Error = err.Error()
			out = append(out, pr)
			continue
		}
		target, err := ClampToLibraryRoot(libraryRoot, rendered)
		if err != nil {
			pr.Status = StatusError
			pr.Error = err.Error()
			out = append(out, pr)
			continue
		}
		pr.NewPath = target
		if filepath.Clean(pr.OldPath) == filepath.Clean(target) {
			pr.Status = StatusSkipSameAsCurrent
			out = append(out, pr)
			continue
		}
		if stat != nil {
			if _, err := stat.Stat(target); err == nil {
				pr.Status = StatusSkipCollision
				out = append(out, pr)
				continue
			}
		}
		pr.Status = StatusOK
		out = append(out, pr)
	}
	return out
}
