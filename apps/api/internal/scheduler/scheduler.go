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
	if storeType != "jensonusa" && storeType != "backcountry" && storeType != "worldwidecyclery" && storeType != "revelbikes" {
		storeType = "jensonusa"
	}

	jobID, err := s.db.CreateScrapeJob(ctx, &store.ID, store.Name, triggeredBy)
	if err != nil {
		log.Printf("[scheduler] failed to create scrape job for %s: %v", store.Name, err)
	}

	validCount := 0
	var results []scraper.ScrapeResult
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[scheduler] panic scraping %s: %v", store.Name, r)
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
	}
	if err := s.db.UpdateStoreLastScrapeResultCount(ctx, store.ID, len(results)); err != nil {
		log.Printf("[scheduler] failed to update last_scrape_result_count for %s: %v", store.Name, err)
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
		listing := db.Listing{
			StoreID:           store.ID,
			StoreSKU:          r.StoreSKU,
			ProductName:       r.ProductName,
			CurrentPrice:      r.CurrentPrice,
			OriginalPrice:     r.OriginalPrice,
			ProductURL:        r.ProductURL,
			ImageURL:          r.ImageURL,
			Brand:             normalizedBrand,
			CategoryPath:      r.CategoryPath,
			CanonicalCategory: canonicalCat,
			Metadata:          listingMeta,
			IsInStock:         r.IsInStock,
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

	jobID, err := s.db.CreateEnrichJob(ctx, nil, triggeredBy, force)
	if err != nil {
		log.Printf("[enrichment] failed to create enrich job: %v", err)
	}

	successCount := 0
	var errStrs []string
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[enrichment] panic: %v", r)
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

	processed := 0
	for _, l := range listings {
		if ctx.Err() != nil {
			log.Printf("[enrichment] job timeout, saving partial progress: %d processed, %d enriched", processed, successCount)
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

		successCount++
		if result.Unavailable {
			log.Printf("[enrichment] listing %d: marked unavailable (out of stock)", l.ID)
		}
		if len(result.CategoryPath) > 0 {
			log.Printf("[enrichment] listing %d: category_path=%v", l.ID, result.CategoryPath)
		}
		s.runLLMCategoryClassification(ctx, l.ID)
		s.runLLMExtractionIfApplicable(ctx, l.ID)
	}

	status := "completed"
	if jobID != 0 {
		p := len(listings)
		_ = s.db.UpdateEnrichJob(ctx, jobID, status, &p, &successCount, errStrs)
	}
	log.Printf("[enrichment] enriched %d/%d listings", successCount, len(listings))
}

// runLLMCategoryClassification runs LLM category classification to refine canonical_category.
// Runs before runLLMExtractionIfApplicable so spec extraction uses the corrected category.
func (s *Scheduler) runLLMCategoryClassification(ctx context.Context, listingID int) {
	if s.llm == nil {
		return
	}
	cfg, err := s.db.GetCategoryClassifier(ctx)
	if err != nil || cfg == nil || !cfg.Enabled {
		return
	}
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
		SystemPrompt:        cfg.SystemPrompt,
		ValidCategories:     cfg.ValidCategories,
		ConfidenceThreshold: cfg.ConfidenceThreshold,
	}
	result, err := s.llm.Classify(ctx, config, input)
	if err != nil {
		log.Printf("[enrichment] listing %d: LLM classify failed: %v", listingID, err)
		return
	}
	if result == nil {
		return
	}
	llmCategory := map[string]interface{}{
		"canonical_category": result.CanonicalCategory,
		"confidence":         result.Confidence,
		"reasoning":           result.Reasoning,
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
func (s *Scheduler) runLLMExtractionIfApplicable(ctx context.Context, listingID int) {
	if s.llm == nil {
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

	ctx, cancel := context.WithTimeout(context.Background(), getEnrichJobTimeout())
	defer cancel()

	st := storeType
	jobID, err := s.db.CreateEnrichJob(ctx, &st, triggeredBy, force)
	if err != nil {
		log.Printf("[enrichment] failed to create enrich job: %v", err)
	}

	totalSuccess := 0
	totalProcessed := 0
	var errStrs []string
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[enrichment] panic: %v", r)
			if jobID != 0 {
				panicErrs := append(errStrs, fmt.Sprintf("panic: %v", r))
				_ = s.db.UpdateEnrichJob(ctx, jobID, "failed", &totalProcessed, &totalSuccess, panicErrs)
			}
		}
	}()

	batchSize := getEnrichBatchSize()
	for {
		if ctx.Err() != nil {
			log.Printf("[enrichment] %s: job timeout, saving partial progress: %d processed, %d enriched", storeType, totalProcessed, totalSuccess)
			if jobID != 0 {
				errStrs = append(errStrs, "job timed out")
				_ = s.db.UpdateEnrichJob(ctx, jobID, "timed_out", &totalProcessed, &totalSuccess, errStrs)
			}
			return
		}
		listings, err := s.db.GetListingsNeedingEnrichmentForStore(ctx, storeType, batchSize, force)
		if err != nil {
			log.Printf("[enrichment] failed to get listings for %s: %v", storeType, err)
			if jobID != 0 {
				_ = s.db.UpdateEnrichJob(ctx, jobID, "failed", nil, nil, []string{err.Error()})
			}
			return
		}
		if len(listings) == 0 {
			break
		}
		log.Printf("[enrichment] %s: enriching batch of %d listings", storeType, len(listings))
		successCount := 0
		for _, l := range listings {
			if ctx.Err() != nil {
				log.Printf("[enrichment] %s: job timeout, saving partial progress: %d processed, %d enriched", storeType, totalProcessed, totalSuccess)
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
			successCount++
			totalSuccess++
			if result.Unavailable {
				log.Printf("[enrichment] listing %d: marked unavailable (out of stock)", l.ID)
			}
			if len(result.CategoryPath) > 0 {
				log.Printf("[enrichment] listing %d: category_path=%v", l.ID, result.CategoryPath)
			}
			s.runLLMCategoryClassification(ctx, l.ID)
			s.runLLMExtractionIfApplicable(ctx, l.ID)
		}
		totalProcessed += len(listings)
		log.Printf("[enrichment] %s: batch done %d/%d", storeType, successCount, len(listings))
		if len(listings) < batchSize {
			break
		}
	}
	if jobID != 0 {
		_ = s.db.UpdateEnrichJob(ctx, jobID, "completed", &totalProcessed, &totalSuccess, errStrs)
	}
	if totalProcessed > 0 {
		log.Printf("[enrichment] %s: enriched %d/%d listings total", storeType, totalSuccess, totalProcessed)
	} else {
		log.Printf("[enrichment] %s: no listings need enrichment", storeType)
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
