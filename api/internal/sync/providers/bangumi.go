package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	milmilsync "github.com/milmil/api/internal/sync"
)

const defaultBangumiURL = "https://api.bgm.tv"

type Bangumi struct {
	http    *http.Client
	baseURL string
}

func NewBangumi(h *http.Client, url string) *Bangumi {
	if h == nil {
		h = http.DefaultClient
	}
	if url == "" {
		url = defaultBangumiURL
	}
	return &Bangumi{http: h, baseURL: url}
}

func (p *Bangumi) Name() milmilsync.ProviderName { return milmilsync.ProviderBangumi }

func (p *Bangumi) Push(ctx context.Context, tok string, op milmilsync.SyncOp, ids milmilsync.ExternalIDs) error {
	if ids.Bangumi == 0 {
		return errors.New("bangumi: no bangumi_id")
	}
	for _, epID := range ids.BangumiEpisodeIDs {
		if err := p.putEpisode(ctx, tok, epID); err != nil {
			return err
		}
	}
	return p.patchCollection(ctx, tok, ids.Bangumi, op.Status)
}

func (p *Bangumi) putEpisode(ctx context.Context, tok string, epID int64) error {
	body := bytes.NewBufferString(`{"type":2}`)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut,
		fmt.Sprintf("%s/v0/users/-/collections/-/episodes/%d", p.baseURL, epID), body)
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
	return classifyBangumiStatus(resp, fmt.Sprintf("episode %d", epID))
}

func (p *Bangumi) patchCollection(ctx context.Context, tok string, subjectID int64, status milmilsync.WatchStatus) error {
	payload, _ := json.Marshal(map[string]any{"type": mapBangumiStatus(status)})
	req, err := http.NewRequestWithContext(ctx, http.MethodPatch,
		fmt.Sprintf("%s/v0/users/-/collections/%d", p.baseURL, subjectID), bytes.NewReader(payload))
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
	return classifyBangumiStatus(resp, "collection")
}

func classifyBangumiStatus(resp *http.Response, what string) error {
	switch {
	case resp.StatusCode < 300:
		return nil
	case resp.StatusCode == 404:
		return nil // 404 on episode = harmless (not in user's collection yet)
	case resp.StatusCode == 429:
		return &milmilsync.TransientError{
			Err:        fmt.Errorf("bangumi rate-limited: %s", what),
			RetryAfter: 60 * time.Second,
		}
	case resp.StatusCode == 401 || resp.StatusCode == 403:
		return fmt.Errorf("bangumi auth: %d", resp.StatusCode)
	case resp.StatusCode >= 500:
		return &milmilsync.TransientError{Err: fmt.Errorf("bangumi %s: %d", what, resp.StatusCode)}
	default:
		return fmt.Errorf("bangumi %s: %d", what, resp.StatusCode)
	}
}

func (p *Bangumi) FetchList(ctx context.Context, tok string) ([]milmilsync.RemoteEntry, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		p.baseURL+"/v0/users/-/collections?subject_type=2&limit=100", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	resp, err := p.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("bangumi fetch: %d %s", resp.StatusCode, raw)
	}
	var out struct {
		Data []struct {
			SubjectID int64  `json:"subject_id"`
			Type      int    `json:"type"`
			EpStatus  int    `json:"ep_status"`
			UpdatedAt string `json:"updated_at"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	entries := make([]milmilsync.RemoteEntry, 0, len(out.Data))
	for _, d := range out.Data {
		u, _ := time.Parse(time.RFC3339, d.UpdatedAt)
		entries = append(entries, milmilsync.RemoteEntry{
			ProviderAnimeID: d.SubjectID,
			Status:          unmapBangumiStatus(d.Type),
			Progress:        d.EpStatus,
			UpdatedAt:       u,
		})
	}
	return entries, nil
}

// Bangumi has no REPEATING state; repeating maps to "do" (in-progress).
// This is one-way lossy by design.
func mapBangumiStatus(s milmilsync.WatchStatus) int {
	switch s {
	case milmilsync.StatusPlanning:
		return 1
	case milmilsync.StatusCompleted:
		return 2
	case milmilsync.StatusWatching, milmilsync.StatusRepeating:
		return 3
	case milmilsync.StatusPaused:
		return 4
	case milmilsync.StatusDropped:
		return 5
	default:
		return 3
	}
}

func unmapBangumiStatus(t int) milmilsync.WatchStatus {
	switch t {
	case 1:
		return milmilsync.StatusPlanning
	case 2:
		return milmilsync.StatusCompleted
	case 3:
		return milmilsync.StatusWatching
	case 4:
		return milmilsync.StatusPaused
	case 5:
		return milmilsync.StatusDropped
	default:
		return milmilsync.StatusNone
	}
}
