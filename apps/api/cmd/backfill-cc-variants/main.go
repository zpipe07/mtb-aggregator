// backfill-cc-variants runs Competitive Cyclist PDP enrich once per distinct product_url and fans out
// product_group_key + variant_options from JSON-LD hasVariant to matching catalog rows.
//
// From repo root: make backfill-cc-variants
// From apps/api:  go run ./cmd/backfill-cc-variants
//
// Rate limiting: BACKFILL_CC_VARIANT_DELAY_MS between PDP requests (default 2000);
// BACKFILL_CC_VARIANT_MAX_RETRIES per row (default 3).
package main

import (
	"context"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/scraper"
)

func main() {
	_ = godotenv.Load()
	_ = godotenv.Load("../../.env")

	connString := os.Getenv("DATABASE_URL")
	if connString == "" {
		log.Fatal("DATABASE_URL is required")
	}
	scraperURL := os.Getenv("SCRAPER_SERVICE_URL")
	if scraperURL == "" {
		scraperURL = "http://localhost:3000"
	}

	database, err := db.New(connString)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer database.Close()

	delay := 2 * time.Second
	if s := os.Getenv("BACKFILL_CC_VARIANT_DELAY_MS"); s != "" {
		if ms, err := strconv.Atoi(s); err == nil && ms >= 0 {
			delay = time.Duration(ms) * time.Millisecond
		}
	}
	maxRetries := 3
	if s := os.Getenv("BACKFILL_CC_VARIANT_MAX_RETRIES"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			maxRetries = n
		}
	}

	ctx := context.Background()
	rows, err := database.ListCCVariantBackfillLeaders(ctx)
	if err != nil {
		log.Fatalf("list leaders: %v", err)
	}
	log.Printf("backfill-cc-variants: %d product URLs", len(rows))

	client := scraper.NewClient(scraperURL)
	seen := make(map[string]bool)
	var ok, fail int
	for i, r := range rows {
		if i > 0 && delay > 0 {
			time.Sleep(delay)
		}
		var lastErr error
		for attempt := 0; attempt < maxRetries; attempt++ {
			if attempt > 0 {
				backoff := time.Duration(attempt) * delay
				if backoff > 30*time.Second {
					backoff = 30 * time.Second
				}
				time.Sleep(backoff)
			}
			result, err := client.Enrich(ctx, r.ProductURL, "competitivecyclist")
			if err != nil {
				lastErr = err
				log.Printf("enrich %s attempt %d/%d: %v", r.ProductURL, attempt+1, maxRetries, err)
				continue
			}
			vv := make([]db.CCVariant, len(result.Variants))
			for j, v := range result.Variants {
				vv[j] = db.CCVariant{
					Code:        v.Code,
					Dimensions:  v.Dimensions,
					IsOrderable: v.IsOrderable,
				}
			}
			if err := database.ApplyCompetitiveCyclistVariantFanout(ctx, r.StoreID, r.ProductURL, vv, seen); err != nil {
				lastErr = err
				log.Printf("fan-out %s attempt %d/%d: %v", r.ProductURL, attempt+1, maxRetries, err)
				continue
			}
			lastErr = nil
			ok++
			break
		}
		if lastErr != nil {
			fail++
		}
	}
	log.Printf("backfill-cc-variants: complete ok=%d failed_urls=%d", ok, fail)
}
