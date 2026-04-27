package scheduler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/mtb-aggregator/api/internal/brand"
	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/llm"
	"github.com/mtb-aggregator/api/internal/metadata"
	"github.com/mtb-aggregator/api/internal/scraper"
	"github.com/mtb-aggregator/api/internal/sentryutil"
	"github.com/mtb-aggregator/api/internal/taxonomy"
	"github.com/robfig/cron/v3"
)

const defaultEnrichBatchSize = 50

func getEnrichBatchSize() int {
	if s := os.Getenv("ENRICH_BATCH_SIZE"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			return n
		}
	}
	return defaultEnrichBatchSize
}

func getEnrichJobTimeout() time.Duration {
	if s := os.Getenv("ENRICH_JOB_TIMEOUT"); s != "" {
		if d, err := time.ParseDuration(s); err == nil && d > 0 {
			return d
		}
	}
	return 30 * time.Minute
}

func getScrapeJobTimeout() time.Duration {
	if s := os.Getenv("SCRAPE_JOB_TIMEOUT"); s != "" {
		if d, err := time.ParseDuration(s); err == nil && d > 0 {
			return d
		}
	}
	return 20 * time.Minute
}

const maxLLMErrorSentryPerJob = 5

// enrichLLMJobState tracks quota exhaustion and rate-limits Sentry noise for one enrichment job run.
type enrichLLMJobState struct {
	quotaHalted      bool
	quotaErrRecorded bool
	quotaSentrySent  bool
	otherSentryN     int
}

func (s *Scheduler) handleLLMEnrichError(err error, state *enrichLLMJobState, errStrs *[]string, listingID int, phase string) {
	if err == nil {
		return
	}
	tags := map[string]string{
		"component":  "scheduler",
		"job":        "enrich",
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
		} else {
			sentryutil.CaptureError(err, tags)
		}
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

type Scheduler struct {
	cron    *cron.Cron
	db      *db.DB
	scraper *scraper.Client
	llm     *llm.Client
}

func New(database *db.DB, scraperURL string, llmClient *llm.Client) *Scheduler {
	return &Scheduler{
		cron:    cron.New(),
		db:      database,
		scraper: scraper.NewClient(scraperURL),
		llm:     llmClient,
	}
}

// RunScrapeJob scrapes all stores. If storeType is non-empty, only stores with that store_type are scraped (e.g. "worldwidecyclery").
// triggeredBy is "manual" or "cron" for job history.
func (s *Scheduler) RunScrapeJob(storeType string, triggeredBy string) {
	ctx := context.Background()
	if triggeredBy == "" {
		triggeredBy = "manual"
	}

	var stores []db.Store
	var err error
	if storeType != "" {
		stores, err = s.db.GetStoresByType(ctx, storeType)
	} else {
		stores, err = s.db.GetStores(ctx)
	}
	if err != nil {
		log.Printf("[scheduler] failed to get stores: %v", err)
		sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "scrape", "phase": "list_stores"})
		return
	}
	if len(stores) == 0 {
		if storeType != "" {
			log.Printf("[scheduler] no stores found for store_type=%q (run seed for that store: make db-seed or make db-seed-remote)", storeType)
		}
		return
	}

	for _, store := range stores {
		storeCtx, cancel := context.WithTimeout(ctx, getScrapeJobTimeout())
		s.scrapeStore(storeCtx, store, triggeredBy)
		cancel()
	}
}

func (s *Scheduler) scrapeStore(ctx context.Context, store db.Store, triggeredBy string) {
	storeType := store.StoreType
	if storeType == "" {
		storeType = strings.ToLower(strings.ReplaceAll(store.Name, " ", ""))
	}
	if storeType != "jensonusa" && storeType != "backcountry" && storeType != "worldwidecyclery" && storeType != "revelbikes" && storeType != "ridebicycles" {
		storeType = "jensonusa"
	}

	jobID, err := s.db.CreateScrapeJob(ctx, &store.ID, store.Name, triggeredBy)
	if err != nil {
		log.Printf("[scheduler] failed to create scrape job for %s: %v", store.Name, err)
		sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "scrape", "phase": "create_job", "store": store.Name})
	}

	validCount := 0
	var results []scraper.ScrapeResult
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[scheduler] panic scraping %s: %v", store.Name, r)
			sentryutil.CapturePanicValue(r, map[string]string{"component": "scheduler", "job": "scrape", "store": store.Name})
			if jobID != 0 {
				errStrs := []string{fmt.Sprintf("panic: %v", r)}
				found := len(results)
				_ = s.db.UpdateScrapeJob(ctx, jobID, "failed", &found, &validCount, errStrs, nil)
			}
		}
	}()

	log.Printf("[scheduler] scraping %s (%s)", store.Name, store.ScrapeURL)

	results, err = s.scraper.Scrape(ctx, store.ScrapeURL, storeType)
	if err != nil {
		log.Printf("[scheduler] scrape failed for %s: %v", store.Name, err)
		sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "scrape", "store": store.Name})
		if jobID != 0 {
			errs := []string{err.Error()}
			status := "failed"
			if errors.Is(err, context.DeadlineExceeded) {
				status = "timed_out"
			}
			_ = s.db.UpdateScrapeJob(ctx, jobID, status, nil, nil, errs, nil)
		}
		return
	}

	log.Printf("[scheduler] %s: got %d listings", store.Name, len(results))

	// Health monitoring: flag if 0 results for 2+ consecutive scrapes (possible selector breakage)
	if len(results) == 0 && store.LastScrapeResultCount != nil && *store.LastScrapeResultCount == 0 {
		log.Printf("[scheduler] WARNING: %s returned 0 results for 2+ consecutive scrapes - check for site/selector changes", store.Name)
		sentryutil.CaptureWarning(
			store.Name+": 0 scrape results for 2+ consecutive runs (possible selector/site change)",
			map[string]string{"component": "scheduler", "job": "scrape", "store": store.Name},
		)
	}
	if err := s.db.UpdateStoreLastScrapeResultCount(ctx, store.ID, len(results)); err != nil {
		log.Printf("[scheduler] failed to update last_scrape_result_count for %s: %v", store.Name, err)
		sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "scrape", "phase": "update_last_count", "store": store.Name})
	}

	// Validate full scrape contract at ingestion boundary - reject bad data before saving.
	strictMode := os.Getenv("SCRAPER_STRICT_ORIGINAL_PRICE") == "1"
	validation := scraper.ValidateBatch(results, store.Name, strictMode)

	if len(validation.Errors) > 0 {
		log.Printf("[scheduler] %s: %d validation errors (invalid results will be skipped)", store.Name, len(validation.Errors))
		for _, e := range validation.Errors {
			if e.Index >= 0 {
				log.Printf("[scheduler]   %s", e.Error())
			}
		}
		// Cap error log to first 5
		if len(validation.Errors) > 5 {
			log.Printf("[scheduler]   ... and %d more", len(validation.Errors)-5)
		}
	}
	for _, w := range validation.Warnings {
		log.Printf("[scheduler] %s: WARNING %s", store.Name, w.Reason)
	}
	if validation.AbortSave {
		log.Printf("[scheduler] %s: aborting save (strict mode). Set SCRAPER_STRICT_ORIGINAL_PRICE=0 to warn only.", store.Name)
		sentryutil.CaptureError(
			fmt.Errorf("scrape validation aborted save for %s (%d validation errors)", store.Name, len(validation.Errors)),
			map[string]string{"component": "scheduler", "job": "scrape", "store": store.Name, "phase": "strict_validation"},
		)
		if jobID != 0 {
			errStrs := make([]string, 0, len(validation.Errors))
			for _, e := range validation.Errors {
				errStrs = append(errStrs, e.Error())
			}
			warnStrs := make([]string, 0, len(validation.Warnings))
			for _, w := range validation.Warnings {
				warnStrs = append(warnStrs, w.Error())
			}
			found := len(results)
			_ = s.db.UpdateScrapeJob(ctx, jobID, "failed", &found, nil, errStrs, warnStrs)
		}
		return
	}

	for i, r := range results {
		if ctx.Err() != nil {
			log.Printf("[scheduler] %s: job timeout, saving partial progress: %d found, %d upserted", store.Name, len(results), validCount)
			sentryutil.CaptureError(
				fmt.Errorf("scrape job timed out for %s (%d found, %d upserted)", store.Name, len(results), validCount),
				map[string]string{"component": "scheduler", "job": "scrape", "store": store.Name},
			)
			if jobID != 0 {
				found := len(results)
				errStrs := []string{"job timed out"}
				_ = s.db.UpdateScrapeJob(ctx, jobID, "timed_out", &found, &validCount, errStrs, nil)
			}
			return
		}
		// Skip results that failed schema validation
		if errs := scraper.ValidateResult(r, i); len(errs) > 0 {
			continue
		}

		// Shadow check: flag if price dropped > 90%
		if lastPrice, ok, _ := s.db.GetLastPrice(ctx, store.ID, r.StoreSKU); ok && lastPrice > 0 {
			dropPct := (lastPrice - r.CurrentPrice) / lastPrice
			if dropPct > 0.9 {
				log.Printf("[scheduler] WARNING: %s %s price dropped %.0f%% ($%.2f -> $%.2f), skipping",
					store.Name, r.StoreSKU, dropPct*100, lastPrice, r.CurrentPrice)
				continue
			}
		}

		var normalizedBrand *string
		if r.Brand != nil {
			s := brand.Normalize(*r.Brand)
			if s != "" {
				normalizedBrand = &s
			}
		}
		canonicalCat := taxonomy.Map(r.CategoryPath)
		var listingMeta []byte
		if extracted := metadata.Extract(r.ProductName); len(extracted) > 0 {
			var m map[string]interface{}
			if json.Unmarshal(extracted, &m) == nil {
				specs := make(map[string]string)
				for k, v := range m {
					specs[k] = fmt.Sprint(v)
				}
				listingMeta = metadata.MergeSpecs(nil, specs)
			}
		}
		var variantOpts []byte
		if len(r.VariantOptions) > 0 {
			variantOpts = r.VariantOptions
		}
		listing := db.Listing{
			StoreID:            store.ID,
			StoreSKU:           r.StoreSKU,
			ProductName:        r.ProductName,
			CurrentPrice:       r.CurrentPrice,
			OriginalPrice:      r.OriginalPrice,
			ProductURL:         r.ProductURL,
			ImageURL:           r.ImageURL,
			Brand:              normalizedBrand,
			CategoryPath:       r.CategoryPath,
			CanonicalCategory:  canonicalCat,
			Metadata:           listingMeta,
			IsInStock:          r.IsInStock,
			ProductGroupHandle: r.ProductGroupKey,
			VariantOptions:     variantOpts,
		}

		id, err := s.db.UpsertListing(ctx, listing)
		if err != nil {
			log.Printf("[scheduler] upsert failed for %s: %v", r.StoreSKU, err)
			continue
		}

		if err := s.db.InsertPriceHistory(ctx, id, r.CurrentPrice); err != nil {
			log.Printf("[scheduler] price history failed for %s: %v", r.StoreSKU, err)
		}

		validCount++
	}

	if jobID != 0 {
		found := len(results)
		errStrs := make([]string, 0, len(validation.Errors))
		for _, e := range validation.Errors {
			errStrs = append(errStrs, e.Error())
		}
		warnStrs := make([]string, 0, len(validation.Warnings))
		for _, w := range validation.Warnings {
			warnStrs = append(warnStrs, w.Error())
		}
		status := "completed"
		if err := s.db.UpdateScrapeJob(ctx, jobID, status, &found, &validCount, errStrs, warnStrs); err != nil {
			log.Printf("[scheduler] failed to update scrape job %d: %v", jobID, err)
			sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "scrape", "phase": "finalize_job", "store": store.Name})
		}
	}

	log.Printf("[scheduler] %s: saved %d listings", store.Name, validCount)
}

// RunEnrichmentJob runs enrichment for listings needing it (all stores, one batch).
// triggeredBy is "manual" or "cron" for job history.
func (s *Scheduler) RunEnrichmentJob(force bool, triggeredBy string) {
	if triggeredBy == "" {
		triggeredBy = "manual"
	}

	ctx, cancel := context.WithTimeout(context.Background(), getEnrichJobTimeout())
	defer cancel()

	jobID, err := s.db.CreateEnrichJob(ctx, nil, triggeredBy, force, "enrich")
	if err != nil {
		log.Printf("[enrichment] failed to create enrich job: %v", err)
		sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "enrich", "phase": "create_job"})
	}

	successCount := 0
	var errStrs []string
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[enrichment] panic: %v", r)
			sentryutil.CapturePanicValue(r, map[string]string{"component": "scheduler", "job": "enrich", "scope": "global"})
			if jobID != 0 {
				panicErrs := append(errStrs, fmt.Sprintf("panic: %v", r))
				_ = s.db.UpdateEnrichJob(ctx, jobID, "failed", nil, &successCount, panicErrs)
			}
		}
	}()

	batchSize := getEnrichBatchSize()
	listings, err := s.db.GetListingsNeedingEnrichment(ctx, batchSize, force)
	if err != nil {
		log.Printf("[enrichment] failed to get listings: %v", err)
		sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "enrich", "phase": "list_listings"})
		if jobID != 0 {
			_ = s.db.UpdateEnrichJob(ctx, jobID, "failed", nil, nil, []string{err.Error()})
		}
		return
	}

	if len(listings) == 0 {
		log.Printf("[enrichment] no listings need enrichment")
		if jobID != 0 {
			z := 0
			_ = s.db.UpdateEnrichJob(ctx, jobID, "completed", &z, &z, nil)
		}
		return
	}

	log.Printf("[enrichment] enriching %d listings", len(listings))

	var llmState enrichLLMJobState
	seenJensonGroups := make(map[string]bool)
	processed := 0
	for _, l := range listings {
		if ctx.Err() != nil {
			log.Printf("[enrichment] job timeout, saving partial progress: %d processed, %d enriched", processed, successCount)
			sentryutil.CaptureError(
				fmt.Errorf("enrichment job timed out (%d processed, %d enriched)", processed, successCount),
				map[string]string{"component": "scheduler", "job": "enrich", "scope": "global"},
			)
			if jobID != 0 {
				errStrs = append(errStrs, "job timed out")
				_ = s.db.UpdateEnrichJob(ctx, jobID, "timed_out", &processed, &successCount, errStrs)
			}
			return
		}
		processed++
		result, err := s.scraper.Enrich(ctx, l.ProductURL, l.StoreType)
		if err != nil {
			log.Printf("[enrichment] failed for listing %d: %v", l.ID, err)
			errStrs = append(errStrs, fmt.Sprintf("listing %d: %v", l.ID, err))
			continue
		}

		if err := s.db.UpdateListingEnrichment(ctx, l.ID, result.CategoryPath, result.RawSpecs, result.Unavailable, result.Description); err != nil {
			log.Printf("[enrichment] failed to update listing %d: %v", l.ID, err)
			errStrs = append(errStrs, fmt.Sprintf("listing %d update: %v", l.ID, err))
			continue
		}

		if err := s.db.ApplyJensonPDPVariantFanout(ctx, l.StoreID, l.StoreType, l.StoreSKU, enrichVariantsToJenson(result.Variants), seenJensonGroups); err != nil {
			log.Printf("[enrichment] jenson variant fan-out failed for listing %d: %v", l.ID, err)
		}

		successCount++
		if result.Unavailable {
			log.Printf("[enrichment] listing %d: marked unavailable (out of stock)", l.ID)
		}
		if len(result.CategoryPath) > 0 {
			log.Printf("[enrichment] listing %d: category_path=%v", l.ID, result.CategoryPath)
		}
		s.runLLMCategoryClassification(ctx, l.ID, &llmState, &errStrs)
		s.runLLMExtractionIfApplicable(ctx, l.ID, &llmState, &errStrs)
	}

	status := "completed"
	if jobID != 0 {
		p := len(listings)
		_ = s.db.UpdateEnrichJob(ctx, jobID, status, &p, &successCount, errStrs)
	}
	log.Printf("[enrichment] enriched %d/%d listings", successCount, len(listings))
}

func enrichVariantsToJenson(v []scraper.EnrichVariant) []db.JensonPDPVariant {
	if len(v) == 0 {
		return nil
	}
	out := make([]db.JensonPDPVariant, len(v))
	for i := range v {
		out[i] = db.JensonPDPVariant{
			Code:        v[i].Code,
			Dimensions:  v[i].Dimensions,
			IsOrderable: v[i].IsOrderable,
		}
	}
	return out
}

// runLLMCategoryClassification runs LLM category classification to refine canonical_category.
// Runs before runLLMExtractionIfApplicable so spec extraction uses the corrected category.
func (s *Scheduler) runLLMCategoryClassification(ctx context.Context, listingID int, state *enrichLLMJobState, errStrs *[]string) {
	if s.llm == nil {
		return
	}
	if state != nil && state.quotaHalted {
		return
	}
	cfg, err := s.db.GetCategoryClassifier(ctx)
	if err != nil || cfg == nil || !cfg.Enabled {
		return
	}
	pathRows, err := s.db.GetAllCategoryPathsWithDescriptions(ctx)
	if err != nil || len(pathRows) == 0 {
		return
	}
	validPaths, categoryDesc := db.ClassifierPathsFromTreeRows(pathRows, llm.CategoryPathSeparator)
	listing, err := s.db.GetListingForCategoryClassification(ctx, listingID)
	if err != nil || listing == nil {
		return
	}
	var meta struct {
		Description string                 `json:"description"`
		Specs       map[string]interface{} `json:"specs"`
	}
	_ = json.Unmarshal(listing.Metadata, &meta)
	specs := make(map[string]string)
	if meta.Specs != nil {
		for k, v := range meta.Specs {
			if v != nil {
				specs[k] = fmt.Sprint(v)
			}
		}
	}
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
	result, err := s.llm.Classify(ctx, config, input)
	if err != nil {
		log.Printf("[enrichment] listing %d: LLM classify failed: %v", listingID, err)
		s.handleLLMEnrichError(err, state, errStrs, listingID, "classify")
		return
	}
	if result == nil {
		return
	}
	llmCategory := map[string]interface{}{
		"canonical_category": result.CanonicalCategory,
		"confidence":         result.Confidence,
		"reasoning":          result.Reasoning,
	}
	if result.Confidence >= config.ConfidenceThreshold {
		if err := s.db.UpdateListingCanonicalCategory(ctx, listingID, result.CanonicalCategory, llmCategory); err != nil {
			log.Printf("[enrichment] listing %d: failed to update category: %v", listingID, err)
			return
		}
		log.Printf("[enrichment] listing %d: LLM classified as %v (conf=%.2f)", listingID, result.CanonicalCategory, result.Confidence)
	} else {
		if err := s.db.UpdateListingLLMCategoryMetadata(ctx, listingID, llmCategory); err != nil {
			log.Printf("[enrichment] listing %d: failed to store LLM category metadata: %v", listingID, err)
		}
	}
}

// runLLMExtractionIfApplicable runs LLM spec extraction for a listing if a matching profile exists.
// Non-fatal: logs errors but does not fail the enrichment job.
func (s *Scheduler) runLLMExtractionIfApplicable(ctx context.Context, listingID int, state *enrichLLMJobState, errStrs *[]string) {
	if s.llm == nil {
		return
	}
	if state != nil && state.quotaHalted {
		return
	}
	listing, err := s.db.GetListingForLLM(ctx, listingID)
	if err != nil || listing == nil {
		return
	}
	if len(listing.CanonicalCategory) == 0 {
		return
	}
	profile, err := s.db.GetLLMPromptProfileForCategory(ctx, listing.CanonicalCategory)
	if err != nil || profile == nil {
		return
	}
	var meta struct {
		Description string                 `json:"description"`
		Specs       map[string]interface{} `json:"specs"`
	}
	_ = json.Unmarshal(listing.Metadata, &meta)
	specs := make(map[string]string)
	if meta.Specs != nil {
		for k, v := range meta.Specs {
			if v != nil {
				specs[k] = fmt.Sprint(v)
			}
		}
	}
	input := llm.ExtractInput{
		ProductName:  listing.ProductName,
		Description:  meta.Description,
		Specs:        specs,
		CategoryPath: listing.CanonicalCategory,
	}
	var llmProfile llm.Profile
	if err := json.Unmarshal(profile.ExtractionSchema, &llmProfile.ExtractionSchema); err != nil {
		log.Printf("[enrichment] listing %d: invalid extraction_schema: %v", listingID, err)
		return
	}
	llmProfile.SystemPrompt = profile.SystemPrompt
	result, err := s.llm.Extract(ctx, llmProfile, input)
	if err != nil {
		log.Printf("[enrichment] listing %d: LLM extract failed: %v", listingID, err)
		s.handleLLMEnrichError(err, state, errStrs, listingID, "extract")
		return
	}
	if result == nil {
		return
	}
	if err := s.db.UpdateListingLLMSpecs(ctx, listingID, result); err != nil {
		log.Printf("[enrichment] listing %d: failed to save LLM specs: %v", listingID, err)
		return
	}
	log.Printf("[enrichment] listing %d: LLM extracted specs", listingID)
}

// RunEnrichmentJobForStore runs enrichment for all listings of a single store (by store_type), in batches.
// If storeType is empty, runs the global job (one batch). triggeredBy is "manual" or "cron" for job history.
func (s *Scheduler) RunEnrichmentJobForStore(storeType string, force bool, triggeredBy string) {
	if storeType == "" {
		s.RunEnrichmentJob(force, triggeredBy)
		return
	}
	if triggeredBy == "" {
		triggeredBy = "manual"
	}
	hasEnricher := false
	for _, t := range db.StoreTypesWithEnrichers {
		if strings.EqualFold(t, storeType) {
			hasEnricher = true
			break
		}
	}
	if !hasEnricher {
		log.Printf("[enrichment] no enricher for store_type=%q; skipping", storeType)
		return
	}
	s.runEnrichmentLoop(db.EnrichmentFilter{StoreType: storeType}, force, triggeredBy)
}

// RunEnrichmentWithFilter runs batched PDP enrichment for listings matching the filter (category and/or low confidence and/or a single store).
// StoreType in filter empty means all allowed enricher stores. triggeredBy is "manual" or "cron" for job history.
func (s *Scheduler) RunEnrichmentWithFilter(f db.EnrichmentFilter, force bool, triggeredBy string) {
	if triggeredBy == "" {
		triggeredBy = "manual"
	}
	if f.StoreType != "" {
		hasEnricher := false
		for _, t := range db.StoreTypesWithEnrichers {
			if strings.EqualFold(t, f.StoreType) {
				hasEnricher = true
				break
			}
		}
		if !hasEnricher {
			log.Printf("[enrichment] no enricher for store_type=%q; skipping", f.StoreType)
			return
		}
	}
	s.runEnrichmentLoop(f, force, triggeredBy)
}

// runEnrichmentLoop drains all batches of listings for the given filter.
func (s *Scheduler) runEnrichmentLoop(f db.EnrichmentFilter, force bool, triggeredBy string) {
	scope := f.StoreType
	if scope == "" {
		scope = "all-enricher-stores"
	}

	ctx, cancel := context.WithTimeout(context.Background(), getEnrichJobTimeout())
	defer cancel()

	var stPtr *string
	if f.StoreType != "" {
		st := f.StoreType
		stPtr = &st
	}
	jobID, err := s.db.CreateEnrichJob(ctx, stPtr, triggeredBy, force, "enrich")
	if err != nil {
		log.Printf("[enrichment] failed to create enrich job: %v", err)
		sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "enrich", "phase": "create_job", "store_type": scope})
	}

	totalSuccess := 0
	totalProcessed := 0
	var errStrs []string
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[enrichment] panic: %v", r)
			sentryutil.CapturePanicValue(r, map[string]string{"component": "scheduler", "job": "enrich", "store_type": scope})
			if jobID != 0 {
				panicErrs := append(errStrs, fmt.Sprintf("panic: %v", r))
				_ = s.db.UpdateEnrichJob(ctx, jobID, "failed", &totalProcessed, &totalSuccess, panicErrs)
			}
		}
	}()

	batchSize := getEnrichBatchSize()
	var llmState enrichLLMJobState
	for {
		if ctx.Err() != nil {
			log.Printf("[enrichment] %s: job timeout, saving partial progress: %d processed, %d enriched", scope, totalProcessed, totalSuccess)
			sentryutil.CaptureError(
				fmt.Errorf("enrichment job timed out for scope=%s (%d processed, %d enriched)", scope, totalProcessed, totalSuccess),
				map[string]string{"component": "scheduler", "job": "enrich", "store_type": scope},
			)
			if jobID != 0 {
				errStrs = append(errStrs, "job timed out")
				_ = s.db.UpdateEnrichJob(ctx, jobID, "timed_out", &totalProcessed, &totalSuccess, errStrs)
			}
			return
		}
		listings, err := s.db.GetListingsNeedingEnrichmentForFilter(ctx, f, batchSize, force)
		if err != nil {
			log.Printf("[enrichment] failed to get listings for %s: %v", scope, err)
			sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "enrich", "phase": "list_listings", "store_type": scope})
			if jobID != 0 {
				_ = s.db.UpdateEnrichJob(ctx, jobID, "failed", nil, nil, []string{err.Error()})
			}
			return
		}
		if len(listings) == 0 {
			break
		}
		log.Printf("[enrichment] %s: enriching batch of %d listings", scope, len(listings))
		seenJensonGroups := make(map[string]bool)
		successCount := 0
		for _, l := range listings {
			if ctx.Err() != nil {
				log.Printf("[enrichment] %s: job timeout, saving partial progress: %d processed, %d enriched", scope, totalProcessed, totalSuccess)
				sentryutil.CaptureError(
					fmt.Errorf("enrichment job timed out for scope=%s (%d processed, %d enriched)", scope, totalProcessed, totalSuccess),
					map[string]string{"component": "scheduler", "job": "enrich", "store_type": scope},
				)
				if jobID != 0 {
					errStrs = append(errStrs, "job timed out")
					_ = s.db.UpdateEnrichJob(ctx, jobID, "timed_out", &totalProcessed, &totalSuccess, errStrs)
				}
				return
			}
			result, err := s.scraper.Enrich(ctx, l.ProductURL, l.StoreType)
			if err != nil {
				log.Printf("[enrichment] failed for listing %d: %v", l.ID, err)
				errStrs = append(errStrs, fmt.Sprintf("listing %d: %v", l.ID, err))
				continue
			}
			if err := s.db.UpdateListingEnrichment(ctx, l.ID, result.CategoryPath, result.RawSpecs, result.Unavailable, result.Description); err != nil {
				log.Printf("[enrichment] failed to update listing %d: %v", l.ID, err)
				errStrs = append(errStrs, fmt.Sprintf("listing %d update: %v", l.ID, err))
				continue
			}
			if err := s.db.ApplyJensonPDPVariantFanout(ctx, l.StoreID, l.StoreType, l.StoreSKU, enrichVariantsToJenson(result.Variants), seenJensonGroups); err != nil {
				log.Printf("[enrichment] jenson variant fan-out failed for listing %d: %v", l.ID, err)
			}
			successCount++
			totalSuccess++
			if result.Unavailable {
				log.Printf("[enrichment] listing %d: marked unavailable (out of stock)", l.ID)
			}
			if len(result.CategoryPath) > 0 {
				log.Printf("[enrichment] listing %d: category_path=%v", l.ID, result.CategoryPath)
			}
			s.runLLMCategoryClassification(ctx, l.ID, &llmState, &errStrs)
			s.runLLMExtractionIfApplicable(ctx, l.ID, &llmState, &errStrs)
		}
		totalProcessed += len(listings)
		log.Printf("[enrichment] %s: batch done %d/%d", scope, successCount, len(listings))
		if len(listings) < batchSize {
			break
		}
	}
	if jobID != 0 {
		_ = s.db.UpdateEnrichJob(ctx, jobID, "completed", &totalProcessed, &totalSuccess, errStrs)
	}
	if totalProcessed > 0 {
		log.Printf("[enrichment] %s: enriched %d/%d listings total", scope, totalSuccess, totalProcessed)
	} else {
		log.Printf("[enrichment] %s: no listings need enrichment", scope)
	}
}

// RunCatchUp checks the last scrape/enrich job and runs immediately if overdue.
// Helps when the process was down during the scheduled time (idle spin-down,
// deploys, crashes, or restarts) so a missed cron can run on the next startup.
func (s *Scheduler) RunCatchUp(scrapeInterval, enrichInterval time.Duration) {
	ctx := context.Background()

	scrapeAge, err := s.db.LastScrapeJobAge(ctx)
	if err != nil {
		log.Printf("[catch-up] failed to check last scrape job: %v", err)
	} else if scrapeAge < 0 || scrapeAge > scrapeInterval {
		label := "never"
		if scrapeAge >= 0 {
			label = scrapeAge.Round(time.Minute).String() + " ago"
		}
		log.Printf("[catch-up] last scrape is overdue (%s, threshold %s) — running now", label, scrapeInterval)
		go s.RunScrapeJob("", "catch-up")
	} else {
		log.Printf("[catch-up] last scrape was %s ago (threshold %s) — not overdue", scrapeAge.Round(time.Minute), scrapeInterval)
	}

	enrichAge, err := s.db.LastEnrichJobAge(ctx)
	if err != nil {
		log.Printf("[catch-up] failed to check last enrich job: %v", err)
	} else if enrichAge < 0 || enrichAge > enrichInterval {
		label := "never"
		if enrichAge >= 0 {
			label = enrichAge.Round(time.Minute).String() + " ago"
		}
		log.Printf("[catch-up] last enrichment is overdue (%s, threshold %s) — running now", label, enrichInterval)
		go s.RunEnrichmentJob(false, "catch-up")
	} else {
		log.Printf("[catch-up] last enrichment was %s ago (threshold %s) — not overdue", enrichAge.Round(time.Minute), enrichInterval)
	}
}

func (s *Scheduler) Start(spec string, triggeredBy string) {
	if triggeredBy == "" {
		triggeredBy = "cron"
	}
	tb := triggeredBy
	s.cron.AddFunc(spec, func() { s.RunScrapeJob("", tb) })
	s.cron.Start()
	log.Printf("[scheduler] started scrape cron with spec %s", spec)
}

func (s *Scheduler) StartEnrichment(spec string) {
	if spec != "" {
		s.cron.AddFunc(spec, func() { s.RunEnrichmentJob(false, "cron") })
		log.Printf("[scheduler] started enrichment cron with spec %s", spec)
	}
}

func (s *Scheduler) Stop() {
	s.cron.Stop()
}
