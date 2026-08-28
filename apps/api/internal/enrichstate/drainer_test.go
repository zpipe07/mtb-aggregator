package enrichstate

import (
	"context"
	"sync"
	"testing"
	"time"
)

type fakePDPPacer struct {
	mu            sync.Mutex
	lastFetch     map[string]time.Time
	cooldownUntil map[string]time.Time
	failures      map[string]int
	minInterval   time.Duration
	threshold     int
	cooldown      time.Duration
}

func newFakePDPPacer(minInterval time.Duration, threshold int, cooldown time.Duration) *fakePDPPacer {
	return &fakePDPPacer{
		lastFetch:     make(map[string]time.Time),
		cooldownUntil: make(map[string]time.Time),
		failures:      make(map[string]int),
		minInterval:   minInterval,
		threshold:     threshold,
		cooldown:      cooldown,
	}
}

func (f *fakePDPPacer) ShouldSkipPDP(_ context.Context, storeType string, bypassMinInterval, force bool, now time.Time, minInterval time.Duration) (bool, error) {
	if force {
		return false, nil
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if until, ok := f.cooldownUntil[storeType]; ok && until.After(now) {
		return true, nil
	}
	if bypassMinInterval {
		return false, nil
	}
	if last, ok := f.lastFetch[storeType]; ok && now.Sub(last) < minInterval {
		return true, nil
	}
	return false, nil
}

func (f *fakePDPPacer) CanDrainerFetch(ctx context.Context, storeType string, now time.Time, minInterval time.Duration) (bool, error) {
	skip, err := f.ShouldSkipPDP(ctx, storeType, false, false, now, minInterval)
	return !skip, err
}

func (f *fakePDPPacer) RecordPDPFetch(_ context.Context, storeType string, now time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastFetch[storeType] = now
	return nil
}

func (f *fakePDPPacer) RecordPDPSuccess(_ context.Context, storeType string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.failures, storeType)
	delete(f.cooldownUntil, storeType)
	return nil
}

func (f *fakePDPPacer) RecordPDPFailure(_ context.Context, storeType string, threshold int, cooldown time.Duration, now time.Time) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.failures[storeType]++
	if threshold <= 0 || f.failures[storeType] < threshold {
		return false, nil
	}
	f.cooldownUntil[storeType] = now.Add(cooldown)
	return true, nil
}

func TestPDPDrainer_respectsMinInterval(t *testing.T) {
	t.Parallel()
	now := time.Unix(1_700_000_000, 0)
	pacer := newFakePDPPacer(15*time.Second, 5, 30*time.Minute)
	_ = pacer.RecordPDPFetch(context.Background(), "storeA", now)
	can, err := pacer.CanDrainerFetch(context.Background(), "storeA", now.Add(5*time.Second), 15*time.Second)
	if err != nil || can {
		t.Fatalf("CanDrainerFetch within min interval = %v, err=%v; want false", can, err)
	}
	can, err = pacer.CanDrainerFetch(context.Background(), "storeA", now.Add(20*time.Second), 15*time.Second)
	if err != nil || !can {
		t.Fatalf("CanDrainerFetch after min interval = %v, err=%v; want true", can, err)
	}
}

func TestPDPDrainer_skipsCooldownStore(t *testing.T) {
	t.Parallel()
	now := time.Now()
	pacer := newFakePDPPacer(0, 2, time.Hour)
	_, _ = pacer.RecordPDPFailure(context.Background(), "storeA", 2, time.Hour, now.Add(-time.Minute))
	_, _ = pacer.RecordPDPFailure(context.Background(), "storeA", 2, time.Hour, now)
	can, err := pacer.CanDrainerFetch(context.Background(), "storeA", now, 0)
	if err != nil || can {
		t.Fatalf("cooled-down store should not fetch: can=%v err=%v", can, err)
	}
}

func TestPDPDrainer_roundRobinAlternatesStores(t *testing.T) {
	t.Parallel()
	claims := make(map[string]int)
	state := &trackingStateStore{
		inner:  newFakeStateStore(map[Step][]WorkItem{}),
		claims: claims,
	}
	pipeline := &Pipeline{
		State: state,
		Snapshots: &fakeSnapshots{snaps: map[int]*Snapshot{}},
		Events:    &fakeEvents{},
		Scraper:   fakeScraper{},
		Listings:  fakeListings{},
		Config:    DefaultConfig(),
	}
	pacer := newFakePDPPacer(0, 5, time.Minute)
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	d := &PDPDrainer{
		StoreTypes: []string{"alpha", "beta"},
		Pipeline:   pipeline,
		Pacer:      pacer,
		Config:     Config{ClaimLease: time.Minute, PDPMinInterval: 0, PDPStaleAfter: time.Hour},
		Sleep:      func(time.Duration) {},
		IdleSleep:  time.Millisecond,
	}
	state.queue = map[string][]WorkItem{
		"alpha": {{ListingID: 1, StoreType: "alpha", ProductURL: "http://x/1"}},
		"beta":  {{ListingID: 2, StoreType: "beta", ProductURL: "http://x/2"}},
	}
	d.Run(ctx)
	if claims["alpha"] == 0 || claims["beta"] == 0 {
		t.Fatalf("expected round-robin claims for both stores, got %+v", claims)
	}
}

type trackingStateStore struct {
	inner  *fakeStateStore
	queue  map[string][]WorkItem
	claims map[string]int
}

func (t *trackingStateStore) EnsureRow(ctx context.Context, listingID int) error {
	return t.inner.EnsureRow(ctx, listingID)
}
func (t *trackingStateStore) GetState(ctx context.Context, listingID int) (*ListingState, error) {
	return t.inner.GetState(ctx, listingID)
}
func (t *trackingStateStore) ClaimForStep(ctx context.Context, step Step, filter ClaimFilter, limit int, force bool, now, leaseUntil time.Time, pdpStaleAfter time.Duration) ([]WorkItem, error) {
	if step == StepPDP && filter.StoreType != "" {
		t.claims[filter.StoreType]++
		if q, ok := t.queue[filter.StoreType]; ok && len(q) > 0 {
			item := q[0]
			t.queue[filter.StoreType] = q[1:]
			return []WorkItem{item}, nil
		}
		return nil, nil
	}
	return t.inner.ClaimForStep(ctx, step, filter, limit, force, now, leaseUntil, pdpStaleAfter)
}
func (t *trackingStateStore) ReleaseLease(ctx context.Context, listingID int, step Step) error {
	return t.inner.ReleaseLease(ctx, listingID, step)
}
func (t *trackingStateStore) RecordStepSuccess(ctx context.Context, listingID int, step Step, meta StepSuccessMeta, completedAt time.Time) error {
	return t.inner.RecordStepSuccess(ctx, listingID, step, meta, completedAt)
}
func (t *trackingStateStore) RecordStepFailure(ctx context.Context, listingID int, step Step, errMsg string, nextAttempt time.Time, dead bool) error {
	return t.inner.RecordStepFailure(ctx, listingID, step, errMsg, nextAttempt, dead)
}
func (t *trackingStateStore) ResetStep(ctx context.Context, listingID int, step Step) error {
	return t.inner.ResetStep(ctx, listingID, step)
}
func (t *trackingStateStore) StampLLMSkipInputs(ctx context.Context, listingID int, pdpHash string, promptProfileVersion *time.Time) error {
	return t.inner.StampLLMSkipInputs(ctx, listingID, pdpHash, promptProfileVersion)
}
