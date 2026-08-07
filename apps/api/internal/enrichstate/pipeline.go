package enrichstate

import (
	"context"
	"encoding/json"
	"log"
	"strconv"
	"time"

	"github.com/mtb-aggregator/api/internal/scraper"
)

// ScraperEnricher fetches PDP data from the scraper service.
type ScraperEnricher interface {
	Enrich(ctx context.Context, productURL, store string) (*scraper.EnrichResult, error)
}

// LLMRunner runs classify/extract against listing data in the DB.
type LLMRunner interface {
	ClassificationStep(ctx context.Context, listingID int) error
	SpecExtractionStep(ctx context.Context, listingID int) error
}

// VariantFanout applies store-specific variant sibling updates after PDP success.
type VariantFanout func(ctx context.Context, item WorkItem, variants []scraper.EnrichVariant) error

// Pipeline orchestrates three enrichment passes over durable step state.
type Pipeline struct {
	State            StateStore
	Snapshots        SnapshotStore
	Events           EventRecorder
	Scraper          ScraperEnricher
	LLM              LLMRunner
	Listings         ListingStore
	Config           Config
	Fanout           VariantFanout
	BeforeClaimBatch func(step Step)
}

// RunJob executes PDP, classify, and extract passes until batch limits or timeout.
// maxListings caps each step independently: a large PDP backlog must not starve
// the classify/extract passes of their budget.
func (p *Pipeline) RunJob(ctx context.Context, filter ClaimFilter, force bool, batchSize, maxListings int, jobID *int) (processed, succeeded int, errStrs []string) {
	cfg := p.Config
	if cfg.BackoffBase == 0 {
		cfg = DefaultConfig()
	}

	for _, step := range []Step{StepPDP, StepClassify, StepExtract} {
		stepProcessed := 0
		for {
			if ctx.Err() != nil {
				return processed, succeeded, errStrs
			}
			if maxListings > 0 && stepProcessed >= maxListings {
				break
			}
			limit := batchSize
			if maxListings > 0 && maxListings-stepProcessed < limit {
				limit = maxListings - stepProcessed
			}
			if p.BeforeClaimBatch != nil {
				p.BeforeClaimBatch(step)
			}
			now := time.Now()
			items, err := p.State.ClaimForStep(ctx, step, filter, limit, force, now)
			if err != nil {
				errStrs = append(errStrs, string(step)+": claim: "+err.Error())
				return processed, succeeded, errStrs
			}
			if len(items) == 0 {
				break
			}
			for _, item := range items {
				if ctx.Err() != nil {
					return processed, succeeded, errStrs
				}
				stepProcessed++
				processed++
				ok, stepErr := p.runOne(ctx, step, item, force, jobID, now, cfg)
				if stepErr != nil {
					errStrs = append(errStrs, "listing "+strconv.Itoa(item.ListingID)+": "+string(step)+": "+stepErr.Error())
				}
				if ok {
					succeeded++
				}
			}
			if len(items) < limit {
				break
			}
		}
	}
	return processed, succeeded, errStrs
}

func (p *Pipeline) runOne(ctx context.Context, step Step, item WorkItem, force bool, jobID *int, now time.Time, cfg Config) (success bool, err error) {
	start := time.Now()
	if err := p.State.EnsureRow(ctx, item.ListingID); err != nil {
		return false, err
	}
	state, err := p.State.GetState(ctx, item.ListingID)
	if err != nil {
		return false, err
	}
	if state == nil {
		state = &ListingState{ListingID: item.ListingID}
	}

	var snap *Snapshot
	if step != StepPDP {
		snap, _ = p.Snapshots.Get(ctx, item.ListingID)
	}
	in := p.buildStepInput(ctx, *state, snap, force, now, cfg, item.ListingID)
	if ShouldSkipLLMStep(step, in) {
		p.recordEvent(ctx, item.ListingID, step, StatusSkipped, "", nil, jobID, start)
		return true, nil
	}

	switch step {
	case StepPDP:
		return p.runPDP(ctx, item, jobID, start, cfg, now)
	case StepClassify:
		return p.runClassify(ctx, item, snap, jobID, start, cfg, now)
	case StepExtract:
		return p.runExtract(ctx, item, snap, jobID, start, cfg, now)
	default:
		return false, nil
	}
}

func (p *Pipeline) buildStepInput(ctx context.Context, state ListingState, snap *Snapshot, force bool, now time.Time, cfg Config, listingID int) StepDueInput {
	in := StepDueInput{
		Now:      now,
		Force:    force,
		Config:   cfg,
		State:    state,
		Snapshot: snap,
	}
	if p.Listings == nil {
		return in
	}
	listing, err := p.Listings.GetListingForLLM(ctx, listingID)
	if err != nil || listing == nil {
		return in
	}
	in.HasCanonicalCategory = len(listing.CanonicalCategory) > 0
	if len(listing.CanonicalCategory) > 0 {
		if ts, err := p.Listings.GetPromptProfileUpdatedAt(ctx, listing.CanonicalCategory); err == nil && ts != nil {
			in.HasPromptProfile = true
			in.ProfileUpdatedAt = ts
		}
	}
	return in
}

func (p *Pipeline) runPDP(ctx context.Context, item WorkItem, jobID *int, start time.Time, cfg Config, now time.Time) (bool, error) {
	result, err := p.Scraper.Enrich(ctx, item.ProductURL, item.StoreType)
	if err != nil {
		return p.failStep(ctx, item.ListingID, StepPDP, err, start, jobID, cfg, now)
	}
	payload := enrichResultToSnapshot(result)
	hash, _, err := HashSnapshotPayload(payload)
	if err != nil {
		return p.failStep(ctx, item.ListingID, StepPDP, err, start, jobID, cfg, now)
	}
	if err := p.Snapshots.Save(ctx, Snapshot{
		ListingID:   item.ListingID,
		Payload:     payload,
		ContentHash: hash,
		FetchedAt:   now,
	}); err != nil {
		return false, err
	}
	if p.Listings == nil {
		return p.failStep(ctx, item.ListingID, StepPDP, errMissingListings{}, start, jobID, cfg, now)
	}
	if err := p.Listings.UpdateListingEnrichment(ctx, item.ListingID, result.CategoryPath, result.RawSpecs, result.Unavailable, result.Description); err != nil {
		return p.failStep(ctx, item.ListingID, StepPDP, err, start, jobID, cfg, now)
	}
	if p.Fanout != nil && len(result.Variants) > 0 {
		if err := p.Fanout(ctx, item, result.Variants); err != nil {
			log.Printf("[enrichstate] variant fan-out listing %d: %v", item.ListingID, err)
		}
	}
	// No PDPHash here: pdp_hash tracks the content hash last processed by the
	// LLM steps (written on classify/extract success). The fresh fetch hash
	// lives on the snapshot; overwriting pdp_hash would erase the "content
	// changed since classification" signal.
	if err := p.State.RecordStepSuccess(ctx, item.ListingID, StepPDP, StepSuccessMeta{}, now); err != nil {
		return false, err
	}
	p.recordEvent(ctx, item.ListingID, StepPDP, StatusSuccess, "", nil, jobID, start)
	return true, nil
}

func (p *Pipeline) runClassify(ctx context.Context, item WorkItem, snap *Snapshot, jobID *int, start time.Time, cfg Config, now time.Time) (bool, error) {
	if snap == nil {
		return p.failStep(ctx, item.ListingID, StepClassify, errMissingSnapshot{}, start, jobID, cfg, now)
	}
	if p.LLM == nil {
		return p.failStep(ctx, item.ListingID, StepClassify, errMissingLLM{}, start, jobID, cfg, now)
	}
	if err := p.LLM.ClassificationStep(ctx, item.ListingID); err != nil {
		return p.failStep(ctx, item.ListingID, StepClassify, err, start, jobID, cfg, now)
	}
	meta := StepSuccessMeta{PDPHash: snap.ContentHash}
	if p.Listings != nil {
		listing, err := p.Listings.GetListingForCategoryClassification(ctx, item.ListingID)
		if err == nil && listing != nil {
			if c, ok := confidenceFromMetadata(listing.Metadata); ok {
				meta.LLMConfidence = &c
			}
		}
		listingLLM, _ := p.Listings.GetListingForLLM(ctx, item.ListingID)
		if listingLLM != nil && len(listingLLM.CanonicalCategory) > 0 {
			if ts, err := p.Listings.GetPromptProfileUpdatedAt(ctx, listingLLM.CanonicalCategory); err == nil {
				meta.PromptProfileVersion = ts
			}
		}
	}
	if err := p.State.RecordStepSuccess(ctx, item.ListingID, StepClassify, meta, now); err != nil {
		return false, err
	}
	p.recordEvent(ctx, item.ListingID, StepClassify, StatusSuccess, "", meta.LLMConfidence, jobID, start)
	return true, nil
}

func (p *Pipeline) runExtract(ctx context.Context, item WorkItem, snap *Snapshot, jobID *int, start time.Time, cfg Config, now time.Time) (bool, error) {
	if snap == nil {
		return p.failStep(ctx, item.ListingID, StepExtract, errMissingSnapshot{}, start, jobID, cfg, now)
	}
	if p.LLM == nil {
		return p.failStep(ctx, item.ListingID, StepExtract, errMissingLLM{}, start, jobID, cfg, now)
	}
	if err := p.LLM.SpecExtractionStep(ctx, item.ListingID); err != nil {
		return p.failStep(ctx, item.ListingID, StepExtract, err, start, jobID, cfg, now)
	}
	meta := StepSuccessMeta{PDPHash: snap.ContentHash}
	if p.Listings != nil {
		listing, err := p.Listings.GetListingForLLM(ctx, item.ListingID)
		if err == nil && listing != nil && len(listing.CanonicalCategory) > 0 {
			if ts, err := p.Listings.GetPromptProfileUpdatedAt(ctx, listing.CanonicalCategory); err == nil {
				meta.PromptProfileVersion = ts
			}
		}
	}
	if err := p.State.RecordStepSuccess(ctx, item.ListingID, StepExtract, meta, now); err != nil {
		return false, err
	}
	p.recordEvent(ctx, item.ListingID, StepExtract, StatusSuccess, "", nil, jobID, start)
	return true, nil
}

func (p *Pipeline) failStep(ctx context.Context, listingID int, step Step, cause error, start time.Time, jobID *int, cfg Config, now time.Time) (bool, error) {
	st, _ := p.State.GetState(ctx, listingID)
	attempts := 1
	if st != nil {
		switch step {
		case StepPDP:
			attempts = st.PDP.Attempts + 1
		case StepClassify:
			attempts = st.Classify.Attempts + 1
		case StepExtract:
			attempts = st.Extract.Attempts + 1
		}
	}
	max := maxAttemptsForStep(step, cfg)
	dead := IsDead(attempts, max)
	next := NextBackoff(attempts, cfg.BackoffBase, cfg.BackoffMax, now, int64(listingID))
	msg := cause.Error()
	if err := p.State.RecordStepFailure(ctx, listingID, step, msg, next, dead); err != nil {
		return false, err
	}
	p.recordEvent(ctx, listingID, step, StatusFailure, msg, nil, jobID, start)
	if dead {
		return false, ErrStepDead
	}
	return false, cause
}

func (p *Pipeline) recordEvent(ctx context.Context, listingID int, step Step, status EventStatus, errMsg string, conf *float64, jobID *int, start time.Time) {
	if p.Events == nil {
		return
	}
	dur := int(time.Since(start).Milliseconds())
	_ = p.Events.Record(ctx, Event{
		ListingID:  listingID,
		Step:       step,
		Status:     status,
		Error:      errMsg,
		Confidence: conf,
		DurationMs: dur,
		JobID:      jobID,
	})
}

type errMissingSnapshot struct{}

func (errMissingSnapshot) Error() string { return "missing PDP snapshot" }

type errMissingListings struct{}

func (errMissingListings) Error() string { return "pipeline listing store not configured" }

type errMissingLLM struct{}

func (errMissingLLM) Error() string { return "pipeline LLM not configured" }

func enrichResultToSnapshot(r *scraper.EnrichResult) SnapshotPayload {
	if r == nil {
		return SnapshotPayload{}
	}
	out := SnapshotPayload{
		CategoryPath: append([]string(nil), r.CategoryPath...),
		RawSpecs:     r.RawSpecs,
		Unavailable:  r.Unavailable,
		Description:  r.Description,
	}
	for _, v := range r.Variants {
		out.Variants = append(out.Variants, SnapshotVariant{
			SKU:            v.Code,
			VariantOptions: v.Dimensions,
			IsOrderable:    v.IsOrderable,
			CurrentPrice:   v.CurrentPrice,
			OriginalPrice:  v.OriginalPrice,
		})
	}
	return out
}

func confidenceFromMetadata(meta []byte) (float64, bool) {
	var root map[string]interface{}
	if err := json.Unmarshal(meta, &root); err != nil {
		return 0, false
	}
	lm, _ := root["llm_category"].(map[string]interface{})
	if lm == nil {
		return 0, false
	}
	switch c := lm["confidence"].(type) {
	case float64:
		return c, true
	default:
		return 0, false
	}
}
