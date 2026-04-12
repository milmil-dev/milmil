package store

import "context"

const listRecentCompletedDownloads = `
SELECT id, gid, url, name, status, total_bytes, completed_bytes, speed_bytes, save_dir, rule_id, created_at, updated_at, bangumi_id, library_id
FROM downloads WHERE status = 'complete' AND updated_at > ? ORDER BY updated_at DESC
`

// ListRecentCompletedDownloads returns downloads completed after the given cutoff (RFC3339).
func (q *Queries) ListRecentCompletedDownloads(ctx context.Context, cutoff string) ([]Download, error) {
	rows, err := q.db.QueryContext(ctx, listRecentCompletedDownloads, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Download{}
	for rows.Next() {
		var i Download
		if err := rows.Scan(
			&i.ID, &i.Gid, &i.Url, &i.Name, &i.Status,
			&i.TotalBytes, &i.CompletedBytes, &i.SpeedBytes,
			&i.SaveDir, &i.RuleID, &i.CreatedAt, &i.UpdatedAt,
			&i.BangumiID, &i.LibraryID,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, rows.Err()
}

const listErrorDownloads = `
SELECT id, gid, url, name, status, total_bytes, completed_bytes, speed_bytes, save_dir, rule_id, created_at, updated_at, bangumi_id, library_id
FROM downloads WHERE status = 'error' ORDER BY updated_at DESC
`

// ListErrorDownloads returns all downloads in error state.
func (q *Queries) ListErrorDownloads(ctx context.Context) ([]Download, error) {
	rows, err := q.db.QueryContext(ctx, listErrorDownloads)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Download{}
	for rows.Next() {
		var i Download
		if err := rows.Scan(
			&i.ID, &i.Gid, &i.Url, &i.Name, &i.Status,
			&i.TotalBytes, &i.CompletedBytes, &i.SpeedBytes,
			&i.SaveDir, &i.RuleID, &i.CreatedAt, &i.UpdatedAt,
			&i.BangumiID, &i.LibraryID,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, rows.Err()
}
