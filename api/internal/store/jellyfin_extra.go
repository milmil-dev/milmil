package store

import "context"

const listMediaFilesByEpisodeID = `
SELECT id, episode_id, library_id, path, filename, size_bytes, duration_seconds,
       container_format, video_codec, audio_codec, width, height, file_hash,
       dandanplay_episode_id, match_status, video_tracks, audio_tracks, subtitle_tracks,
       created_at, updated_at, dandanplay_anime_id, bangumi_subject_id, bangumi_episode_id
FROM media_files
WHERE episode_id = ?
ORDER BY filename ASC
`

// ListMediaFilesByEpisodeID returns all media files linked to the given episode.
func (q *Queries) ListMediaFilesByEpisodeID(ctx context.Context, episodeID string) ([]MediaFile, error) {
	rows, err := q.db.QueryContext(ctx, listMediaFilesByEpisodeID, episodeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []MediaFile{}
	for rows.Next() {
		var i MediaFile
		if err := rows.Scan(
			&i.ID, &i.EpisodeID, &i.LibraryID, &i.Path, &i.Filename,
			&i.SizeBytes, &i.DurationSeconds, &i.ContainerFormat,
			&i.VideoCodec, &i.AudioCodec, &i.Width, &i.Height,
			&i.FileHash, &i.DandanplayEpisodeID, &i.MatchStatus,
			&i.VideoTracks, &i.AudioTracks, &i.SubtitleTracks,
			&i.CreatedAt, &i.UpdatedAt, &i.DandanplayAnimeID,
			&i.BangumiSubjectID, &i.BangumiEpisodeID,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, rows.Err()
}
