// Package sentryutil wraps Sentry captures with consistent tags for background jobs.
// No-op when Sentry is not initialized (no DSN).
package sentryutil

import (
	"fmt"

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
