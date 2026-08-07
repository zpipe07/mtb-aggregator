package enrichstate

import (
	"math"
	"time"
)

// NextBackoff computes the next retry time using exponential backoff with cap.
// attempt is 1-based (first failure = 1).
func NextBackoff(attempt int, base, max time.Duration, now time.Time, jitterSeed int64) time.Time {
	if attempt < 1 {
		attempt = 1
	}
	if base <= 0 {
		base = 5 * time.Minute
	}
	if max <= 0 {
		max = 6 * time.Hour
	}
	exp := attempt - 1
	if exp > 10 {
		exp = 10
	}
	delay := time.Duration(float64(base) * math.Pow(2, float64(exp)))
	if delay > max {
		delay = max
	}
	// Deterministic jitter in [0, 25% of delay) from seed for testability.
	jitter := time.Duration(0)
	if delay > 0 && jitterSeed != 0 {
		jitter = time.Duration(int64(delay) / 4 * (jitterSeed % 100) / 100)
	}
	return now.Add(delay + jitter)
}

// IsDead returns true when attempts reached maxAttempts.
func IsDead(attempts, maxAttempts int) bool {
	return maxAttempts > 0 && attempts >= maxAttempts
}

func maxAttemptsForStep(step Step, cfg Config) int {
	switch step {
	case StepPDP:
		return cfg.MaxPDPAttempts
	case StepClassify:
		return cfg.MaxClassifyAttempts
	case StepExtract:
		return cfg.MaxExtractAttempts
	default:
		return 5
	}
}
