package api

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

func TestThumbnailJobs_SharesInFlightRender(t *testing.T) {
	t.Parallel()
	jobs := newThumbnailJobs()
	release := make(chan struct{})
	var calls atomic.Int32

	generate := func(context.Context) error {
		calls.Add(1)
		<-release
		return nil
	}
	first := jobs.run(context.Background(), "file-1", generate)
	second := jobs.run(context.Background(), "file-1", generate)
	if first != second {
		t.Fatal("a second request for the same file must join the running job")
	}
	other := jobs.run(context.Background(), "file-2", generate)
	if other == first {
		t.Fatal("different files must not share a job")
	}
	close(release)
	<-first.done
	<-other.done
	if got := calls.Load(); got != 2 {
		t.Fatalf("want 2 renders (one per file), got %d", got)
	}

	// Once finished the key is free again, so a failed render can be retried.
	again := jobs.run(context.Background(), "file-1", generate)
	if again == first {
		t.Fatal("a finished job must not be handed out again")
	}
	<-again.done
}

func TestThumbnailJobs_SurvivesRequestCancellation(t *testing.T) {
	t.Parallel()
	jobs := newThumbnailJobs()
	reqCtx, cancelReq := context.WithCancel(context.Background())
	observed := make(chan error, 1)

	job := jobs.run(reqCtx, "file", func(ctx context.Context) error {
		// The requesting client hangs up mid-render.
		cancelReq()
		select {
		case <-ctx.Done():
			observed <- ctx.Err()
			return ctx.Err()
		case <-time.After(50 * time.Millisecond):
			observed <- nil
			return nil
		}
	})
	<-job.done
	if err := <-observed; err != nil {
		t.Fatalf("render context must outlive the request: %v", err)
	}
	if job.err != nil {
		t.Fatalf("unexpected job error: %v", job.err)
	}
}

func TestThumbnailJobs_ReportsRenderError(t *testing.T) {
	t.Parallel()
	jobs := newThumbnailJobs()
	want := errors.New("ffmpeg exploded")
	job := jobs.run(context.Background(), "file", func(context.Context) error { return want })
	<-job.done
	if !errors.Is(job.err, want) {
		t.Fatalf("want %v, got %v", want, job.err)
	}
}
