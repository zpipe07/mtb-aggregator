// Package sentryutil wraps Sentry captures with consistent tags for background jobs.
// No-op when Sentry is not initialized (no DSN).
package sentryutil

import (
	"fmt"
	"sync"
	"time"

	"github.com/getsentry/sentry-go"
)

// CaptureError reports err to Sentry with tags.
func CaptureError(err error, tags map[string]string) {
	if err == nil {
		return
	}
	sentry.WithScope(func(scope *sentry.Scope) {
		for k, v := range tags {
			scope.SetTag(k, v)
		}
		sentry.CaptureException(err)
	})
}

// CapturePanicValue reports a recovered panic to Sentry.
func CapturePanicValue(r interface{}, tags map[string]string) {
	if r == nil {
		return
	}
	CaptureError(fmt.Errorf("panic: %v", r), tags)
}

// CaptureWarning sends a warning-level message (e.g. health signals).
func CaptureWarning(msg string, tags map[string]string) {
	sentry.WithScope(func(scope *sentry.Scope) {
		scope.SetLevel(sentry.LevelWarning)
		for k, v := range tags {
			scope.SetTag(k, v)
		}
		sentry.CaptureMessage(msg)
	})
}

// IntervalGate allows an action at most once per interval for each key.
// A sustained condition can run again after the interval elapses.
type IntervalGate struct {
	mu       sync.Mutex
	interval time.Duration
	last     map[string]time.Time
}

// NewIntervalGate returns a gate that allows each key once per interval.
// A non-positive interval allows every call.
func NewIntervalGate(interval time.Duration) *IntervalGate {
	return &IntervalGate{
		interval: interval,
		last:     make(map[string]time.Time),
	}
}

// Allow reports whether key may proceed at now. The first call for a key
// succeeds and starts the interval. Later calls fail until the interval has
// elapsed, then succeed and restart it.
func (g *IntervalGate) Allow(key string, now time.Time) bool {
	if g == nil || g.interval <= 0 {
		return true
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if prev, ok := g.last[key]; ok && now.Sub(prev) < g.interval {
		return false
	}
	g.last[key] = now
	return true
}

// Reset clears recorded keys so tests do not share state.
func (g *IntervalGate) Reset() {
	if g == nil {
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	g.last = make(map[string]time.Time)
}
