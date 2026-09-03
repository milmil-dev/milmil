package sync

import (
	"context"
	"encoding/json"
	stdsync "sync"
	"testing"
	"time"
)

func TestEnqueueInsertsRow(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	qu := NewQueue(q, db)

	if err := qu.Enqueue(context.Background(), "u", ProviderAniList, "a1", SyncOp{
		Kind: KindProgress, AnimeID: "a1", Status: StatusWatching, Progress: 3,
	}); err != nil {
		t.Fatal(err)
	}

	rows, err := q.ListReadySyncOps(context.Background(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("want 1, got %d", len(rows))
	}
	var op SyncOp
	if err := json.Unmarshal([]byte(rows[0].Payload), &op); err != nil {
		t.Fatal(err)
	}
	if op.Progress != 3 {
		t.Errorf("lost payload: %+v", op)
	}
}

func TestEnqueueSupersedesEarlierProgress(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	qu := NewQueue(q, db)
	ctx := context.Background()

	if err := qu.Enqueue(ctx, "u", ProviderAniList, "a", SyncOp{Kind: KindProgress, Progress: 1}); err != nil {
		t.Fatal(err)
	}
	if err := qu.Enqueue(ctx, "u", ProviderAniList, "a", SyncOp{Kind: KindProgress, Progress: 2}); err != nil {
		t.Fatal(err)
	}
	if err := qu.Enqueue(ctx, "u", ProviderAniList, "a", SyncOp{Kind: KindProgress, Progress: 3}); err != nil {
		t.Fatal(err)
	}

	rows, err := q.ListReadySyncOps(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 active row after coalescing, got %d", len(rows))
	}
	var op SyncOp
	if err := json.Unmarshal([]byte(rows[0].Payload), &op); err != nil {
		t.Fatal(err)
	}
	if op.Progress != 3 {
		t.Errorf("expected newest progress, got %d", op.Progress)
	}
}

func TestEnqueueDoesNotSupersedeOtherKinds(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	qu := NewQueue(q, db)
	ctx := context.Background()

	if err := qu.Enqueue(ctx, "u", ProviderAniList, "a", SyncOp{Kind: KindImport}); err != nil {
		t.Fatal(err)
	}
	if err := qu.Enqueue(ctx, "u", ProviderAniList, "a", SyncOp{Kind: KindProgress, Progress: 1}); err != nil {
		t.Fatal(err)
	}

	rows, err := q.ListReadySyncOps(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("import should not be superseded; got %d", len(rows))
	}
}

// A2 regression test — fire N concurrent Enqueue calls and assert exactly
// one live row remains for the target (user, provider, anime).
func TestEnqueueConcurrentSupersedeRace(t *testing.T) {
	q, db, cleanup := newTestQueriesWithDB(t)
	defer cleanup()
	qu := NewQueue(q, db)
	ctx := context.Background()

	const N = 20
	var wg stdsync.WaitGroup
	for i := range N {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_ = qu.Enqueue(ctx, "u", ProviderAniList, "a", SyncOp{Kind: KindProgress, Progress: i})
		}(i)
	}
	wg.Wait()

	rows, err := q.ListReadySyncOps(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Errorf("expected exactly 1 active row after concurrent enqueues, got %d", len(rows))
	}
}

func TestBackoffGrows(t *testing.T) {
	cases := []struct {
		attempts int
		want     time.Duration
	}{
		{1, 1 * time.Minute},
		{2, 2 * time.Minute},
		{3, 4 * time.Minute},
		{4, 8 * time.Minute},
		{5, 16 * time.Minute},
		{6, 32 * time.Minute},
		{7, 64 * time.Minute},
		{8, 128 * time.Minute},
		{9, 256 * time.Minute},
		{10, 512 * time.Minute},
		{30, 24 * time.Hour},
	}
	for _, tc := range cases {
		if got := Backoff(tc.attempts); got != tc.want {
			t.Errorf("Backoff(%d)=%v want %v", tc.attempts, got, tc.want)
		}
	}
}
