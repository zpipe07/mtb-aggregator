package enrichstate

import "sort"

// CircuitBreaker skips remaining listings for a store after consecutive PDP failures.
type CircuitBreaker struct {
	threshold   int
	consecutive map[string]int
	tripped     map[string]bool
}

// NewCircuitBreaker returns a per-store circuit breaker. threshold <= 0 disables tripping.
func NewCircuitBreaker(threshold int) *CircuitBreaker {
	return &CircuitBreaker{
		threshold:   threshold,
		consecutive: make(map[string]int),
		tripped:     make(map[string]bool),
	}
}

// RecordFailure increments consecutive failures for storeType and trips when threshold is reached.
// Returns true when the store was just tripped.
func (cb *CircuitBreaker) RecordFailure(storeType string) bool {
	if cb == nil || cb.threshold <= 0 {
		return false
	}
	cb.consecutive[storeType]++
	if cb.consecutive[storeType] >= cb.threshold {
		if cb.tripped[storeType] {
			return false
		}
		cb.tripped[storeType] = true
		return true
	}
	return false
}

// RecordSuccess resets consecutive failures for storeType.
func (cb *CircuitBreaker) RecordSuccess(storeType string) {
	if cb == nil {
		return
	}
	delete(cb.consecutive, storeType)
	delete(cb.tripped, storeType)
}

// IsTripped reports whether remaining PDP work for storeType should be skipped this job.
func (cb *CircuitBreaker) IsTripped(storeType string) bool {
	if cb == nil {
		return false
	}
	return cb.tripped[storeType]
}

// TrippedStores returns store types currently tripped, sorted for stable logging.
func (cb *CircuitBreaker) TrippedStores() []string {
	if cb == nil {
		return nil
	}
	out := make([]string, 0, len(cb.tripped))
	for storeType, tripped := range cb.tripped {
		if tripped {
			out = append(out, storeType)
		}
	}
	sort.Strings(out)
	return out
}
