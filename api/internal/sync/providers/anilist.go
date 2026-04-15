package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	milmilsync "github.com/milmil/api/internal/sync"
)

const defaultAniListURL = "https://graphql.anilist.co"

type AniList struct {
	http    *http.Client
	baseURL string
}

func NewAniList(h *http.Client, url string) *AniList {
	if h == nil {
		h = http.DefaultClient
	}
	if url == "" {
		url = defaultAniListURL
	}
	return &AniList{http: h, baseURL: url}
}

func (p *AniList) Name() milmilsync.ProviderName { return milmilsync.ProviderAniList }

func (p *AniList) Push(ctx context.Context, tok string, op milmilsync.SyncOp, ids milmilsync.ExternalIDs) error {
	if ids.AniList == 0 {
		return errors.New("anilist: no anilist_id on anime")
	}
	mutation := `mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
        SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) { id progress }
    }`
	body, _ := json.Marshal(map[string]any{
		"query": mutation,
		"variables": map[string]any{
			"mediaId":  ids.AniList,
			"progress": op.Progress,
			"status":   mapAniListStatus(op.Status),
		},
	})
	return p.doGraphQL(ctx, tok, body)
}

func (p *AniList) FetchList(ctx context.Context, tok string) ([]milmilsync.RemoteEntry, error) {
	query := `query { MediaListCollection(userId: null, type: ANIME) {
        lists { entries { mediaId status progress updatedAt } }
    } }`
	body, _ := json.Marshal(map[string]string{"query": query})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("anilist fetch: %d %s", resp.StatusCode, raw)
	}
	var out struct {
		Data struct {
			MediaListCollection struct {
				Lists []struct {
					Entries []struct {
						MediaID   int64  `json:"mediaId"`
						Status    string `json:"status"`
						Progress  int    `json:"progress"`
						UpdatedAt int64  `json:"updatedAt"`
					} `json:"entries"`
				} `json:"lists"`
			} `json:"MediaListCollection"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	var entries []milmilsync.RemoteEntry
	for _, l := range out.Data.MediaListCollection.Lists {
		for _, e := range l.Entries {
			entries = append(entries, milmilsync.RemoteEntry{
				ProviderAnimeID: e.MediaID,
				Status:          unmapAniListStatus(e.Status),
				Progress:        e.Progress,
				UpdatedAt:       time.Unix(e.UpdatedAt, 0),
			})
		}
	}
	return entries, nil
}

func (p *AniList) doGraphQL(ctx context.Context, tok string, body []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.http.Do(req)
	if err != nil {
		return &milmilsync.TransientError{Err: err}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	switch resp.StatusCode {
	case 200:
		return nil
	case 429:
		secs, _ := strconv.Atoi(resp.Header.Get("Retry-After"))
		if secs <= 0 {
			secs = 60
		}
		return &milmilsync.TransientError{
			Err:        fmt.Errorf("anilist rate-limited"),
			RetryAfter: time.Duration(secs) * time.Second,
		}
	case 401, 403:
		return fmt.Errorf("anilist auth: %s", raw)
	case 500, 502, 503, 504:
		return &milmilsync.TransientError{Err: fmt.Errorf("anilist %d: %s", resp.StatusCode, raw)}
	default:
		return fmt.Errorf("anilist: %d: %s", resp.StatusCode, raw)
	}
}

func mapAniListStatus(s milmilsync.WatchStatus) string {
	switch s {
	case milmilsync.StatusWatching:
		return "CURRENT"
	case milmilsync.StatusCompleted:
		return "COMPLETED"
	case milmilsync.StatusPlanning:
		return "PLANNING"
	case milmilsync.StatusRepeating:
		return "REPEATING"
	case milmilsync.StatusPaused:
		return "PAUSED"
	case milmilsync.StatusDropped:
		return "DROPPED"
	default:
		return "CURRENT"
	}
}

func unmapAniListStatus(s string) milmilsync.WatchStatus {
	switch s {
	case "CURRENT":
		return milmilsync.StatusWatching
	case "COMPLETED":
		return milmilsync.StatusCompleted
	case "PLANNING":
		return milmilsync.StatusPlanning
	case "REPEATING":
		return milmilsync.StatusRepeating
	case "PAUSED":
		return milmilsync.StatusPaused
	case "DROPPED":
		return milmilsync.StatusDropped
	default:
		return milmilsync.StatusNone
	}
}
