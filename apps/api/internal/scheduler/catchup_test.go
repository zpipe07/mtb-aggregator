package scheduler

import (
	"testing"
	"time"
)

func TestRunCatchUp_signatureIsScrapeAndLLMOnly(t *testing.T) {
	t.Parallel()
	// Compile-time guard: RunCatchUp no longer accepts enrichInterval (PDP drainer replaces catch-up burst).
	var fn func(*Scheduler, time.Duration, time.Duration) = (*Scheduler).RunCatchUp
	if fn == nil {
		t.Fatal("RunCatchUp missing")
	}
}
