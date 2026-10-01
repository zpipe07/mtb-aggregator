// Package llmlisting runs LLM category classification and spec extraction from data already in store_listings.
package llmlisting

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"

	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/llm"
	"github.com/mtb-aggregator/api/internal/metadata"
	"github.com/mtb-aggregator/api/internal/sentryutil"
	"github.com/mtb-aggregator/api/internal/taxonomy"
)

const maxLLMErrorSentryPerJob = 5

// ErrClassifySkipped means classify intentionally did not apply a category and
// the reason is persisted (manual override, or below-threshold llm_category).
// Callers may stamp classified_at.
var ErrClassifySkipped = errors.New("classify skipped")

// ErrClassifyNotReady means classify did not run because the classifier or LLM
// client is not configured. Callers must not stamp classified_at.
var ErrClassifyNotReady = errors.New("classify not ready")

// ShouldReportLLMStepError reports whether err is an operational LLM failure.
// Explicit skips and not-ready results are not Sentry events.
func ShouldReportLLMStepError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, ErrClassifySkipped) || errors.Is(err, ErrClassifyNotReady) {
		return false
	}
	return true
}

// QuotaJobState tracks quota exhaustion and rate-limits Sentry noise for one background job run.
type QuotaJobState struct {
	quotaHalted      bool
	quotaErrRecorded bool
	quotaSentrySent  bool
	otherSentryN     int
}

// QuotaHalted reports whether quota exhaustion stopped further LLM calls in this job.
func (s *QuotaJobState) QuotaHalted() bool {
	return s != nil && s.quotaHalted
}

// HandleLLMStepError maps LLM failures to logging/Sentry/job error strings for scheduler-style jobs.
// When state/errStrs are nil, behaves like admin path (single Sentry, no quota halt bookkeeping).
func HandleLLMStepError(err error, state *QuotaJobState, errStrs *[]string, listingID int, phase string,
	component string, job string,
) {
	if err == nil {
		return
	}
	log.Printf("[llmlisting] listing %d (%s/%s): %s failed: %v", listingID, component, job, phase, err)
	tags := map[string]string{
		"component":  component,
		"job":        job,
		"phase":      phase,
		"listing_id": strconv.Itoa(listingID),
	}
	if errors.Is(err, llm.ErrQuotaExhausted) {
		tags["llm_error"] = "quota_exhausted"
		if state != nil {
			state.quotaHalted = true
			if errStrs != nil && !state.quotaErrRecorded {
				*errStrs = append(*errStrs, "OpenAI quota exhausted; LLM classify/extract skipped for remainder of job")
				state.quotaErrRecorded = true
			}
			if !state.quotaSentrySent {
				sentryutil.CaptureError(err, tags)
				state.quotaSentrySent = true
			}
			return
		}
		sentryutil.CaptureError(err, tags)
		return
	}
	tags["llm_error"] = "other"
	if state == nil || state.otherSentryN < maxLLMErrorSentryPerJob {
		sentryutil.CaptureError(err, tags)
		if state != nil {
			state.otherSentryN++
		}
	}
}

// ClassificationStep updates canonical_category / llm_category from the classifier when configured.
func ClassificationStep(ctx context.Context, pool *db.DB, client *llm.Client, listingID int) error {
	if client == nil || !client.Configured() {
		return fmt.Errorf("%w: llm client not configured", ErrClassifyNotReady)
	}
	cfg, err := pool.GetCategoryClassifier(ctx)
	if err != nil {
		return err
	}
	if cfg == nil || !cfg.Enabled {
		return fmt.Errorf("%w: classifier disabled", ErrClassifyNotReady)
	}
	pathRows, err := pool.GetAllCategoryPathsWithDescriptions(ctx)
	if err != nil {
		return err
	}
	if len(pathRows) == 0 {
		return fmt.Errorf("%w: empty category tree", ErrClassifyNotReady)
	}
	validPaths, categoryDesc := db.ClassifierPathsFromTreeRows(pathRows, llm.CategoryPathSeparator)
	listing, err := pool.GetListingForCategoryClassification(ctx, listingID)
	if err != nil {
		return err
	}
	if listing == nil {
		return fmt.Errorf("listing %d not found", listingID)
	}
	if metadata.HasManualCategoryOverride(listing.Metadata) {
		return fmt.Errorf("%w: manual category override", ErrClassifySkipped)
	}
	var meta struct {
		Description string                 `json:"description"`
		Specs       map[string]interface{} `json:"specs"`
	}
	_ = json.Unmarshal(listing.Metadata, &meta)
	specs := specsMapFromMeta(meta.Specs)
	input := llm.ClassifyInput{
		ProductName:  listing.ProductName,
		Description:  meta.Description,
		Specs:        specs,
		CategoryPath: listing.CategoryPath,
	}
	config := llm.ClassifyConfig{
		SystemPrompt:         cfg.SystemPrompt,
		ValidCategories:      validPaths,
		CategoryDescriptions: categoryDesc,
		ConfidenceThreshold:  cfg.ConfidenceThreshold,
	}
	result, err := client.Classify(ctx, config, input)
	if err != nil {
		return err
	}
	if result == nil {
		return fmt.Errorf("%w: classifier returned no result", ErrClassifyNotReady)
	}
	result.CanonicalCategory = taxonomy.RefineListing(result.CanonicalCategory, listing.ProductName)
	llmCategory := map[string]interface{}{
		"canonical_category": result.CanonicalCategory,
		"confidence":         result.Confidence,
		"reasoning":          result.Reasoning,
	}
	if result.Confidence >= config.ConfidenceThreshold {
		if err := pool.UpdateListingCanonicalCategory(ctx, listingID, result.CanonicalCategory, llmCategory); err != nil {
			return fmt.Errorf("listing %d: update category: %w", listingID, err)
		}
		log.Printf("[llmlisting] listing %d: LLM classified as %v (conf=%.2f)", listingID, result.CanonicalCategory, result.Confidence)
		return nil
	}
	if err := pool.UpdateListingLLMCategoryMetadata(ctx, listingID, llmCategory); err != nil {
		return fmt.Errorf("listing %d: save below-threshold category: %w", listingID, err)
	}
	return fmt.Errorf("%w: confidence %.2f below %.2f", ErrClassifySkipped, result.Confidence, config.ConfidenceThreshold)
}

func specsMapFromMeta(specsRaw map[string]interface{}) map[string]string {
	specs := make(map[string]string)
	if specsRaw == nil {
		return specs
	}
	for k, v := range specsRaw {
		if v != nil {
			specs[k] = fmt.Sprint(v)
		}
	}
	return specs
}

// SpecExtractionStep runs prompt-profile extraction and merges into metadata.llm_specs.
func SpecExtractionStep(ctx context.Context, pool *db.DB, client *llm.Client, listingID int) error {
	if client == nil {
		return nil
	}
	listing, err := pool.GetListingForLLM(ctx, listingID)
	if err != nil || listing == nil {
		return nil
	}
	if len(listing.CanonicalCategory) == 0 {
		return nil
	}
	profile, err := pool.GetLLMPromptProfileForCategory(ctx, listing.CanonicalCategory)
	if err != nil || profile == nil {
		return nil
	}
	var meta struct {
		Description string                 `json:"description"`
		Specs       map[string]interface{} `json:"specs"`
	}
	_ = json.Unmarshal(listing.Metadata, &meta)
	specs := specsMapFromMeta(meta.Specs)
	input := llm.ExtractInput{
		ProductName:  listing.ProductName,
		Description:  meta.Description,
		Specs:        specs,
		CategoryPath: listing.CanonicalCategory,
	}
	var llmProfile llm.Profile
	if err := json.Unmarshal(profile.ExtractionSchema, &llmProfile.ExtractionSchema); err != nil {
		log.Printf("[llmlisting] listing %d: invalid extraction_schema: %v", listingID, err)
		return nil
	}
	llmProfile.SystemPrompt = profile.SystemPrompt
	result, err := client.Extract(ctx, llmProfile, input)
	if err != nil {
		return err
	}
	if result == nil {
		return nil
	}
	if err := pool.UpdateListingLLMSpecs(ctx, listingID, result); err != nil {
		log.Printf("[llmlisting] listing %d: failed to save LLM specs: %v", listingID, err)
		return nil
	}
	if err := pool.SyncClothingSizeFromVariant(ctx, listingID); err != nil {
		log.Printf("[llmlisting] listing %d: sync clothing_size: %v", listingID, err)
	}
	if err := pool.SyncBikeSizeFromVariant(ctx, listingID); err != nil {
		log.Printf("[llmlisting] listing %d: sync bike_size: %v", listingID, err)
	}
	log.Printf("[llmlisting] listing %d: LLM extracted specs", listingID)
	return nil
}

// RunSpecDetermination runs classifier when configured then spec extraction with shared quota bookkeeping
// for scheduler enrichment jobs (skips remainder when quota exhausts mid-job).
func RunSpecDetermination(ctx context.Context, pool *db.DB, client *llm.Client, listingID int, state *QuotaJobState, errStrs *[]string) {
	if state != nil && state.QuotaHalted() {
		return
	}
	err := ClassificationStep(ctx, pool, client, listingID)
	if ShouldReportLLMStepError(err) {
		HandleLLMStepError(err, state, errStrs, listingID, "classify", "scheduler", "enrich")
	}
	if state != nil && state.QuotaHalted() {
		return
	}
	if errors.Is(err, ErrClassifyNotReady) {
		return
	}
	err = SpecExtractionStep(ctx, pool, client, listingID)
	HandleLLMStepError(err, state, errStrs, listingID, "extract", "scheduler", "enrich")
}

// MetadataHasNonEmptySpecs reports whether JSON metadata has a non-empty specs object.
func MetadataHasNonEmptySpecs(metadata []byte) bool {
	if len(metadata) == 0 {
		return false
	}
	var wrapper struct {
		Specs map[string]interface{} `json:"specs"`
	}
	if err := json.Unmarshal(metadata, &wrapper); err != nil {
		return false
	}
	return len(wrapper.Specs) > 0
}
