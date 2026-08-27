package db

import (
	"strings"
	"testing"
	"time"

	"github.com/mtb-aggregator/api/internal/enrichstate"
)

func TestStepClaimEligibility_PDPUseStaleCutoffParam(t *testing.T) {
	t.Parallel()
	now := time.Unix(1_700_000_000, 0)
	stale := 30 * 24 * time.Hour
	args := []interface{}{now, time.Time{}, 1}
	argNum := 4
	where, _, err := stepClaimEligibility(enrichstate.StepPDP, false, now, stale, &argNum, &args)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(where, "pdp_fetched_at IS NULL") {
		t.Fatalf("expected never-fetched clause, got %q", where)
	}
	if !strings.Contains(where, "pdp_fetched_at < $4") {
		t.Fatalf("expected parameterized stale cutoff $4, got %q", where)
	}
	if len(args) != 4 {
		t.Fatalf("args len = %d, want 4 (stale cutoff appended)", len(args))
	}
	cutoff, ok := args[3].(time.Time)
	if !ok || !cutoff.Equal(now.Add(-stale)) {
		t.Fatalf("stale cutoff = %v, want %v", args[3], now.Add(-stale))
	}
}

func TestStepClaimEligibility_PDPForceSkipsStale(t *testing.T) {
	t.Parallel()
	now := time.Now()
	args := []interface{}{now}
	argNum := 2
	where, _, err := stepClaimEligibility(enrichstate.StepPDP, true, now, 30*24*time.Hour, &argNum, &args)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(where, "pdp_fetched_at <") {
		t.Fatalf("force mode should not add stale filter, got %q", where)
	}
}
