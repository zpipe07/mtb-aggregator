package llmlisting

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/mtb-aggregator/api/internal/llm"
	"github.com/mtb-aggregator/api/internal/sentryutil"
)

func TestHandleLLMStepError_quotaOncePerJobAndAcrossJobs(t *testing.T) {
	quotaSentryGate.Reset()
	t.Cleanup(func() {
		quotaSentryGate.Reset()
		quotaSentryNow = time.Now
		captureLLMError = sentryutil.CaptureError
	})

	now := time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)
	quotaSentryNow = func() time.Time { return now }
	var captured int
	captureLLMError = func(error, map[string]string) { captured++ }

	err := fmt.Errorf("call: %w: credit_balance_exhausted", llm.ErrQuotaExhausted)
	var state QuotaJobState
	var errStrs []string
	HandleLLMStepError(err, &state, &errStrs, 1, "classify", "scheduler", "enrich")
	HandleLLMStepError(err, &state, &errStrs, 2, "extract", "scheduler", "enrich")
	if captured != 1 {
		t.Fatalf("same job captures = %d, want 1", captured)
	}
	if !state.QuotaHalted() {
		t.Fatal("quota should halt the job")
	}
	if len(errStrs) != 1 {
		t.Fatalf("errStrs = %v, want one quota summary", errStrs)
	}

	var second QuotaJobState
	HandleLLMStepError(err, &second, &errStrs, 3, "classify", "scheduler", "enrich")
	if captured != 1 {
		t.Fatalf("second job inside cooldown captures = %d, want 1", captured)
	}
	if !second.quotaSentrySent || !second.QuotaHalted() {
		t.Fatal("second job should still halt and mark the report handled")
	}

	now = now.Add(quotaExhaustedSentryInterval)
	var third QuotaJobState
	HandleLLMStepError(err, &third, nil, 4, "classify", "scheduler", "enrich")
	if captured != 2 {
		t.Fatalf("after cooldown captures = %d, want 2", captured)
	}
}

func TestHandleLLMStepError_nilStateQuotaStillRateLimited(t *testing.T) {
	quotaSentryGate.Reset()
	t.Cleanup(func() {
		quotaSentryGate.Reset()
		quotaSentryNow = time.Now
		captureLLMError = sentryutil.CaptureError
	})
	now := time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)
	quotaSentryNow = func() time.Time { return now }
	var captured int
	captureLLMError = func(error, map[string]string) { captured++ }

	err := fmt.Errorf("%w: billing", llm.ErrQuotaExhausted)
	HandleLLMStepError(err, nil, nil, 9, "classify", "api", "admin_enrich")
	HandleLLMStepError(err, nil, nil, 10, "extract", "api", "admin_enrich")
	if captured != 1 {
		t.Fatalf("admin captures = %d, want 1", captured)
	}
}

func TestHandleLLMStepError_otherErrorsStayCappedPerJob(t *testing.T) {
	t.Cleanup(func() { captureLLMError = sentryutil.CaptureError })
	var captured int
	captureLLMError = func(error, map[string]string) { captured++ }

	err := errors.New("openai api 500: overloaded")
	var state QuotaJobState
	for i := 0; i < maxLLMErrorSentryPerJob+2; i++ {
		HandleLLMStepError(err, &state, nil, i, "extract", "scheduler", "enrich")
	}
	if captured != maxLLMErrorSentryPerJob {
		t.Fatalf("other captures = %d, want %d", captured, maxLLMErrorSentryPerJob)
	}
	if state.QuotaHalted() {
		t.Fatal("non-quota errors must not halt the job")
	}
}
