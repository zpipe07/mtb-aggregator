package scheduler

import (
	"testing"
	"time"
)

func TestRunCatchUp_signatureIsScrapeAndLLMOnly(t *testing.T) {
	t.Parallel()
	// Compile-time guard: RunCatchUp accepts scrape + LLM intervals only (no enrichInterval).
	var _ func(*Scheduler, time.Duration, time.Duration) = (*Scheduler).RunCatchUp
}
