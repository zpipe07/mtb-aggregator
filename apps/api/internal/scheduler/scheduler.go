package scheduler

import (
	"context"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/mtb-aggregator/api/internal/brand"
	"github.com/mtb-aggregator/api/internal/db"
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

type Scheduler struct {
	cron    *cron.Cron
	db      *db.DB
	scraper *scraper.Client
}

func New(database *db.DB, scraperURL string) *Scheduler {
	return &Scheduler{
		cron:    cron.New(),
		db:      database,
		scraper: scraper.NewClient(scraperURL),
	}
}

// RunScrapeJob scrapes all stores. If storeType is non-empty, only stores with that store_type are scraped (e.g. "worldwidecyclery").
func (s *Scheduler) RunScrapeJob(storeType string) {
	ctx := context.Background()

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
		s.scrapeStore(ctx, store)
	}
}

func (s *Scheduler) scrapeStore(ctx context.Context, store db.Store) {
	storeType := store.StoreType
	if storeType == "" {
		storeType = strings.ToLower(strings.ReplaceAll(store.Name, " ", ""))
	}
	if storeType != "jensonusa" && storeType != "backcountry" && storeType != "worldwidecyclery" && storeType != "revelbikes" {
		storeType = "jensonusa"
	}

	log.Printf("[scheduler] scraping %s (%s)", store.Name, store.ScrapeURL)

	results, err := s.scraper.Scrape(store.ScrapeURL, storeType)
	if err != nil {
		log.Printf("[scheduler] scrape failed for %s: %v", store.Name, err)
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
		return
	}

	validCount := 0
	for i, r := range results {
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
			Metadata:          metadata.Extract(r.ProductName),
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

	log.Printf("[scheduler] %s: saved %d listings", store.Name, validCount)
}

func (s *Scheduler) RunEnrichmentJob(force bool) {
	ctx := context.Background()

	batchSize := getEnrichBatchSize()
	listings, err := s.db.GetListingsNeedingEnrichment(ctx, batchSize, force)
	if err != nil {
		log.Printf("[enrichment] failed to get listings: %v", err)
		return
	}

	if len(listings) == 0 {
		log.Printf("[enrichment] no listings need enrichment")
		return
	}

	log.Printf("[enrichment] enriching %d listings", len(listings))

	successCount := 0
	for _, l := range listings {
		result, err := s.scraper.Enrich(l.ProductURL, l.StoreType)
		if err != nil {
			log.Printf("[enrichment] failed for listing %d: %v", l.ID, err)
			continue
		}

		if err := s.db.UpdateListingEnrichment(ctx, l.ID, result.CategoryPath); err != nil {
			log.Printf("[enrichment] failed to update listing %d: %v", l.ID, err)
			continue
		}

		successCount++
		if len(result.CategoryPath) > 0 {
			log.Printf("[enrichment] listing %d: category_path=%v", l.ID, result.CategoryPath)
		}
	}

	log.Printf("[enrichment] enriched %d/%d listings", successCount, len(listings))
}


func (s *Scheduler) Start(spec string) {
	s.cron.AddFunc(spec, func() { s.RunScrapeJob("") })
	s.cron.Start()
	log.Printf("[scheduler] started scrape cron with spec %s", spec)
}

func (s *Scheduler) StartEnrichment(spec string) {
	if spec != "" {
		s.cron.AddFunc(spec, func() { s.RunEnrichmentJob(false) })
		log.Printf("[scheduler] started enrichment cron with spec %s", spec)
	}
}

func (s *Scheduler) Stop() {
	s.cron.Stop()
}
