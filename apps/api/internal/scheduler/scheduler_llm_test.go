package scheduler

import (
	"sync"
	"testing"
	"time"

	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/llm"
)

func TestStoreHasEnricher(t *testing.T) {
	t.Parallel()
	if !storeHasEnricher("worldwidecyclery") {
		t.Fatal("expected worldwidecyclery to have enricher")
	}
	if storeHasEnricher("competitivecyclist") {
		t.Fatal("competitivecyclist should not have scheduled enricher")
	}
}

func TestMaybeKickLLMAfterScrape_enricherStore(t *testing.T) {
	t.Parallel()
	var mu sync.Mutex
	var gotFilter db.EnrichmentFilter
	var gotTrigger string
	s := &Scheduler{
		runLLMJob: func(f db.EnrichmentFilter, tb string) {
			mu.Lock()
			defer mu.Unlock()
			gotFilter = f
			gotTrigger = tb
		},
	}
	s.maybeKickLLMAfterScrape("worldwidecyclery")
	mu.Lock()
	defer mu.Unlock()
	if gotFilter.StoreType != "worldwidecyclery" {
		t.Fatalf("filter store = %q, want worldwidecyclery", gotFilter.StoreType)
	}
	if gotTrigger != "scrape" {
		t.Fatalf("triggeredBy = %q, want scrape", gotTrigger)
	}
}

func TestMaybeKickLLMAfterScrape_nonEnricher(t *testing.T) {
	t.Parallel()
	called := false
	s := &Scheduler{
		runLLMJob: func(db.EnrichmentFilter, string) {
			called = true
		},
	}
	s.maybeKickLLMAfterScrape("competitivecyclist")
	if called {
		t.Fatal("should not kick LLM for non-enricher store")
	}
}

func TestGetEnrichLLMJobTimeout_default(t *testing.T) {
	t.Setenv("ENRICH_LLM_JOB_TIMEOUT", "")
	if got := getEnrichLLMJobTimeout(); got != 30*time.Minute {
		t.Errorf("getEnrichLLMJobTimeout() = %v, want 30m", got)
	}
}

func TestGetEnrichLLMJobTimeout_envOverride(t *testing.T) {
	t.Setenv("ENRICH_LLM_JOB_TIMEOUT", "15m")
	if got := getEnrichLLMJobTimeout(); got != 15*time.Minute {
		t.Errorf("getEnrichLLMJobTimeout() = %v, want 15m", got)
	}
}

func TestRunLLMJob_skipsWhenOpenAINotConfigured(t *testing.T) {
	t.Parallel()
	called := false
	s := &Scheduler{
		llm: nil,
		runLLMJob: func(db.EnrichmentFilter, string) {
			called = true
		},
	}
	s.RunLLMJob(db.EnrichmentFilter{StoreType: "worldwidecyclery"}, "manual")
	if called {
		t.Fatal("RunLLMJob should skip when OpenAI is not configured")
	}
}

func TestKickLLMJobDebounced_skipsWhenInFlight(t *testing.T) {
	t.Parallel()
	started := make(chan struct{}, 1)
	release := make(chan struct{})
	var calls int
	var mu sync.Mutex
	s := &Scheduler{
		llm: llm.New("test-key", ""),
		runLLMJob: func(f db.EnrichmentFilter, tb string) {
			mu.Lock()
			calls++
			mu.Unlock()
			started <- struct{}{}
			<-release
			if f.StoreType != "worldwidecyclery" || tb != "pdp" {
				t.Errorf("RunLLMJob(%q, %q) unexpected args", f.StoreType, tb)
			}
		},
	}
	s.kickLLMJobDebounced("worldwidecyclery")
	s.kickLLMJobDebounced("worldwidecyclery")
	<-started
	mu.Lock()
	firstCalls := calls
	mu.Unlock()
	if firstCalls != 1 {
		t.Fatalf("expected 1 in-flight LLM job, got %d", firstCalls)
	}
	close(release)
	time.Sleep(10 * time.Millisecond)
	s.kickLLMJobDebounced("worldwidecyclery")
	<-started
	mu.Lock()
	total := calls
	mu.Unlock()
	if total != 2 {
		t.Fatalf("expected second kick after first finished, total calls = %d", total)
	}
}
