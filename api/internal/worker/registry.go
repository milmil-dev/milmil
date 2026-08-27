package worker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"time"
)

// JobFunc is one scheduler job. A returned error is recorded on the job and
// surfaced as a system.service_failed notification (rate limited).
type JobFunc func(context.Context) error

// JobState is a point-in-time view of one scheduled job.
type JobState struct {
	Name           string
	Interval       time.Duration
	Enabled        bool
	Running        bool
	LastRunAt      *time.Time
	LastDurationMs *int64
	LastError      string
	NextRunAt      *time.Time
}

// Errors returned by Run.
var (
	ErrJobNotFound = errors.New("job not found")
	ErrJobRunning  = errors.New("job already running")
)

type jobEntry struct {
	name     string
	interval time.Duration
	fn       JobFunc
	enabled  bool
	running  bool
	last     *time.Time
	duration *int64
	lastErr  string
	next     *time.Time
	// Last broadcast, to keep a 3-second ticker from streaming
	// service:changed twice per tick at every connected client.
	broadcastAt  time.Time
	broadcastErr string
}

// JobRegistry tracks every ticker the Scheduler runs: its schedule, the last
// run's outcome, whether it is enabled, and lets the API run one on demand.
// Safe for concurrent use.
type JobRegistry struct {
	mu   sync.Mutex
	jobs map[string]*jobEntry
	// OnError is called (outside the lock) whenever a run records an error.
	OnError func(name string, err error)
	// OnChange is called (outside the lock) after any state transition.
	OnChange func(state JobState)
	now      func() time.Time
}

// NewJobRegistry creates an empty registry.
func NewJobRegistry() *JobRegistry {
	return &JobRegistry{jobs: map[string]*jobEntry{}, now: time.Now}
}

// Register adds (or replaces) a job definition. Enabled unless disabled later.
func (r *JobRegistry) Register(name string, interval time.Duration, fn JobFunc) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if existing, ok := r.jobs[name]; ok {
		existing.interval = interval
		existing.fn = fn
		return
	}
	r.jobs[name] = &jobEntry{name: name, interval: interval, fn: fn, enabled: true}
}

// SetEnabled flips a job's enabled flag; a disabled job's ticks are skipped.
func (r *JobRegistry) SetEnabled(name string, enabled bool) bool {
	r.mu.Lock()
	job, ok := r.jobs[name]
	if !ok {
		r.mu.Unlock()
		return false
	}
	job.enabled = enabled
	if !enabled {
		job.next = nil
	}
	state := job.state()
	r.mu.Unlock()
	r.changed(state)
	return true
}

// ApplyDisabled sets every listed job disabled and every other job enabled.
func (r *JobRegistry) ApplyDisabled(disabled map[string]bool) {
	r.mu.Lock()
	for name, job := range r.jobs {
		job.enabled = !disabled[name]
		if !job.enabled {
			job.next = nil
		}
	}
	r.mu.Unlock()
}

// Enabled reports the flag; unknown jobs are enabled (nothing to skip).
func (r *JobRegistry) Enabled(name string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	job, ok := r.jobs[name]
	return !ok || job.enabled
}

// ScheduleNext records when the ticker will fire again.
func (r *JobRegistry) ScheduleNext(name string, at time.Time) {
	r.mu.Lock()
	if job, ok := r.jobs[name]; ok && job.enabled {
		t := at
		job.next = &t
	}
	r.mu.Unlock()
}

// Tick runs the job for a scheduler tick: skipped silently when disabled or
// already running.
func (r *JobRegistry) Tick(ctx context.Context, name string) {
	if !r.Enabled(name) {
		return
	}
	if err := r.Run(ctx, name); err != nil && !errors.Is(err, ErrJobRunning) {
		slog.Debug("scheduler: tick skipped", "job", name, "err", err)
	}
}

// Run executes the job now, synchronously, regardless of the enabled flag
// (an explicit request). ErrJobRunning when a run is already in flight.
func (r *JobRegistry) Run(ctx context.Context, name string) error {
	r.mu.Lock()
	job, ok := r.jobs[name]
	if !ok {
		r.mu.Unlock()
		return ErrJobNotFound
	}
	if job.running {
		r.mu.Unlock()
		return ErrJobRunning
	}
	job.running = true
	fn := job.fn
	// The registered name, not the caller's — Run is reachable from an API
	// path parameter, and this one ends up in a log line.
	jobName := job.name
	started := r.now()
	state := job.state()
	announce := r.shouldAnnounce(job, started)
	r.mu.Unlock()
	if announce {
		r.changed(state)
	}

	err := r.invoke(ctx, jobName, fn)

	finished := r.now()
	ms := finished.Sub(started).Milliseconds()
	r.mu.Lock()
	job.running = false
	job.last = &started
	job.duration = &ms
	if err != nil {
		job.lastErr = err.Error()
	} else {
		job.lastErr = ""
	}
	state = job.state()
	announce = r.shouldAnnounce(job, finished)
	r.mu.Unlock()
	if announce {
		r.changed(state)
	}
	if err != nil {
		r.RecordError(name, err)
	}
	return nil
}

// invoke runs fn with a panic guard so a misbehaving job neither kills the
// process nor wedges the registry in the running state.
func (r *JobRegistry) invoke(ctx context.Context, name string, fn JobFunc) (err error) {
	defer func() {
		if rec := recover(); rec != nil {
			err = fmt.Errorf("panic: %v", rec)
			slog.Error("scheduler: job panicked", "job", name, "panic", rec)
		}
	}()
	if fn == nil {
		return nil
	}
	return fn(ctx)
}

// RecordError stores an error against a job (for jobs that log failures
// internally and cannot return them) and notifies OnError.
func (r *JobRegistry) RecordError(name string, err error) {
	if err == nil {
		return
	}
	r.mu.Lock()
	job, ok := r.jobs[name]
	var state JobState
	announce := false
	if ok {
		job.lastErr = err.Error()
		state = job.state()
		announce = r.shouldAnnounce(job, r.now())
	}
	r.mu.Unlock()
	if announce {
		r.changed(state)
	}
	if r.OnError != nil {
		r.OnError(name, err)
	}
}

// Snapshot returns every job sorted by name.
func (r *JobRegistry) Snapshot() []JobState {
	r.mu.Lock()
	out := make([]JobState, 0, len(r.jobs))
	for _, job := range r.jobs {
		out = append(out, job.state())
	}
	r.mu.Unlock()
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// Get returns one job's state.
func (r *JobRegistry) Get(name string) (JobState, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	job, ok := r.jobs[name]
	if !ok {
		return JobState{}, false
	}
	return job.state(), true
}

func (r *JobRegistry) changed(state JobState) {
	if r.OnChange != nil {
		r.OnChange(state)
	}
}

// announceInterval bounds routine start/finish broadcasts per fast job; an
// outcome change (error appears or clears) always goes out at once.
const announceInterval = 30 * time.Second

// shouldAnnounce decides, with r.mu held, whether a routine transition is
// worth a service:changed. Slow jobs (≥ 1 min) always announce; fast tickers
// announce at most every announceInterval unless their error state changed.
func (r *JobRegistry) shouldAnnounce(job *jobEntry, at time.Time) bool {
	if job.interval >= time.Minute || job.lastErr != job.broadcastErr || at.Sub(job.broadcastAt) >= announceInterval {
		job.broadcastAt = at
		job.broadcastErr = job.lastErr
		return true
	}
	return false
}

func (j *jobEntry) state() JobState {
	s := JobState{Name: j.name, Interval: j.interval, Enabled: j.enabled, Running: j.running, LastError: j.lastErr}
	if j.last != nil {
		t := *j.last
		s.LastRunAt = &t
	}
	if j.duration != nil {
		d := *j.duration
		s.LastDurationMs = &d
	}
	if j.next != nil && j.enabled {
		t := *j.next
		s.NextRunAt = &t
	}
	return s
}
