package scheduler

import (
	"sync"
	"testing"
	"time"

	"github.com/mtb-aggregator/api/internal/db"
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
