package scheduler

import (
	"testing"
	"time"
)

func TestShouldCaptureEnrichListingErrorsAggregate(t *testing.T) {
	t.Parallel()
	quotaSummary := "OpenAI quota exhausted; LLM classify/extract skipped for remainder of job"
	quotaListing := "listing 247632: classify: enrichment step deferred: openai quota exhausted: credit_balance_exhausted"
	tests := []struct {
		name      string
		processed int
		enriched  int
		errStrs   []string
		want      bool
	}{
		{
			name:      "quota only at 100 percent is not a second event",
			processed: 1,
			enriched:  0,
			errStrs:   []string{quotaSummary, quotaListing},
			want:      false,
		},
		{
			name:      "below threshold stays quiet",
			processed: 10,
			enriched:  8,
			errStrs:   []string{"listing 1: timeout"},
			want:      false,
		},
		{
			name:      "many non-quota errors still report",
			processed: 10,
			enriched:  0,
			errStrs:   []string{"timeout", "timeout", "timeout", "timeout", "timeout"},
			want:      true,
		},
		{
			name:      "mixed quota and other failures still report",
			processed: 4,
			enriched:  0,
			errStrs:   []string{quotaSummary, "listing 3: extract: context deadline exceeded"},
			want:      true,
		},
		{
			name:      "empty errors",
			processed: 5,
			enriched:  0,
			errStrs:   nil,
			want:      false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := shouldCaptureEnrichListingErrorsAggregate(tt.processed, tt.enriched, tt.errStrs)
			if got != tt.want {
				t.Fatalf("shouldCapture = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestOperationalScrapeWarning_dedupesPerStorePhase(t *testing.T) {
	operationalScrapeWarningGate.Reset()
	t.Cleanup(operationalScrapeWarningGate.Reset)

	now := time.Date(2026, 10, 8, 0, 0, 0, 0, time.UTC)
	if !allowOperationalScrapeWarning("JensonUSA", "thin_scrape", now) {
		t.Fatal("first warning")
	}
	if allowOperationalScrapeWarning("JensonUSA", "thin_scrape", now.Add(time.Hour)) {
		t.Fatal("repeat thin scrape inside the day")
	}
	if !allowOperationalScrapeWarning("JensonUSA", "truncated", now) {
		t.Fatal("page cap is a different phase")
	}
	if !allowOperationalScrapeWarning("ION", "thin_scrape", now) {
		t.Fatal("other store")
	}
	if !allowOperationalScrapeWarning("JensonUSA", "thin_scrape", now.Add(operationalScrapeWarningInterval)) {
		t.Fatal("same store and phase after a day")
	}
}
