package worker

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestJobRegistry_RunRecordsOutcome(t *testing.T) {
	r := NewJobRegistry()
	calls := 0
	r.Register("a", time.Minute, func(context.Context) error { calls++; return nil })

	if err := r.Run(context.Background(), "a"); err != nil {
		t.Fatalf("Run: %v", err)
	}
	state, _ := r.Get("a")
	if calls != 1 || state.LastRunAt == nil || state.LastDurationMs == nil || state.Running || state.LastError != "" {
		t.Fatalf("state after run = %+v (calls=%d)", state, calls)
	}
	if err := r.Run(context.Background(), "missing"); !errors.Is(err, ErrJobNotFound) {
		t.Fatalf("unknown job err = %v", err)
	}
}

func TestJobRegistry_TickSkipsDisabledButRunStillWorks(t *testing.T) {
	r := NewJobRegistry()
	calls := 0
	r.Register("a", time.Minute, func(context.Context) error { calls++; return nil })
	r.SetEnabled("a", false)
	r.ScheduleNext("a", time.Now().Add(time.Minute))

	r.Tick(context.Background(), "a")
	if calls != 0 {
		t.Fatalf("disabled job ran on tick")
	}
	state, _ := r.Get("a")
	if state.Enabled || state.NextRunAt != nil {
		t.Fatalf("disabled state = %+v", state)
	}
	if err := r.Run(context.Background(), "a"); err != nil || calls != 1 {
		t.Fatalf("explicit run: err=%v calls=%d", err, calls)
	}
	r.SetEnabled("a", true)
	r.Tick(context.Background(), "a")
	if calls != 2 {
		t.Fatalf("enabled tick did not run (calls=%d)", calls)
	}
}

func TestJobRegistry_ErrorsAndPanicsAreRecordedAndReported(t *testing.T) {
	r := NewJobRegistry()
	var reported []string
	r.OnError = func(name string, err error) { reported = append(reported, name+": "+err.Error()) }
	r.Register("fails", time.Minute, func(context.Context) error { return errors.New("boom") })
	r.Register("panics", time.Minute, func(context.Context) error { panic("kaboom") })

	_ = r.Run(context.Background(), "fails")
	_ = r.Run(context.Background(), "panics")
	f, _ := r.Get("fails")
	p, _ := r.Get("panics")
	if f.LastError != "boom" || p.LastError != "panic: kaboom" || f.Running || p.Running {
		t.Fatalf("errors not recorded: %+v %+v", f, p)
	}
	if len(reported) != 2 {
		t.Fatalf("OnError calls = %v", reported)
	}
	// A success clears the error.
	r.Register("fails", time.Minute, func(context.Context) error { return nil })
	_ = r.Run(context.Background(), "fails")
	if f, _ := r.Get("fails"); f.LastError != "" {
		t.Fatalf("error not cleared: %+v", f)
	}
}

func TestJobRegistry_RefusesOverlappingRuns(t *testing.T) {
	r := NewJobRegistry()
	started := make(chan struct{})
	release := make(chan struct{})
	r.Register("slow", time.Minute, func(context.Context) error {
		close(started)
		<-release
		return nil
	})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() { defer wg.Done(); _ = r.Run(context.Background(), "slow") }()
	<-started
	if state, _ := r.Get("slow"); !state.Running {
		t.Fatalf("expected running")
	}
	if err := r.Run(context.Background(), "slow"); !errors.Is(err, ErrJobRunning) {
		t.Fatalf("overlap err = %v", err)
	}
	close(release)
	wg.Wait()
	if state, _ := r.Get("slow"); state.Running {
		t.Fatalf("still running after finish")
	}
	if len(r.Snapshot()) != 1 || r.Snapshot()[0].Name != "slow" {
		t.Fatalf("snapshot = %+v", r.Snapshot())
	}
}

// A 3-second ticker must not stream service:changed on every tick: routine
// transitions are announced at most every announceInterval, while an error
// appearing (or clearing) is announced immediately.
func TestJobRegistry_ThrottlesRoutineAnnouncements(t *testing.T) {
	now := time.Date(2026, 8, 26, 12, 0, 0, 0, time.UTC)
	r := NewJobRegistry()
	r.now = func() time.Time { return now }
	fail := false
	r.Register("fast", 3*time.Second, func(context.Context) error {
		if fail {
			return errors.New("boom")
		}
		return nil
	})
	var events int
	r.OnChange = func(JobState) { events++ }

	for i := 0; i < 5; i++ {
		_ = r.Run(context.Background(), "fast")
		now = now.Add(3 * time.Second)
	}
	if events != 1 {
		t.Fatalf("5 routine runs within 30 s announced %d times, want 1", events)
	}

	fail = true
	_ = r.Run(context.Background(), "fast")
	if events != 2 {
		t.Fatalf("error appearing did not announce (events=%d)", events)
	}
	fail = false
	_ = r.Run(context.Background(), "fast")
	if events != 3 {
		t.Fatalf("error clearing did not announce (events=%d)", events)
	}
}
