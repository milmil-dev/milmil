package sync

import (
	"context"
	"errors"
	"fmt"
	stdsync "sync"
	"testing"
	"time"
)

// fakeProvider is a minimal Provider used across worker and import tests.
type fakeProvider struct {
	name     ProviderName
	pushErr  error
	pushes   int
	fetched  []RemoteEntry
	fetchErr error
}

func (p *fakeProvider) Name() ProviderName { return p.name }

func (p *fakeProvider) Push(ctx context.Context, tok string, op SyncOp, ids ExternalIDs) error {
	p.pushes++
	return p.pushErr
}

func (p *fakeProvider) FetchList(ctx context.Context, tok string) ([]RemoteEntry, error) {
	return p.fetched, p.fetchErr
}

func staticTokenLoader() TokenLoader {
	return func(_ context.Context, _ string, _ ProviderName) (string, error) { return "tok", nil }
}

func TestWorkerMarksRowCompleted(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 12, 42, 0)
	fp := &fakeProvider{name: ProviderAniList}
	s := NewService(q, db, []Provider{fp}, staticTokenLoader())

	if err := s.queue.Enqueue(context.Background(), "u", ProviderAniList, "a1", SyncOp{
		Kind: KindProgress, AnimeID: "a1", Progress: 1,
	}); err != nil {
		t.Fatal(err)
	}
	s.Drain(context.Background(), 10)
	if fp.pushes != 1 {
		t.Errorf("expected 1 push, got %d", fp.pushes)
	}
	rows, _ := q.ListReadySyncOps(context.Background(), 10)
	if len(rows) != 0 {
		t.Errorf("row not cleared: %+v", rows)
	}
}

// TestWorkerRateLimitGroupingDefersRest verifies A3 — a single 429 from the
// first row defers the remaining rows in the same (user, provider) group
// without any extra network calls.
func TestWorkerRateLimitGroupingDefersRest(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	for i := 0; i < 5; i++ {
		id := fmt.Sprintf("a%d", i+1)
		mustInsertAnime(t, q, id, 12, int64(100+i), 0)
	}

	fp := &fakeProvider{
		name:    ProviderAniList,
		pushErr: &TransientError{Err: errors.New("rate-limited"), RetryAfter: 42 * time.Second},
	}
	s := NewService(q, db, []Provider{fp}, staticTokenLoader())

	for i := 0; i < 5; i++ {
		id := fmt.Sprintf("a%d", i+1)
		if err := s.queue.Enqueue(context.Background(), "u", ProviderAniList, id,
			SyncOp{Kind: KindProgress, AnimeID: id, Progress: 1}); err != nil {
			t.Fatal(err)
		}
	}

	s.Drain(context.Background(), 10)

	if fp.pushes != 1 {
		t.Errorf("expected exactly 1 push before rate-limit group-defer, got %d", fp.pushes)
	}
	rows, _ := q.ListReadySyncOps(context.Background(), 10)
	if len(rows) != 0 {
		t.Errorf("rate-limited rows should be deferred, got %d still ready", len(rows))
	}
}

func TestWorkerTransientErrorReschedules(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 12, 42, 0)
	fp := &fakeProvider{
		name:    ProviderAniList,
		pushErr: &TransientError{Err: errors.New("boom")},
	}
	s := NewService(q, db, []Provider{fp}, staticTokenLoader())

	if err := s.queue.Enqueue(context.Background(), "u", ProviderAniList, "a1",
		SyncOp{Kind: KindProgress, AnimeID: "a1", Progress: 1}); err != nil {
		t.Fatal(err)
	}
	s.Drain(context.Background(), 10)

	rows, _ := q.ListReadySyncOps(context.Background(), 10)
	if len(rows) != 0 {
		t.Errorf("row should be deferred, not ready: %+v", rows)
	}
}

// TestWorkerFatalErrorCompletesRow verifies that a non-transient push error
// marks the row completed (with last_error set) so it never retries.
func TestWorkerFatalErrorCompletesRow(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 12, 42, 0)
	fp := &fakeProvider{name: ProviderAniList, pushErr: errors.New("permanent")}
	s := NewService(q, db, []Provider{fp}, staticTokenLoader())

	if err := s.queue.Enqueue(context.Background(), "u", ProviderAniList, "a1",
		SyncOp{Kind: KindProgress, AnimeID: "a1", Progress: 1}); err != nil {
		t.Fatal(err)
	}
	s.Drain(context.Background(), 10)

	rows, _ := q.ListReadySyncOps(context.Background(), 10)
	if len(rows) != 0 {
		t.Errorf("fatal-failed row should not remain ready, got %d", len(rows))
	}
}

// TestWorkerOverlapPrevented verifies A6 — two concurrent Drain calls result
// in exactly one push (the second skips via TryLock).
func TestWorkerOverlapPrevented(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	mustInsertAnime(t, q, "a1", 12, 42, 0)
	// Hold the provider for a tick so the second Drain actually races the first.
	fp := &slowFakeProvider{name: ProviderAniList, delay: 50 * time.Millisecond}
	s := NewService(q, db, []Provider{fp}, staticTokenLoader())

	if err := s.queue.Enqueue(context.Background(), "u", ProviderAniList, "a1",
		SyncOp{Kind: KindProgress, AnimeID: "a1", Progress: 1}); err != nil {
		t.Fatal(err)
	}

	var wg stdsync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); s.Drain(context.Background(), 10) }()
	go func() { defer wg.Done(); s.Drain(context.Background(), 10) }()
	wg.Wait()

	if fp.pushes != 1 {
		t.Errorf("expected 1 push (overlap prevented), got %d", fp.pushes)
	}
}

// slowFakeProvider makes the overlap test non-flaky by ensuring the first
// Drain is still processing when the second one starts.
type slowFakeProvider struct {
	name   ProviderName
	delay  time.Duration
	pushes int
}

func (p *slowFakeProvider) Name() ProviderName { return p.name }
func (p *slowFakeProvider) Push(ctx context.Context, tok string, op SyncOp, ids ExternalIDs) error {
	time.Sleep(p.delay)
	p.pushes++
	return nil
}
func (p *slowFakeProvider) FetchList(ctx context.Context, tok string) ([]RemoteEntry, error) {
	return nil, nil
}
