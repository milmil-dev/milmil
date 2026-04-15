package duplicates

import (
	"context"
	"database/sql"
	"time"

	"github.com/milmil/api/internal/matcher/fileparse"
	"github.com/milmil/api/internal/store"
)

// FileInfo is the per-file projection returned alongside each DupSet.
type FileInfo struct {
	ID         string    `json:"id"`
	Path       string    `json:"path"`
	Filename   string    `json:"filename"`
	SizeBytes  int64     `json:"size_bytes"`
	Resolution int       `json:"resolution"`
	Subgroup   string    `json:"subgroup"`
	ModTime    time.Time `json:"mod_time"`
}

// DupSet groups all media files belonging to the same episode when there are
// two or more of them.
type DupSet struct {
	AnimeID       string     `json:"anime_id"`
	AnimeTitle    string     `json:"anime_title,omitempty"`
	EpisodeID     string     `json:"episode_id"`
	EpisodeNumber float64    `json:"episode_number"`
	PreferredID   string     `json:"preferred_id"`
	ManuallySet   bool       `json:"manually_set"`
	Files         []FileInfo `json:"files"`
	WastedBytes   int64      `json:"wasted_bytes"`
}

// FindAnimeDuplicates returns DupSets for every episode of animeID that has
// 2+ media files.
func FindAnimeDuplicates(ctx context.Context, q *store.Queries, animeID string) ([]DupSet, error) {
	rows, err := q.ListDuplicateEpisodesByAnime(ctx, animeID)
	if err != nil {
		return nil, err
	}
	out := make([]DupSet, 0, len(rows))
	for _, row := range rows {
		files, err := loadFilesByEpisode(ctx, q, row.EpisodeID)
		if err != nil {
			return nil, err
		}
		set := DupSet{
			AnimeID:       animeID,
			EpisodeID:     row.EpisodeID,
			EpisodeNumber: row.EpisodeNumber,
			ManuallySet:   row.PreferredManuallySet == 1,
			Files:         files,
		}
		if row.PreferredMediaFileID.Valid {
			set.PreferredID = row.PreferredMediaFileID.String
		}
		set.WastedBytes = wastedBytes(files, set.PreferredID)
		out = append(out, set)
	}
	return out, nil
}

// FindLibraryDuplicates returns DupSets for every episode within libraryID
// that has 2+ media files, grouped across all anime in the library.
func FindLibraryDuplicates(ctx context.Context, q *store.Queries, libraryID string) ([]DupSet, error) {
	rows, err := q.ListDuplicateEpisodesByLibrary(ctx, sql.NullString{String: libraryID, Valid: libraryID != ""})
	if err != nil {
		return nil, err
	}
	out := make([]DupSet, 0, len(rows))
	for _, row := range rows {
		files, err := loadFilesByEpisode(ctx, q, row.EpisodeID)
		if err != nil {
			return nil, err
		}
		set := DupSet{
			AnimeID:       row.AnimeID,
			AnimeTitle:    row.Title,
			EpisodeID:     row.EpisodeID,
			EpisodeNumber: row.EpisodeNumber,
			ManuallySet:   row.PreferredManuallySet == 1,
			Files:         files,
		}
		if row.PreferredMediaFileID.Valid {
			set.PreferredID = row.PreferredMediaFileID.String
		}
		set.WastedBytes = wastedBytes(files, set.PreferredID)
		out = append(out, set)
	}
	return out, nil
}

func loadFilesByEpisode(ctx context.Context, q *store.Queries, episodeID string) ([]FileInfo, error) {
	rows, err := q.ListMediaFilesByEpisode(ctx, sql.NullString{String: episodeID, Valid: true})
	if err != nil {
		return nil, err
	}
	out := make([]FileInfo, 0, len(rows))
	for _, r := range rows {
		parsed := fileparse.Parse(r.Filename)
		modTime := time.Time{}
		if t, err := time.Parse(time.RFC3339, r.UpdatedAt); err == nil {
			modTime = t
		}
		out = append(out, FileInfo{
			ID:         r.ID,
			Path:       r.Path,
			Filename:   r.Filename,
			SizeBytes:  r.SizeBytes,
			Resolution: parsed.Resolution,
			Subgroup:   parsed.SubGroup,
			ModTime:    modTime,
		})
	}
	return out, nil
}

func wastedBytes(files []FileInfo, preferredID string) int64 {
	if preferredID == "" {
		return 0
	}
	var total int64
	for _, f := range files {
		if f.ID != preferredID {
			total += f.SizeBytes
		}
	}
	return total
}

// toRankable adapts FileInfo slices to RankableFile for Rank().
func toRankable(files []FileInfo) []RankableFile {
	out := make([]RankableFile, len(files))
	for i, f := range files {
		out[i] = RankableFile{
			ID:         f.ID,
			Path:       f.Path,
			SizeBytes:  f.SizeBytes,
			Resolution: f.Resolution,
			Subgroup:   f.Subgroup,
			ModTime:    f.ModTime,
		}
	}
	return out
}
