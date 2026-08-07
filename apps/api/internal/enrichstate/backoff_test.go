package enrichstate

import (
	"testing"
	"time"
)

func TestNextBackoff_exponentialWithCap(t *testing.T) {
	t.Parallel()
	base := 5 * time.Minute
	max := 30 * time.Minute
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	d1 := NextBackoff(1, base, max, now, 0)
	if d1.Sub(now) != base {
		t.Fatalf("attempt 1: got %v want %v", d1.Sub(now), base)
	}
	d3 := NextBackoff(3, base, max, now, 0)
	want3 := 20 * time.Minute
	if d3.Sub(now) != want3 {
		t.Fatalf("attempt 3: got %v want %v", d3.Sub(now), want3)
	}
	d10 := NextBackoff(10, base, max, now, 0)
	if d10.Sub(now) != max {
		t.Fatalf("attempt 10 should cap at max: got %v", d10.Sub(now))
	}
}

func TestIsDead(t *testing.T) {
	t.Parallel()
	if IsDead(4, 5) {
		t.Fatal("4 attempts should not be dead with max 5")
	}
	if !IsDead(5, 5) {
		t.Fatal("5 attempts should be dead with max 5")
	}
}
