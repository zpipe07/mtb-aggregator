package scheduler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/mtb-aggregator/api/internal/affiliate"
	"github.com/mtb-aggregator/api/internal/brand"
	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/impact"
	"github.com/mtb-aggregator/api/internal/llm"
	"github.com/mtb-aggregator/api/internal/llmlisting"
	"github.com/mtb-aggregator/api/internal/logutil"
	"github.com/mtb-aggregator/api/internal/metadata"
	"github.com/mtb-aggregator/api/internal/scraper"
	"github.com/mtb-aggregator/api/internal/sentryutil"
	"github.com/mtb-aggregator/api/internal/taxonomy"
	"github.com/robfig/cron/v3"
)

var (
	schedulerLog   = logutil.Logger("scheduler")
	enrichmentLog  = logutil.Logger("enrichment")
	catchUpLog     = logutil.Logger("catch-up")
)

const defaultEnrichBatchSize = 50

// enrichListingErrorsSentryMin is the minimum errStrs count before reporting a completed job to Sentry.
const enrichListingErrorsSentryMin = 5

// enrichListingErrorsSentryFailurePct triggers Sentry when more than this percent of listings fail enrichment.
const enrichListingErrorsSentryFailurePct = 50

const enrichListingErrorsSentrySampleMax = 3

func getEnrichBatchSize() int {
	if s := os.Getenv("ENRICH_BATCH_SIZE"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			return n
		}
	}
	return defaultEnrichBatchSize
}

func getEnrichMaxListings() int {
	if s := os.Getenv("ENRICH_MAX_LISTINGS"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			return n
		}
	}
	return 0
}

func getEnrichJobTimeout() time.Duration {
	if s := os.Getenv("ENRICH_JOB_TIMEOUT"); s != "" {
		if d, err := time.ParseDuration(s); err == nil && d > 0 {
			return d
		}
	}
	// PDP enrichment is sequential and often ~1–2 min/listing (Playwright + LLM).
	// 30m only yields ~15 listings; nightly jobs need a longer window.
	return 4 * time.Hour
}

func getScrapeJobTimeout() time.Duration {
	if s := os.Getenv("SCRAPE_JOB_TIMEOUT"); s != "" {
		if d, err := time.ParseDuration(s); err == nil && d > 0 {
			return d
		}
	}
	return 20 * time.Minute
}

// captureEnrichJobListingErrorsAggregate reports one Sentry event when a completed enrich job
// accumulated many per-listing failures (stored in enrich_jobs.errors but not sent individually).
func captureEnrichJobListingErrorsAggregate(scope string, processed, enriched int, errStrs []string) {
	if processed <= 0 || len(errStrs) == 0 {
		return
	}
	failures := processed - enriched
	failurePct := failures * 100 / processed
	if len(errStrs) < enrichListingErrorsSentryMin && failurePct <= enrichListingErrorsSentryFailurePct {
		return
	}
	sampleN := enrichListingErrorsSentrySampleMax
	if sampleN > len(errStrs) {
		sampleN = len(errStrs)
	}
	samples := strings.Join(errStrs[:sampleN], "; ")
	err := fmt.Errorf(
		"enrich job completed with %d listing errors (scope=%s, processed=%d, enriched=%d, failure_pct=%d%%; samples: %s)",
		len(errStrs), scope, processed, enriched, failurePct, samples,
	)
	tags := map[string]string{
		"component": "scheduler",
		"job":       "enrich",
		"phase":     "listing_errors_aggregate",
	}
	if scope != "" {
		tags["store_type"] = scope
	}
	sentryutil.CaptureError(err, tags)
}

// finalizeEnrichJob writes terminal job status using a DB context that is not the (possibly
// canceled) work context, so timeouts still persist as timed_out/failed/completed.
func (s *Scheduler) finalizeEnrichJob(jobID int, status string, processed, enriched *int, errStrs []string, scope string) {
	if jobID == 0 {
		return
	}
	if err := s.db.UpdateEnrichJobDetached(jobID, status, processed, enriched, errStrs); err != nil {
		enrichmentLog.Error("failed to persist enrich job final status", "job_id", jobID, "status", status, logutil.ErrAttr(err))
		tags := map[string]string{"component": "scheduler", "job": "enrich", "phase": "finalize_job", "status": status}
		if scope != "" {
			tags["store_type"] = scope
		}
		sentryutil.CaptureError(err, tags)
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
		schedulerLog.Error("failed to get stores", logutil.ErrAttr(err))
		sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "scrape", "phase": "list_stores"})
		return
	}
	if len(stores) == 0 {
		if storeType != "" {
			schedulerLog.Warn("no stores found for store_type", "store_type", storeType, "hint", "run seed for that store: make db-seed or make db-seed-remote")
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
	if storeType != "jensonusa" && storeType != "backcountry" && storeType != "competitivecyclist" && storeType != "worldwidecyclery" && storeType != "revelbikes" && storeType != "ridebicycles" && storeType != "thundermountainbikes" && storeType != "mackcycle" && storeType != "canyon" && storeType != "specialized" && storeType != "trek" && storeType != "universalcycles" && storeType != "n1bikes" && storeType != "foxracing" && storeType != "rideconcepts" && storeType != "leatt" {
		storeType = "jensonusa"
	}

	jobID, err := s.db.CreateScrapeJob(ctx, &store.ID, store.Name, triggeredBy)
	if err != nil {
		schedulerLog.Error("failed to create scrape job", "store", store.Name, logutil.ErrAttr(err))
		sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "scrape", "phase": "create_job", "store": store.Name})
	}

	validCount := 0
	var results []scraper.ScrapeResult
	defer func() {
		if r := recover(); r != nil {
			schedulerLog.Error("panic scraping store", "store", store.Name, "panic", r)
			sentryutil.CapturePanicValue(r, map[string]string{"component": "scheduler", "job": "scrape", "store": store.Name})
			if jobID != 0 {
				errStrs := []string{fmt.Sprintf("panic: %v", r)}
				found := len(results)
				_ = s.db.UpdateScrapeJob(ctx, jobID, "failed", &found, &validCount, errStrs, nil)
			}
		}
	}()

	schedulerLog.Info("scraping store", "store", store.Name, "url", store.ScrapeURL)

	scrapeStartedAt := time.Now()
	if strings.EqualFold(store.StoreType, "competitivecyclist") {
		icfg := impact.ConfigFromEnv()
		if !icfg.CatalogConfigured() {
			err = fmt.Errorf("competitivecyclist requires %s and %s (Impact Partner catalog); Playwright fallback disabled", impact.EnvAccountSID, impact.EnvAuthToken)
			schedulerLog.Error("scrape failed", "store", store.Name, logutil.ErrAttr(err))
			sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "scrape", "store": store.Name, "source": "impact-catalog"})
			if jobID != 0 {
				errs := []string{err.Error()}
				_ = s.db.UpdateScrapeJob(ctx, jobID, "failed", nil, nil, errs, nil)
			}
			return
		}
		results, err = impact.FetchCompetitiveCyclistScrapeResults(ctx, icfg)
		if err == nil {
			schedulerLog.Info("impact-catalog returned listings", "store", store.Name, "count", len(results))
		}
	} else {
		results, err = s.scraper.Scrape(ctx, store.ScrapeURL, storeType)
	}
	if err != nil {
		schedulerLog.Error("scrape failed", "store", store.Name, logutil.ErrAttr(err))
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

	schedulerLog.Info("scrape returned listings", "store", store.Name, "count", len(results))

	// Health monitoring: flag if 0 results for 2+ consecutive scrapes (possible selector breakage)
	if len(results) == 0 && store.LastScrapeResultCount != nil && *store.LastScrapeResultCount == 0 {
		schedulerLog.Warn("zero scrape results for consecutive runs; check site/selector changes", "store", store.Name)
		sentryutil.CaptureWarning(
			store.Name+": 0 scrape results for 2+ consecutive runs (possible selector/site change)",
			map[string]string{"component": "scheduler", "job": "scrape", "store": store.Name},
		)
	}
	if err := s.db.UpdateStoreLastScrapeResultCount(ctx, store.ID, len(results)); err != nil {
		schedulerLog.Error("failed to update last_scrape_result_count", "store", store.Name, logutil.ErrAttr(err))
		sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "scrape", "phase": "update_last_count", "store": store.Name})
	}

	// Validate full scrape contract at ingestion boundary - reject bad data before saving.
	strictMode := os.Getenv("SCRAPER_STRICT_ORIGINAL_PRICE") == "1"
	validation := scraper.ValidateBatch(results, store.Name, strictMode)

	if len(validation.Errors) > 0 {
		schedulerLog.Warn("validation errors; invalid results will be skipped", "store", store.Name, "count", len(validation.Errors))
		for _, e := range validation.Errors {
			if e.Index >= 0 {
				schedulerLog.Warn("validation error", "store", store.Name, "detail", e.Error())
			}
		}
		if len(validation.Errors) > 5 {
			schedulerLog.Warn("additional validation errors omitted", "store", store.Name, "remaining", len(validation.Errors)-5)
		}
	}
	for _, w := range validation.Warnings {
		schedulerLog.Warn("scrape validation warning", "store", store.Name, "reason", w.Reason)
	}
	if validation.AbortSave {
		schedulerLog.Warn("aborting save in strict mode; set SCRAPER_STRICT_ORIGINAL_PRICE=0 to warn only", "store", store.Name)
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
			schedulerLog.Warn("scrape job timeout; saving partial progress", "store", store.Name, "found", len(results), "upserted", validCount)
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
				schedulerLog.Warn("price drop exceeded threshold; skipping listing",
					"store", store.Name,
					"store_sku", r.StoreSKU,
					"drop_pct", dropPct*100,
					"last_price", lastPrice,
					"current_price", r.CurrentPrice,
				)
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
		if r.FeedDescription != nil && strings.TrimSpace(*r.FeedDescription) != "" {
			listingMeta = metadata.MergeDescription(listingMeta, strings.TrimSpace(*r.FeedDescription))
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
		if strings.EqualFold(store.StoreType, "competitivecyclist") {
			if u, ok := affiliate.CompetitiveCyclistOutboundURL(r.ProductURL); ok {
				listing.AffiliateURL = &u
			} else if r.ImpactCatalogOutboundURL != nil && strings.TrimSpace(*r.ImpactCatalogOutboundURL) != "" {
				x := strings.TrimSpace(*r.ImpactCatalogOutboundURL)
				listing.AffiliateURL = &x
			}
		}

		id, err := s.db.UpsertListing(ctx, listing)
		if err != nil {
			schedulerLog.Error("upsert failed", "store_sku", r.StoreSKU, logutil.ErrAttr(err))
			continue
		}

		if err := s.db.InsertPriceHistory(ctx, id, r.CurrentPrice); err != nil {
			schedulerLog.Error("price history insert failed", "store_sku", r.StoreSKU, logutil.ErrAttr(err))
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
			schedulerLog.Error("failed to update scrape job", "job_id", jobID, logutil.ErrAttr(err))
			sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "scrape", "phase": "finalize_job", "store": store.Name})
		}
	}

	schedulerLog.Info("scrape saved listings", "store", store.Name, "count", validCount)

	// After a successful full scrape, hide any listings that were not re-confirmed
	// (last_scraped before this run started). This catches products that are no
	// longer on sale or have been removed from the store's collection — they would
	// otherwise stay in the DB indefinitely with stale prices.
	// Guard: only run when we got a meaningful result count to avoid hiding
	// everything if the scrape silently returned too little.
	const minResultsForStaleCleanup = 10
	if validCount >= minResultsForStaleCleanup && ctx.Err() == nil {
		hidden, err := s.db.HideStaleListings(ctx, store.ID, scrapeStartedAt)
		if err != nil {
			schedulerLog.Error("stale listing cleanup failed", "store", store.Name, logutil.ErrAttr(err))
			sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "scrape", "phase": "stale_cleanup", "store": store.Name})
		} else if hidden > 0 {
			schedulerLog.Info("hid stale listings", "store", store.Name, "count", hidden)
		}
	}
}

// RunEnrichmentJob runs enrichment for listings needing it (all enricher stores, batched until timeout or backlog drained).
// triggeredBy is "manual", "cron", or "catch-up" for job history.
//
// Implementation lives in runEnrichmentLoop (shared with store-scoped and filtered jobs). An empty
// EnrichmentFilter is equivalent to the old GetListingsNeedingEnrichment query, but the loop keeps
// fetching batches until the job timeout or the backlog is empty — the old inline version stopped after one batch.
func (s *Scheduler) RunEnrichmentJob(force bool, triggeredBy string) {
	if triggeredBy == "" {
		triggeredBy = "manual"
	}
	s.runEnrichmentLoop(db.EnrichmentFilter{}, force, triggeredBy)
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
		enrichmentLog.Warn("no enricher for store_type; skipping", "store_type", storeType)
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
			enrichmentLog.Warn("no enricher for store_type; skipping", "store_type", f.StoreType)
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
		enrichmentLog.Error("failed to create enrich job", logutil.ErrAttr(err))
		sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "enrich", "phase": "create_job", "store_type": scope})
	}

	totalSuccess := 0
	totalProcessed := 0
	var errStrs []string
	defer func() {
		if r := recover(); r != nil {
			enrichmentLog.Error("panic during enrichment", "panic", r)
			sentryutil.CapturePanicValue(r, map[string]string{"component": "scheduler", "job": "enrich", "store_type": scope})
			if jobID != 0 {
				panicErrs := append(errStrs, fmt.Sprintf("panic: %v", r))
				s.finalizeEnrichJob(jobID, "failed", &totalProcessed, &totalSuccess, panicErrs, scope)
			}
		}
	}()

	batchSize := getEnrichBatchSize()
	maxListings := getEnrichMaxListings()
	var llmState llmlisting.QuotaJobState
	for {
		if ctx.Err() != nil {
			enrichmentLog.Warn("enrichment job timeout; saving partial progress", "scope", scope, "processed", totalProcessed, "enriched", totalSuccess)
			sentryutil.CaptureError(
				fmt.Errorf("enrichment job timed out for scope=%s (%d processed, %d enriched)", scope, totalProcessed, totalSuccess),
				map[string]string{"component": "scheduler", "job": "enrich", "store_type": scope},
			)
			if jobID != 0 {
				errStrs = append(errStrs, "job timed out")
				s.finalizeEnrichJob(jobID, "timed_out", &totalProcessed, &totalSuccess, errStrs, scope)
			}
			return
		}
		listings, err := s.db.GetListingsNeedingEnrichmentForFilter(ctx, f, batchSize, force)
		if err != nil {
			enrichmentLog.Error("failed to get listings for scope", "scope", scope, logutil.ErrAttr(err))
			sentryutil.CaptureError(err, map[string]string{"component": "scheduler", "job": "enrich", "phase": "list_listings", "store_type": scope})
			if jobID != 0 {
				s.finalizeEnrichJob(jobID, "failed", nil, nil, []string{err.Error()}, scope)
			}
			return
		}
		if len(listings) == 0 {
			break
		}
		enrichmentLog.Info("enriching batch", "scope", scope, "count", len(listings))
		seenJensonGroups := make(map[string]bool)
		seenCCGroups := make(map[string]bool)
		seenUCGroups := make(map[string]bool)
		seenFoxGroups := make(map[string]bool)
		successCount := 0
		for _, l := range listings {
			if maxListings > 0 && totalProcessed >= maxListings {
				break
			}
			if ctx.Err() != nil {
				enrichmentLog.Warn("enrichment job timeout; saving partial progress", "scope", scope, "processed", totalProcessed, "enriched", totalSuccess)
				sentryutil.CaptureError(
					fmt.Errorf("enrichment job timed out for scope=%s (%d processed, %d enriched)", scope, totalProcessed, totalSuccess),
					map[string]string{"component": "scheduler", "job": "enrich", "store_type": scope},
				)
				if jobID != 0 {
					errStrs = append(errStrs, "job timed out")
					s.finalizeEnrichJob(jobID, "timed_out", &totalProcessed, &totalSuccess, errStrs, scope)
				}
				return
			}
			totalProcessed++
			result, err := s.scraper.Enrich(ctx, l.ProductURL, l.StoreType)
			if err != nil {
				enrichmentLog.Error("enrichment failed for listing", "listing_id", l.ID, logutil.ErrAttr(err))
				errStrs = append(errStrs, fmt.Sprintf("listing %d: %v", l.ID, err))
				continue
			}
			if err := s.db.UpdateListingEnrichment(ctx, l.ID, result.CategoryPath, result.RawSpecs, result.Unavailable, result.Description); err != nil {
				enrichmentLog.Error("failed to update listing enrichment", "listing_id", l.ID, logutil.ErrAttr(err))
				errStrs = append(errStrs, fmt.Sprintf("listing %d update: %v", l.ID, err))
				continue
			}
			if err := s.db.ApplyJensonPDPVariantFanout(ctx, l.StoreID, l.StoreType, l.StoreSKU, enrichVariantsToJenson(result.Variants), seenJensonGroups); err != nil {
				enrichmentLog.Warn("jenson variant fan-out failed", "listing_id", l.ID, logutil.ErrAttr(err))
			}
			if err := applyCompetitiveCyclistVariantFanout(ctx, s.db, l.ID, l.StoreID, l.StoreType, l.StoreSKU, l.ProductURL, result.Variants, seenCCGroups); err != nil {
				enrichmentLog.Warn("competitivecyclist variant fan-out failed", "listing_id", l.ID, logutil.ErrAttr(err))
			}
			if err := applyUniversalCyclesVariantFanout(ctx, s.db, l.ID, l.StoreType, result.Variants, seenUCGroups); err != nil {
				enrichmentLog.Warn("universalcycles variant fan-out failed", "listing_id", l.ID, logutil.ErrAttr(err))
			}
			if err := s.db.ApplyFoxRacingPDPVariantFanout(ctx, l.StoreID, l.StoreType, l.StoreSKU, enrichVariantsToJenson(result.Variants), seenFoxGroups); err != nil {
				enrichmentLog.Warn("foxracing variant fan-out failed", "listing_id", l.ID, logutil.ErrAttr(err))
			}
			successCount++
			totalSuccess++
			if result.Unavailable {
				enrichmentLog.Debug("listing marked unavailable", "listing_id", l.ID)
			}
			if len(result.CategoryPath) > 0 {
				enrichmentLog.Debug("listing category path updated", "listing_id", l.ID, "category_path", result.CategoryPath)
			}
			llmlisting.RunSpecDetermination(ctx, s.db, s.llm, l.ID, &llmState, &errStrs)
		}
		enrichmentLog.Info("enrichment batch done", "scope", scope, "enriched", successCount, "batch_size", len(listings))
		if maxListings > 0 && totalProcessed >= maxListings {
			enrichmentLog.Info("reached per-job listing cap", "scope", scope, "cap", maxListings, "processed", totalProcessed)
			break
		}
		if len(listings) < batchSize {
			break
		}
	}
	if jobID != 0 {
		s.finalizeEnrichJob(jobID, "completed", &totalProcessed, &totalSuccess, errStrs, scope)
		captureEnrichJobListingErrorsAggregate(scope, totalProcessed, totalSuccess, errStrs)
	}
	if totalProcessed > 0 {
		enrichmentLog.Info("enrichment completed", "scope", scope, "enriched", totalSuccess, "processed", totalProcessed)
	} else {
		enrichmentLog.Info("no listings need enrichment", "scope", scope)
	}
}

// RunCatchUp checks the last scrape/enrich job and runs immediately if overdue.
// Helps when the process was down during the scheduled time (idle spin-down,
// deploys, crashes, or restarts) so a missed cron can run on the next startup.
func (s *Scheduler) RunCatchUp(scrapeInterval, enrichInterval time.Duration) {
	ctx := context.Background()

	scrapeAge, err := s.db.LastScrapeJobAge(ctx)
	if err != nil {
		catchUpLog.Error("failed to check last scrape job", logutil.ErrAttr(err))
	} else if scrapeAge < 0 || scrapeAge > scrapeInterval {
		label := "never"
		if scrapeAge >= 0 {
			label = scrapeAge.Round(time.Minute).String() + " ago"
		}
		catchUpLog.Info("last scrape overdue; running now", "last_scrape", label, "threshold", scrapeInterval.String())
		go s.RunScrapeJob("", "catch-up")
	} else {
		catchUpLog.Debug("last scrape not overdue", "age", scrapeAge.Round(time.Minute).String(), "threshold", scrapeInterval.String())
	}

	enrichAge, err := s.db.LastEnrichJobAge(ctx)
	if err != nil {
		catchUpLog.Error("failed to check last enrich job", logutil.ErrAttr(err))
	} else if enrichAge < 0 || enrichAge > enrichInterval {
		label := "never"
		if enrichAge >= 0 {
			label = enrichAge.Round(time.Minute).String() + " ago"
		}
		catchUpLog.Info("last enrichment overdue; running now", "last_enrichment", label, "threshold", enrichInterval.String())
		go s.RunEnrichmentJob(false, "catch-up")
	} else {
		catchUpLog.Debug("last enrichment not overdue", "age", enrichAge.Round(time.Minute).String(), "threshold", enrichInterval.String())
	}
}

func (s *Scheduler) Start(spec string, triggeredBy string) {
	if triggeredBy == "" {
		triggeredBy = "cron"
	}
	tb := triggeredBy
	s.cron.AddFunc(spec, func() { s.RunScrapeJob("", tb) })
	s.cron.Start()
	schedulerLog.Info("started scrape cron", "spec", spec)
}

func (s *Scheduler) StartEnrichment(spec string) {
	if spec != "" {
		s.cron.AddFunc(spec, func() { s.RunEnrichmentJob(false, "cron") })
		schedulerLog.Info("started enrichment cron", "spec", spec)
	}
}

func (s *Scheduler) Stop() {
	s.cron.Stop()
}
