package completeness

import (
	"context"
	"reflect"
	"testing"
)

func TestBuildReport_UnknownTotal(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustCreateLibrary(t, q, "lib-1")
	mustInsertAnimeForLibrary(t, q, "a1", "lib-1", 0)

	rep, err := BuildReport(context.Background(), q, "a1")
	if err != nil {
		t.Fatalf("BuildReport: %v", err)
	}
	if !rep.UnknownTotal {
		t.Errorf("want UnknownTotal=true, got false")
	}
	if rep.Total != 0 {
		t.Errorf("want Total=0, got %d", rep.Total)
	}
	if rep.Have == nil || rep.Missing == nil || rep.AiringPending == nil {
		t.Errorf("want empty slices, got nil")
	}
}

func TestBuildReport_CompletelyHave(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustCreateLibrary(t, q, "lib-1")
	mustInsertAnimeForLibrary(t, q, "a1", "lib-1", 3)
	for n := 1; n <= 3; n++ {
		id := mustInsertEpisode(t, q, "a1", float64(n), "")
		mustLinkMediaFile(t, q, id, "lib-1")
	}

	rep, err := BuildReport(context.Background(), q, "a1")
	if err != nil {
		t.Fatalf("BuildReport: %v", err)
	}
	if !rep.IsComplete() {
		t.Errorf("want IsComplete, got missing=%v airing=%v", rep.Missing, rep.AiringPending)
	}
	if !reflect.DeepEqual(rep.Have, []int{1, 2, 3}) {
		t.Errorf("want Have=[1,2,3], got %v", rep.Have)
	}
}

func TestBuildReport_GapInMiddle(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustCreateLibrary(t, q, "lib-1")
	mustInsertAnimeForLibrary(t, q, "a1", "lib-1", 5)
	for _, n := range []int{1, 2, 4, 5} {
		id := mustInsertEpisode(t, q, "a1", float64(n), "")
		mustLinkMediaFile(t, q, id, "lib-1")
	}
	// ep 3 exists but no media file
	mustInsertEpisode(t, q, "a1", 3, "")

	rep, err := BuildReport(context.Background(), q, "a1")
	if err != nil {
		t.Fatalf("BuildReport: %v", err)
	}
	if !reflect.DeepEqual(rep.Missing, []int{3}) {
		t.Errorf("want Missing=[3], got %v", rep.Missing)
	}
	if !reflect.DeepEqual(rep.Have, []int{1, 2, 4, 5}) {
		t.Errorf("want Have=[1,2,4,5], got %v", rep.Have)
	}
}

func TestBuildReport_FutureAirDateIsAiringPending(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustCreateLibrary(t, q, "lib-1")
	mustInsertAnimeForLibrary(t, q, "a1", "lib-1", 2)
	id1 := mustInsertEpisode(t, q, "a1", 1, "2020-01-01")
	mustLinkMediaFile(t, q, id1, "lib-1")
	mustInsertEpisode(t, q, "a1", 2, "2099-12-31")

	rep, err := BuildReport(context.Background(), q, "a1")
	if err != nil {
		t.Fatalf("BuildReport: %v", err)
	}
	if !reflect.DeepEqual(rep.AiringPending, []int{2}) {
		t.Errorf("want AiringPending=[2], got %v", rep.AiringPending)
	}
	if len(rep.Missing) != 0 {
		t.Errorf("want Missing empty, got %v", rep.Missing)
	}
}

func TestBuildReport_PastAirDateNoFileIsMissing(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustCreateLibrary(t, q, "lib-1")
	mustInsertAnimeForLibrary(t, q, "a1", "lib-1", 2)
	id1 := mustInsertEpisode(t, q, "a1", 1, "2020-01-01")
	mustLinkMediaFile(t, q, id1, "lib-1")
	mustInsertEpisode(t, q, "a1", 2, "2020-01-08") // aired, no file

	rep, err := BuildReport(context.Background(), q, "a1")
	if err != nil {
		t.Fatalf("BuildReport: %v", err)
	}
	if !reflect.DeepEqual(rep.Missing, []int{2}) {
		t.Errorf("want Missing=[2], got %v", rep.Missing)
	}
	if len(rep.AiringPending) != 0 {
		t.Errorf("want AiringPending empty, got %v", rep.AiringPending)
	}
}

func TestBuildReport_MissingEpisodeRowIsMissing(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustCreateLibrary(t, q, "lib-1")
	mustInsertAnimeForLibrary(t, q, "a1", "lib-1", 4)
	// only 1 and 2 are inserted at all
	for _, n := range []int{1, 2} {
		id := mustInsertEpisode(t, q, "a1", float64(n), "")
		mustLinkMediaFile(t, q, id, "lib-1")
	}
	// ep 3, 4 completely absent from episodes table

	rep, err := BuildReport(context.Background(), q, "a1")
	if err != nil {
		t.Fatalf("BuildReport: %v", err)
	}
	if !reflect.DeepEqual(rep.Missing, []int{3, 4}) {
		t.Errorf("want Missing=[3,4], got %v", rep.Missing)
	}
}

func TestBuildReport_NonIntegerEpisodesIgnored(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustCreateLibrary(t, q, "lib-1")
	mustInsertAnimeForLibrary(t, q, "a1", "lib-1", 2)
	for _, n := range []float64{1, 1.5, 2} {
		id := mustInsertEpisode(t, q, "a1", n, "")
		mustLinkMediaFile(t, q, id, "lib-1")
	}

	rep, err := BuildReport(context.Background(), q, "a1")
	if err != nil {
		t.Fatalf("BuildReport: %v", err)
	}
	if !rep.IsComplete() {
		t.Errorf("want IsComplete, got missing=%v", rep.Missing)
	}
	if !reflect.DeepEqual(rep.Have, []int{1, 2}) {
		t.Errorf("want Have=[1,2], got %v", rep.Have)
	}
}

func TestBuildLibrarySummary_MultipleAnime(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustCreateLibrary(t, q, "lib-1")

	// a1: unknown total
	mustInsertAnimeForLibrary(t, q, "a1", "lib-1", 0)

	// a2: complete (2/2)
	mustInsertAnimeForLibrary(t, q, "a2", "lib-1", 2)
	for n := 1; n <= 2; n++ {
		id := mustInsertEpisode(t, q, "a2", float64(n), "")
		mustLinkMediaFile(t, q, id, "lib-1")
	}

	// a3: 1 have, 1 airing pending, 1 missing (past)
	mustInsertAnimeForLibrary(t, q, "a3", "lib-1", 3)
	id1 := mustInsertEpisode(t, q, "a3", 1, "2020-01-01")
	mustLinkMediaFile(t, q, id1, "lib-1")
	mustInsertEpisode(t, q, "a3", 2, "2020-02-01") // aired, no file → missing
	mustInsertEpisode(t, q, "a3", 3, "2099-12-31") // future → airing pending

	reports, err := BuildLibrarySummary(context.Background(), q, "lib-1")
	if err != nil {
		t.Fatalf("BuildLibrarySummary: %v", err)
	}
	if len(reports) != 3 {
		t.Fatalf("want 3 reports, got %d", len(reports))
	}

	byID := make(map[string]Report, len(reports))
	for _, r := range reports {
		byID[r.AnimeID] = r
	}

	r1 := byID["a1"]
	if !r1.UnknownTotal {
		t.Errorf("a1: want UnknownTotal=true")
	}
	if r1.Have == nil || r1.Missing == nil || r1.AiringPending == nil {
		t.Errorf("a1: empty slices should not be nil")
	}

	r2 := byID["a2"]
	if !r2.IsComplete() {
		t.Errorf("a2: want complete, got missing=%v airing=%v", r2.Missing, r2.AiringPending)
	}

	r3 := byID["a3"]
	if !reflect.DeepEqual(r3.Have, []int{1}) {
		t.Errorf("a3: want Have=[1], got %v", r3.Have)
	}
	if !reflect.DeepEqual(r3.Missing, []int{2}) {
		t.Errorf("a3: want Missing=[2], got %v", r3.Missing)
	}
	if !reflect.DeepEqual(r3.AiringPending, []int{3}) {
		t.Errorf("a3: want AiringPending=[3], got %v", r3.AiringPending)
	}
}

// A cour stored with absolute numbers (41–50, total 10) must be judged on
// those numbers: counting from 1 reported all ten missing and credited none
// of the five files on disk.
func TestBuildReport_AbsoluteNumberingAnchorsOnFirstEpisode(t *testing.T) {
	q, cleanup := newTestQueries(t)
	defer cleanup()
	mustCreateLibrary(t, q, "lib-1")
	mustInsertAnimeForLibrary(t, q, "a1", "lib-1", 10)
	for n := 41; n <= 50; n++ {
		id := mustInsertEpisode(t, q, "a1", float64(n), "")
		if n <= 45 {
			mustLinkMediaFile(t, q, id, "lib-1")
		}
	}

	rep, err := BuildReport(context.Background(), q, "a1")
	if err != nil {
		t.Fatalf("BuildReport: %v", err)
	}
	if !reflect.DeepEqual(rep.Have, []int{41, 42, 43, 44, 45}) {
		t.Errorf("want Have=41..45, got %v", rep.Have)
	}
	if !reflect.DeepEqual(rep.Missing, []int{46, 47, 48, 49, 50}) {
		t.Errorf("want Missing=46..50, got %v", rep.Missing)
	}

	summary, err := BuildLibrarySummary(context.Background(), q, "lib-1")
	if err != nil || len(summary) != 1 {
		t.Fatalf("BuildLibrarySummary: %v (%d reports)", err, len(summary))
	}
	if !reflect.DeepEqual(summary[0].Missing, []int{46, 47, 48, 49, 50}) {
		t.Errorf("summary Missing = %v", summary[0].Missing)
	}
}
