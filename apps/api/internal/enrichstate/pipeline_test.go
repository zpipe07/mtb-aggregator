package enrichstate

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/mtb-aggregator/api/internal/scraper"
)

type fakeStateStore struct {
	mu             sync.Mutex
	states         map[int]*ListingState
	items          map[Step][]WorkItem
	releaseCalls   []leaseReleaseCall
}

type leaseReleaseCall struct {
	ListingID int
	Step      Step
}

func newFakeStateStore(items map[Step][]WorkItem) *fakeStateStore {
	return &fakeStateStore{
		states: make(map[int]*ListingState),
		items:  items,
	}
}

func (f *fakeStateStore) EnsureRow(_ context.Context, listingID int) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.states[listingID]; !ok {
		f.states[listingID] = &ListingState{ListingID: listingID}
	}
	return nil
}

func (f *fakeStateStore) GetState(_ context.Context, listingID int) (*ListingState, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	st, ok := f.states[listingID]
	if !ok {
		return nil, nil
	}
	copy := *st
	return &copy, nil
}

func (f *fakeStateStore) ClaimForStep(_ context.Context, step Step, _ ClaimFilter, limit int, _ bool, _, _ time.Time, _ time.Duration) ([]WorkItem, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	batch := f.items[step]
	if len(batch) > limit {
		batch = batch[:limit]
	}
	f.items[step] = f.items[step][len(batch):]
	return batch, nil
}

func (f *fakeStateStore) ReleaseLease(_ context.Context, listingID int, step Step) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.releaseCalls = append(f.releaseCalls, leaseReleaseCall{ListingID: listingID, Step: step})
	return nil
}

func (f *fakeStateStore) RecordStepSuccess(_ context.Context, listingID int, step Step, meta StepSuccessMeta, completedAt time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	st := f.states[listingID]
	if st == nil {
		st = &ListingState{ListingID: listingID}
		f.states[listingID] = st
	}
	switch step {
	case StepPDP:
		// Mirrors the DB store contract: PDP success never touches PDPHash
		// (it tracks the hash last processed by the LLM steps).
		st.PDP.CompletedAt = &completedAt
		st.PDP.Attempts = 0
		st.PDP.Error = ""
	case StepClassify:
		st.Classify.CompletedAt = &completedAt
		st.LLMConfidence = meta.LLMConfidence
	case StepExtract:
		st.Extract.CompletedAt = &completedAt
	}
	return nil
}

func (f *fakeStateStore) RecordStepFailure(_ context.Context, listingID int, step Step, errMsg string, nextAttempt time.Time, dead bool) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	st := f.states[listingID]
	if st == nil {
		st = &ListingState{ListingID: listingID}
		f.states[listingID] = st
	}
	switch step {
	case StepPDP:
		st.PDP.Attempts++
		st.PDP.Error = errMsg
		st.PDP.NextAttemptAt = &nextAttempt
		st.PDP.Dead = dead
	}
	return nil
}

func (f *fakeStateStore) ResetStep(context.Context, int, Step) error { return nil }

func (f *fakeStateStore) StampLLMSkipInputs(_ context.Context, listingID int, pdpHash string, promptProfileVersion *time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	st := f.states[listingID]
	if st == nil {
		st = &ListingState{ListingID: listingID}
		f.states[listingID] = st
	}
	if st.PDPHash == "" && pdpHash != "" {
		st.PDPHash = pdpHash
	}
	if st.PromptProfileVersion == nil && promptProfileVersion != nil {
		v := *promptProfileVersion
		st.PromptProfileVersion = &v
	}
	return nil
}

type fakeSnapshots struct {
	mu    sync.Mutex
	snaps map[int]*Snapshot
}

func (f *fakeSnapshots) Save(_ context.Context, snap Snapshot) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.snaps == nil {
		f.snaps = make(map[int]*Snapshot)
	}
	copy := snap
	f.snaps[snap.ListingID] = &copy
	return nil
}

func (f *fakeSnapshots) Get(_ context.Context, listingID int) (*Snapshot, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.snaps[listingID], nil
}

type fakeEvents struct {
	events []Event
}

func (f *fakeEvents) Record(_ context.Context, ev Event) error {
	f.events = append(f.events, ev)
	return nil
}

type fakeScraper struct {
	err error
}

func (f fakeScraper) Enrich(context.Context, string, string) (*scraper.EnrichResult, error) {
	if f.err != nil {
		return nil, f.err
	}
	desc := "test"
	return &scraper.EnrichResult{
		CategoryPath: []string{"Components"},
		RawSpecs:     map[string]string{"weight": "200g"},
		Description:  &desc,
	}, nil
}

type countingScraper struct {
	calls int
}

func (c *countingScraper) Enrich(context.Context, string, string) (*scraper.EnrichResult, error) {
	c.calls++
	desc := "test"
	return &scraper.EnrichResult{
		CategoryPath: []string{"Components"},
		RawSpecs:     map[string]string{"weight": "200g"},
		Description:  &desc,
	}, nil
}

type fakeLLM struct {
	classifyErr error
}

func (f fakeLLM) ClassificationStep(context.Context, int) error { return f.classifyErr }
func (f fakeLLM) SpecExtractionStep(context.Context, int) error { return nil }

type fakeListings struct {
	canonicalCategory []string
}

func (f fakeListings) UpdateListingEnrichment(context.Context, int, []string, map[string]string, bool, *string) error {
	return nil
}

func (f fakeListings) GetListingForLLM(context.Context, int) (*ListingLLMView, error) {
	return &ListingLLMView{CanonicalCategory: f.canonicalCategory}, nil
}

func (f fakeListings) GetListingForCategoryClassification(context.Context, int) (*ListingClassifyView, error) {
	return &ListingClassifyView{Metadata: []byte(`{}`)}, nil
}

func (f fakeListings) GetPromptProfileUpdatedAt(context.Context, []string) (*time.Time, error) {
	return nil, nil
}

func countEvents(events []Event, step Step, status EventStatus) int {
	n := 0
	for _, ev := range events {
		if ev.Step == step && ev.Status == status {
			n++
		}
	}
	return n
}

// Reproduces the production starvation bug: ENRICH_MAX_LISTINGS was applied as a
// global budget across all passes, so a PDP backlog >= the cap meant classify and
// extract never ran. maxListings must cap each step independently.
func TestPipeline_MaxListingsBudgetsEachStepSoPDPBacklogCannotStarveLLMSteps(t *testing.T) {
	t.Parallel()
	now := time.Now()
	completed := now.Add(-time.Hour)

	// PDP backlog (3 items) exceeds the per-job cap (2).
	pdpItems := []WorkItem{
		{ListingID: 1, ProductURL: "http://x/1"},
		{ListingID: 2, ProductURL: "http://x/2"},
		{ListingID: 3, ProductURL: "http://x/3"},
	}
	// Two listings already fetched, awaiting classification.
	classifyItems := []WorkItem{
		{ListingID: 10, ProductURL: "http://x/10"},
		{ListingID: 11, ProductURL: "http://x/11"},
	}
	state := newFakeStateStore(map[Step][]WorkItem{
		StepPDP:      pdpItems,
		StepClassify: classifyItems,
	})
	snaps := &fakeSnapshots{snaps: map[int]*Snapshot{}}
	for _, id := range []int{10, 11} {
		state.states[id] = &ListingState{
			ListingID: id,
			PDP:       StepState{CompletedAt: &completed},
		}
		snaps.snaps[id] = &Snapshot{ListingID: id, ContentHash: "hash-" + strconv.Itoa(id)}
	}

	events := &fakeEvents{}
	p := &Pipeline{
		State:     state,
		Snapshots: snaps,
		Events:    events,
		Scraper:   fakeScraper{},
		LLM:       fakeLLM{},
		Listings:  fakeListings{},
		Config:    DefaultConfig(),
	}
	processed, succeeded, errStrs := p.RunJob(context.Background(), ClaimFilter{}, false, 10, 2, nil)
	if len(errStrs) != 0 {
		t.Fatalf("unexpected errors: %v", errStrs)
	}

	if got := countEvents(events.events, StepPDP, StatusSuccess); got != 2 {
		t.Errorf("pdp successes = %d, want 2 (capped per step)", got)
	}
	if got := countEvents(events.events, StepClassify, StatusSuccess); got != 2 {
		t.Errorf("classify successes = %d, want 2 (must not be starved by PDP backlog)", got)
	}
	if processed != 4 {
		t.Errorf("processed = %d, want 4 (2 pdp + 2 classify)", processed)
	}
	if succeeded != 4 {
		t.Errorf("succeeded = %d, want 4", succeeded)
	}
}

// A PDP re-fetch that returns changed content must invalidate the previous LLM
// classification: the classify pass runs again instead of skipping. This guards
// against PDP success overwriting the "hash last processed by LLM" marker.
func TestPipeline_PDPRefetchWithChangedContentTriggersReclassify(t *testing.T) {
	t.Parallel()
	now := time.Now()
	classifiedAt := now.Add(-8 * 24 * time.Hour)
	item := WorkItem{ListingID: 5, ProductURL: "http://x/5"}

	state := newFakeStateStore(map[Step][]WorkItem{
		StepPDP:      {item},
		StepClassify: {item},
	})
	// Previously fetched and classified against old content ("old-content-hash").
	state.states[5] = &ListingState{
		ListingID: 5,
		PDP:       StepState{CompletedAt: &classifiedAt},
		Classify:  StepState{CompletedAt: &classifiedAt},
		PDPHash:   "old-content-hash",
	}
	snaps := &fakeSnapshots{snaps: map[int]*Snapshot{
		5: {ListingID: 5, ContentHash: "old-content-hash"},
	}}

	events := &fakeEvents{}
	p := &Pipeline{
		State:     state,
		Snapshots: snaps,
		Events:    events,
		Scraper:   fakeScraper{}, // returns new content whose hash differs from "old-content-hash"
		LLM:       fakeLLM{},
		Listings:  fakeListings{},
		Config:    DefaultConfig(),
	}
	_, _, errStrs := p.RunJob(context.Background(), ClaimFilter{}, false, 10, 0, nil)
	if len(errStrs) != 0 {
		t.Fatalf("unexpected errors: %v", errStrs)
	}

	if got := countEvents(events.events, StepPDP, StatusSuccess); got != 1 {
		t.Fatalf("pdp successes = %d, want 1", got)
	}
	if got := countEvents(events.events, StepClassify, StatusSkipped); got != 0 {
		t.Errorf("classify skipped = %d, want 0 (content changed, must re-run)", got)
	}
	if got := countEvents(events.events, StepClassify, StatusSuccess); got != 1 {
		t.Errorf("classify successes = %d, want 1 (re-run after content change)", got)
	}
}

func TestPipeline_PDPFailureDoesNotRunLLM(t *testing.T) {
	t.Parallel()
	item := WorkItem{ListingID: 42, StoreID: 1, StoreType: "jensonusa", ProductURL: "http://x"}
	state := newFakeStateStore(map[Step][]WorkItem{
		StepPDP: {item},
	})
	snaps := &fakeSnapshots{}
	events := &fakeEvents{}

	p := &Pipeline{
		State:     state,
		Snapshots: snaps,
		Events:    events,
		Scraper:   fakeScraper{err: errors.New("scraper down")},
		LLM:       fakeLLM{},
		Config:    DefaultConfig(),
	}
	processed, succeeded, _ := p.RunJob(context.Background(), ClaimFilter{}, false, 10, 0, nil)
	if processed != 1 {
		t.Fatalf("processed=%d want 1", processed)
	}
	if succeeded != 0 {
		t.Fatalf("succeeded=%d want 0", succeeded)
	}
	st, _ := state.GetState(context.Background(), 42)
	if st == nil || st.PDP.Attempts != 1 {
		t.Fatalf("expected PDP failure recorded, got %+v", st)
	}
}

func TestPipeline_PDPSuccessRecordsSnapshot(t *testing.T) {
	t.Parallel()
	item := WorkItem{ListingID: 7, StoreID: 1, StoreType: "jensonusa", ProductURL: "http://x"}
	state := newFakeStateStore(map[Step][]WorkItem{
		StepPDP: {item},
	})
	snaps := &fakeSnapshots{}
	events := &fakeEvents{}

	// Use pipeline with mock DB via embedding - for this test we need UpdateListingEnrichment
	// Test at snapshot+state level using runPDP directly would need DB.
	// Instead verify scraper success path records snapshot when DB is stubbed via test helper.
	p := &Pipeline{
		State:     state,
		Snapshots: snaps,
		Events:    events,
		Scraper:   fakeScraper{},
		Config:    DefaultConfig(),
	}
	ok, err := p.runPDP(context.Background(), item, nil, time.Now(), DefaultConfig(), time.Now())
	if err == nil || !errors.Is(err, errMissingListings{}) {
		if snaps.snaps[7] == nil {
			t.Fatalf("expected snapshot before listing store error, err=%v", err)
		}
	}
	_ = ok
}

func TestPipeline_CircuitBreakerSkipsRemainingPDPForStore(t *testing.T) {
	t.Parallel()
	items := []WorkItem{
		{ListingID: 1, StoreType: "jensonusa", ProductURL: "http://x/1"},
		{ListingID: 2, StoreType: "jensonusa", ProductURL: "http://x/2"},
		{ListingID: 3, StoreType: "jensonusa", ProductURL: "http://x/3"},
		{ListingID: 4, StoreType: "giro", ProductURL: "http://x/4"},
	}
	state := newFakeStateStore(map[Step][]WorkItem{
		StepPDP: items,
	})
	events := &fakeEvents{}
	cb := NewCircuitBreaker(2)

	p := &Pipeline{
		State:          state,
		Snapshots:      &fakeSnapshots{},
		Events:         events,
		Scraper:        fakeScraper{err: errors.New("scraper down")},
		Config:         DefaultConfig(),
		CircuitBreaker: cb,
	}
	processed, succeeded, errStrs := p.RunJob(context.Background(), ClaimFilter{}, false, 10, 0, nil)
	if processed != 3 {
		t.Fatalf("processed=%d want 3 (2 jensonusa failures + 1 giro; third jensonusa skipped)", processed)
	}
	if succeeded != 0 {
		t.Fatalf("succeeded=%d want 0", succeeded)
	}
	if !cb.IsTripped("jensonusa") {
		t.Fatal("expected jensonusa circuit breaker to trip")
	}
	if cb.IsTripped("giro") {
		t.Fatal("giro should not be tripped")
	}
	foundTripMsg := false
	for _, msg := range errStrs {
		if msg == "circuit breaker tripped for store jensonusa: skipping remaining PDP" {
			foundTripMsg = true
			break
		}
	}
	if !foundTripMsg {
		t.Fatalf("expected circuit breaker trip message in errStrs: %v", errStrs)
	}
	st1, _ := state.GetState(context.Background(), 1)
	st2, _ := state.GetState(context.Background(), 2)
	st3, _ := state.GetState(context.Background(), 3)
	if st1 == nil || st1.PDP.Attempts != 1 {
		t.Fatalf("listing 1 should have one failure, got %+v", st1)
	}
	if st2 == nil || st2.PDP.Attempts != 1 {
		t.Fatalf("listing 2 should have one failure, got %+v", st2)
	}
	if st3 != nil && st3.PDP.Attempts > 0 {
		t.Fatalf("listing 3 should be skipped without failure, got %+v", st3)
	}
	foundRelease := false
	for _, call := range state.releaseCalls {
		if call.ListingID == 3 && call.Step == StepPDP {
			foundRelease = true
			break
		}
	}
	if !foundRelease {
		t.Fatalf("expected ReleaseLease for circuit-breaker-skipped listing 3, got %+v", state.releaseCalls)
	}
}

func TestPipeline_SkipClassifyWhenAlreadyDone(t *testing.T) {
	t.Parallel()
	now := time.Now()
	hash := "deadbeef"
	item := WorkItem{ListingID: 99}
	completed := now.Add(-time.Hour)
	state := newFakeStateStore(map[Step][]WorkItem{
		StepClassify: {item},
	})
	state.states[99] = &ListingState{
		ListingID: 99,
		PDP:       StepState{CompletedAt: &completed},
		Classify:  StepState{CompletedAt: &completed},
		PDPHash:   hash,
	}
	snaps := &fakeSnapshots{snaps: map[int]*Snapshot{
		99: {ListingID: 99, ContentHash: hash, Payload: SnapshotPayload{}},
	}}
	events := &fakeEvents{}
	p := &Pipeline{
		State:     state,
		Snapshots: snaps,
		Events:    events,
		LLM:       fakeLLM{},
		Config:    DefaultConfig(),
	}
	ok, err := p.runOne(context.Background(), StepClassify, item, false, nil, now, DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected skip success")
	}
	if len(events.events) != 1 || events.events[0].Status != StatusSkipped {
		t.Fatalf("expected skipped event, got %+v", events.events)
	}
	foundRelease := false
	for _, call := range state.releaseCalls {
		if call.ListingID == 99 && call.Step == StepClassify {
			foundRelease = true
			break
		}
	}
	if !foundRelease {
		t.Fatalf("expected ReleaseLease on LLM skip, got %+v", state.releaseCalls)
	}
}

func TestPipeline_SkipClassifyStampsNullHash(t *testing.T) {
	t.Parallel()
	now := time.Now()
	hash := "deadbeef"
	item := WorkItem{ListingID: 99}
	completed := now.Add(-time.Hour)
	state := newFakeStateStore(map[Step][]WorkItem{
		StepClassify: {item},
	})
	state.states[99] = &ListingState{
		ListingID: 99,
		PDP:       StepState{CompletedAt: &completed},
		Classify:  StepState{CompletedAt: &completed},
		PDPHash:   "",
	}
	snap := &Snapshot{ListingID: 99, ContentHash: hash, Payload: SnapshotPayload{}}
	snaps := &fakeSnapshots{snaps: map[int]*Snapshot{99: snap}}
	events := &fakeEvents{}
	p := &Pipeline{
		State:     state,
		Snapshots: snaps,
		Events:    events,
		LLM:       fakeLLM{},
		Config:    DefaultConfig(),
	}
	ok, err := p.runOne(context.Background(), StepClassify, item, false, nil, now, DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected skip success")
	}
	st, err := state.GetState(context.Background(), 99)
	if err != nil {
		t.Fatal(err)
	}
	if st.PDPHash != hash {
		t.Fatalf("expected stamped pdp_hash %q, got %q", hash, st.PDPHash)
	}
	in := StepDueInput{
		Now:      now,
		Config:   DefaultConfig(),
		State:    *st,
		Snapshot: snap,
	}
	if StepDue(StepClassify, in) {
		t.Fatal("classify should not be due after null hash is stamped from snapshot")
	}
	if len(events.events) != 1 || events.events[0].Status != StatusSkipped {
		t.Fatalf("expected skipped event, got %+v", events.events)
	}
}

func TestPipeline_RunJobSteps_LLMOnlySkipsPDP(t *testing.T) {
	t.Parallel()
	now := time.Now()
	completed := now.Add(-time.Hour)
	item := WorkItem{ListingID: 20, ProductURL: "http://x/20"}

	state := newFakeStateStore(map[Step][]WorkItem{
		StepPDP:      {item},
		StepClassify: {item},
	})
	state.states[20] = &ListingState{
		ListingID: 20,
		PDP:       StepState{CompletedAt: &completed},
	}
	snaps := &fakeSnapshots{snaps: map[int]*Snapshot{
		20: {ListingID: 20, ContentHash: "hash-20"},
	}}
	events := &fakeEvents{}
	scraper := &countingScraper{}
	p := &Pipeline{
		State:     state,
		Snapshots: snaps,
		Events:    events,
		Scraper:   scraper,
		LLM:       fakeLLM{},
		Listings:  fakeListings{},
		Config:    DefaultConfig(),
	}
	processed, succeeded, errStrs := p.RunJobSteps(context.Background(), ClaimFilter{}, false, 10, 0, nil, LLMJobSteps)
	if len(errStrs) != 0 {
		t.Fatalf("unexpected errors: %v", errStrs)
	}
	if scraper.calls != 0 {
		t.Fatalf("scraper calls = %d, want 0 (LLM-only job must not fetch PDP)", scraper.calls)
	}
	if got := countEvents(events.events, StepPDP, StatusSuccess); got != 0 {
		t.Errorf("pdp successes = %d, want 0", got)
	}
	if got := countEvents(events.events, StepClassify, StatusSuccess); got != 1 {
		t.Errorf("classify successes = %d, want 1", got)
	}
	if processed != 1 || succeeded != 1 {
		t.Errorf("processed=%d succeeded=%d, want 1/1", processed, succeeded)
	}
	if len(state.items[StepPDP]) != 1 {
		t.Errorf("PDP queue should be untouched, still has %d items", len(state.items[StepPDP]))
	}
}
