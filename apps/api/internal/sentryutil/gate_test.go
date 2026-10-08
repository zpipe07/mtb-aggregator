package sentryutil

import (
	"testing"
	"time"
)

func TestIntervalGate_allowsOncePerIntervalPerKey(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)
	gate := NewIntervalGate(time.Hour)

	if !gate.Allow("quota", start) {
		t.Fatal("first allow")
	}
	if gate.Allow("quota", start.Add(time.Minute)) {
		t.Fatal("repeat inside the interval")
	}
	if !gate.Allow("other", start) {
		t.Fatal("different key")
	}
	if !gate.Allow("quota", start.Add(time.Hour)) {
		t.Fatal("key after the interval")
	}
	if gate.Allow("quota", start.Add(time.Hour+time.Minute)) {
		t.Fatal("restarted interval still blocks")
	}
}

func TestIntervalGate_nonPositiveIntervalAllowsEveryCall(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)
	gate := NewIntervalGate(0)
	first := gate.Allow("quota", now)
	second := gate.Allow("quota", now)
	if !first || !second {
		t.Fatal("non-positive interval should allow every call")
	}
}
