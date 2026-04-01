-- name: ListHotTags :many
SELECT id, name, category, count, created_at
FROM hot_tags
ORDER BY count DESC, name ASC;

-- name: ListHotTagsByCategory :many
SELECT id, name, category, count, created_at
FROM hot_tags
WHERE category = ?
ORDER BY count DESC, name ASC;

-- name: SearchHotTags :many
SELECT id, name, category, count, created_at
FROM hot_tags
WHERE name LIKE '%' || ? || '%'
ORDER BY count DESC, name ASC
LIMIT 20;
