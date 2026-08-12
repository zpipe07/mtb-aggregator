package scheduler

import (
	"os"
	"testing"
	"time"
)

func TestGetScrapeJobTimeout_default(t *testing.T) {
	t.Setenv("SCRAPE_JOB_TIMEOUT", "")
	if got := getScrapeJobTimeout(); got != 20*time.Minute {
		t.Errorf("getScrapeJobTimeout() = %v, want 20m", got)
	}
}

func TestGetScrapeJobTimeout_envOverride(t *testing.T) {
	t.Setenv("SCRAPE_JOB_TIMEOUT", "45m")
	if got := getScrapeJobTimeout(); got != 45*time.Minute {
		t.Errorf("getScrapeJobTimeout() = %v, want 45m", got)
	}
}

func TestGetScrapeIngestTimeout_default(t *testing.T) {
	t.Setenv("SCRAPE_INGEST_TIMEOUT", "")
	if got := getScrapeIngestTimeout(); got != 15*time.Minute {
		t.Errorf("getScrapeIngestTimeout() = %v, want 15m", got)
	}
}

func TestGetScrapeIngestTimeout_envOverride(t *testing.T) {
	t.Setenv("SCRAPE_INGEST_TIMEOUT", "30m")
	if got := getScrapeIngestTimeout(); got != 30*time.Minute {
		t.Errorf("getScrapeIngestTimeout() = %v, want 30m", got)
	}
}

func TestGetScrapeJobTimeout_invalidEnvIgnored(t *testing.T) {
	prev := os.Getenv("SCRAPE_JOB_TIMEOUT")
	t.Cleanup(func() { _ = os.Setenv("SCRAPE_JOB_TIMEOUT", prev) })
	_ = os.Setenv("SCRAPE_JOB_TIMEOUT", "not-a-duration")
	if got := getScrapeJobTimeout(); got != 20*time.Minute {
		t.Errorf("getScrapeJobTimeout() with invalid env = %v, want default 20m", got)
	}
}
