package scheduler

import (
	"context"

	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/enrichstate"
	"github.com/mtb-aggregator/api/internal/llm"
	"github.com/mtb-aggregator/api/internal/llmlisting"
	"github.com/mtb-aggregator/api/internal/scraper"
)

type schedulerLLMRunner struct {
	pool   *db.DB
	client *llm.Client
}

func (r schedulerLLMRunner) ClassificationStep(ctx context.Context, listingID int) error {
	return llmlisting.ClassificationStep(ctx, r.pool, r.client, listingID)
}

func (r schedulerLLMRunner) SpecExtractionStep(ctx context.Context, listingID int) error {
	return llmlisting.SpecExtractionStep(ctx, r.pool, r.client, listingID)
}

type quotaLLMRunner struct {
	inner   enrichstate.LLMRunner
	state   *llmlisting.QuotaJobState
	errStrs *[]string
}

func (q quotaLLMRunner) ClassificationStep(ctx context.Context, listingID int) error {
	if q.state != nil && q.state.QuotaHalted() {
		return nil
	}
	err := q.inner.ClassificationStep(ctx, listingID)
	llmlisting.HandleLLMStepError(err, q.state, q.errStrs, listingID, "classify", "scheduler", "enrich")
	return err
}

func (q quotaLLMRunner) SpecExtractionStep(ctx context.Context, listingID int) error {
	if q.state != nil && q.state.QuotaHalted() {
		return nil
	}
	err := q.inner.SpecExtractionStep(ctx, listingID)
	llmlisting.HandleLLMStepError(err, q.state, q.errStrs, listingID, "extract", "scheduler", "enrich")
	return err
}

type variantFanoutState struct {
	jenson map[string]bool
	cc     map[string]bool
	uc     map[string]bool
	fox    map[string]bool
	bell   map[string]bool
	giro   map[string]bool
}

func newVariantFanoutState() *variantFanoutState {
	return &variantFanoutState{
		jenson: make(map[string]bool),
		cc:     make(map[string]bool),
		uc:     make(map[string]bool),
		fox:    make(map[string]bool),
		bell:   make(map[string]bool),
		giro:   make(map[string]bool),
	}
}

func (s *variantFanoutState) reset() {
	for k := range s.jenson {
		delete(s.jenson, k)
	}
	for k := range s.cc {
		delete(s.cc, k)
	}
	for k := range s.uc {
		delete(s.uc, k)
	}
	for k := range s.fox {
		delete(s.fox, k)
	}
	for k := range s.bell {
		delete(s.bell, k)
	}
	for k := range s.giro {
		delete(s.giro, k)
	}
}

func (sch *Scheduler) buildEnrichmentPipeline(llmState *llmlisting.QuotaJobState, errStrs *[]string, fanout *variantFanoutState) *enrichstate.Pipeline {
	return &enrichstate.Pipeline{
		State:     db.EnrichmentStateStore{DB: sch.db},
		Snapshots: db.EnrichmentSnapshotStore{DB: sch.db},
		Events:    db.EnrichmentEventRecorder{DB: sch.db},
		Scraper:   sch.scraper,
		CircuitBreaker: enrichstate.NewCircuitBreaker(
			enrichstate.CircuitBreakerThreshold(),
		),
		LLM: quotaLLMRunner{
			inner:   schedulerLLMRunner{pool: sch.db, client: sch.llm},
			state:   llmState,
			errStrs: errStrs,
		},
		Listings: db.EnrichmentListingStore{DB: sch.db},
		Config: enrichstate.LoadConfigFromEnv(),
		BeforeClaimBatch: func(step enrichstate.Step) {
			if step == enrichstate.StepPDP && fanout != nil {
				fanout.reset()
			}
		},
		Fanout: func(ctx context.Context, item enrichstate.WorkItem, variants []scraper.EnrichVariant) error {
			if fanout == nil || len(variants) == 0 {
				return nil
			}
			if err := sch.db.ApplyJensonPDPVariantFanout(ctx, item.StoreID, item.StoreType, item.StoreSKU, enrichVariantsToJenson(variants), fanout.jenson); err != nil {
				return err
			}
			if err := applyCompetitiveCyclistVariantFanout(ctx, sch.db, item.ListingID, item.StoreID, item.StoreType, item.StoreSKU, item.ProductURL, variants, fanout.cc); err != nil {
				return err
			}
			if err := applyUniversalCyclesVariantFanout(ctx, sch.db, item.ListingID, item.StoreType, variants, fanout.uc); err != nil {
				return err
			}
			if err := sch.db.ApplyFoxRacingPDPVariantFanout(ctx, item.StoreID, item.StoreType, item.StoreSKU, enrichVariantsToJenson(variants), fanout.fox); err != nil {
				return err
			}
			if err := sch.db.ApplyBellPDPVariantFanout(ctx, item.StoreID, item.StoreType, item.ProductURL, enrichVariantsToJenson(variants), fanout.bell); err != nil {
				return err
			}
			if err := sch.db.ApplyGiroPDPVariantFanout(ctx, item.StoreID, item.StoreType, item.ProductURL, enrichVariantsToJenson(variants), fanout.giro); err != nil {
				return err
			}
			return nil
		},
	}
}

func enrichmentFilterToClaim(f db.EnrichmentFilter) enrichstate.ClaimFilter {
	return enrichstate.ClaimFilter{
		StoreType:          f.StoreType,
		CanonicalCategory:  f.CanonicalCategory,
		LlmConfidenceBelow: f.LlmConfidenceBelow,
	}
}
