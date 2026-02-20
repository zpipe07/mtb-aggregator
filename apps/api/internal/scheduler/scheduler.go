package scheduler

import (
	"context"
	"log"
	"strings"

	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/scraper"
	"github.com/robfig/cron/v3"
)

const enrichBatchSize = 50

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

func (s *Scheduler) RunScrapeJob() {
	ctx := context.Background()

	stores, err := s.db.GetStores(ctx)
	if err != nil {
		log.Printf("[scheduler] failed to get stores: %v", err)
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
	if storeType != "jensonusa" && storeType != "backcountry" {
		storeType = "jensonusa"
	}

	log.Printf("[scheduler] scraping %s (%s)", store.Name, store.ScrapeURL)

	results, err := s.scraper.Scrape(store.ScrapeURL, storeType)
	if err != nil {
		log.Printf("[scheduler] scrape failed for %s: %v", store.Name, err)
		return
	}

	log.Printf("[scheduler] %s: got %d listings", store.Name, len(results))

	validCount := 0
	for _, r := range results {
		if !s.validateListing(r) {
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

		listing := db.Listing{
			StoreID:       store.ID,
			StoreSKU:      r.StoreSKU,
			ProductName:   r.ProductName,
			CurrentPrice:  r.CurrentPrice,
			OriginalPrice: r.OriginalPrice,
			ProductURL:    r.ProductURL,
			ImageURL:      r.ImageURL,
			Brand:         r.Brand,
			CategoryPath:  nil, // Only enrichment populates category_path; listing heuristic is unreliable
			IsInStock:     r.IsInStock,
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

	listings, err := s.db.GetListingsNeedingEnrichment(ctx, enrichBatchSize, force)
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

func (s *Scheduler) validateListing(r scraper.ScrapeResult) bool {
	if r.CurrentPrice <= 0 {
		log.Printf("[scheduler] skip %s: invalid price %.2f", r.StoreSKU, r.CurrentPrice)
		return false
	}
	if r.CurrentPrice > 50000 {
		log.Printf("[scheduler] skip %s: price too high %.2f", r.StoreSKU, r.CurrentPrice)
		return false
	}
	if r.StoreSKU == "" || r.ProductName == "" || r.ProductURL == "" {
		log.Printf("[scheduler] skip: missing required fields")
		return false
	}
	return true
}

func (s *Scheduler) Start(spec string) {
	s.cron.AddFunc(spec, s.RunScrapeJob)
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
