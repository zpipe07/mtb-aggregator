package enrichstate

import "testing"

func TestCircuitBreaker_RecordFailureTripsAtThreshold(t *testing.T) {
	t.Parallel()
	cb := NewCircuitBreaker(3)

	for i := 0; i < 2; i++ {
		if cb.RecordFailure("jensonusa") {
			t.Fatalf("unexpected trip on failure %d", i+1)
		}
		if cb.IsTripped("jensonusa") {
			t.Fatal("should not be tripped before threshold")
		}
	}

	if !cb.RecordFailure("jensonusa") {
		t.Fatal("expected trip on third failure")
	}
	if !cb.IsTripped("jensonusa") {
		t.Fatal("expected store to be tripped")
	}
	if cb.RecordFailure("jensonusa") {
		t.Fatal("already tripped; RecordFailure should not report trip again")
	}
}

func TestCircuitBreaker_RecordSuccessResets(t *testing.T) {
	t.Parallel()
	cb := NewCircuitBreaker(3)
	cb.RecordFailure("jensonusa")
	cb.RecordFailure("jensonusa")
	cb.RecordSuccess("jensonusa")

	if cb.IsTripped("jensonusa") {
		t.Fatal("success should clear tripped state")
	}
	if cb.RecordFailure("jensonusa") {
		t.Fatal("first failure after reset should not trip")
	}
}

func TestCircuitBreaker_TrippedStoresSorted(t *testing.T) {
	t.Parallel()
	cb := NewCircuitBreaker(1)
	cb.RecordFailure("jensonusa")
	cb.RecordFailure("giro")

	got := cb.TrippedStores()
	if len(got) != 2 || got[0] != "giro" || got[1] != "jensonusa" {
		t.Fatalf("TrippedStores() = %#v, want [giro jensonusa]", got)
	}
}

func TestCircuitBreaker_DisabledWhenThresholdZero(t *testing.T) {
	t.Parallel()
	cb := NewCircuitBreaker(0)
	for i := 0; i < 10; i++ {
		if cb.RecordFailure("jensonusa") {
			t.Fatal("disabled breaker should never trip")
		}
	}
	if cb.IsTripped("jensonusa") {
		t.Fatal("disabled breaker should never trip")
	}
}
