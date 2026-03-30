-- name: ListPlayableEpisodes :many
SELECT
  e.id AS episode_id,
  e.episode_number AS sort,
  e.title AS episode_title,
  e.title_zh AS episode_title_zh,
  e.air_date,
  e.synopsis,
  e.synopsis_zh,
  e.thumbnail_url AS image,
  mf.id AS media_file_id,
  mf.filename AS media_filename,
  mf.size_bytes AS media_size_bytes,
  mf.width AS media_width,
  mf.height AS media_height,
  mf.video_codec AS media_video_codec,
  mf.audio_codec AS media_audio_codec,
  wp.position_seconds,
  wp.duration_seconds AS progress_duration,
  wp.completed
FROM episodes e
LEFT JOIN media_files mf ON mf.episode_id = e.id
LEFT JOIN watch_progress wp ON wp.episode_id = e.id
WHERE e.anime_id = sqlc.arg(anime_id)
ORDER BY e.episode_number ASC;
