package scheduler

import (
	"errors"
	"fmt"
	"testing"

	"github.com/mtb-aggregator/api/internal/enrichstate"
	"github.com/mtb-aggregator/api/internal/llm"
	"github.com/mtb-aggregator/api/internal/llmlisting"
)

func TestLLMStepError_quotaDoesNotLookLikeSuccess(t *testing.T) {
	t.Parallel()
	if err := llmStepError(nil, true); !errors.Is(err, enrichstate.ErrStepDeferred) {
		t.Fatalf("halted nil error = %v, want deferred", err)
	}
	quota := fmt.Errorf("call: %w: credit_balance_exhausted", llm.ErrQuotaExhausted)
	if err := llmStepError(quota, false); !errors.Is(err, enrichstate.ErrStepDeferred) {
		t.Fatalf("quota error = %v, want deferred", err)
	}
	if err := llmStepError(nil, false); err != nil {
		t.Fatalf("success = %v, want nil", err)
	}
}

func TestLLMStepError_skipAndNotReady(t *testing.T) {
	t.Parallel()
	skipped := fmt.Errorf("%w: confidence below threshold", llmlisting.ErrClassifySkipped)
	if err := llmStepError(skipped, false); !errors.Is(err, enrichstate.ErrStepSkipped) {
		t.Fatalf("skip = %v", err)
	}
	notReady := fmt.Errorf("%w: classifier disabled", llmlisting.ErrClassifyNotReady)
	if err := llmStepError(notReady, false); !errors.Is(err, enrichstate.ErrStepNotReady) {
		t.Fatalf("not ready = %v", err)
	}
	if llmlisting.ShouldReportLLMStepError(skipped) || llmlisting.ShouldReportLLMStepError(notReady) {
		t.Fatal("skip and not-ready must not be reported to Sentry")
	}
	if !llmlisting.ShouldReportLLMStepError(fmt.Errorf("%w: billing", llm.ErrQuotaExhausted)) {
		t.Fatal("quota must still be reported")
	}
}
