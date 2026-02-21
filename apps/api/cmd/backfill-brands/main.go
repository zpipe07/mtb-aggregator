// backfill-brands normalizes existing store_listings.brand using packages/shared/brand_aliases.json.
// Run once after enabling brand normalization, or when adding new aliases.
//
// From repo root: make backfill-brands  (uses .env DATABASE_URL)
// From apps/api:  go run ./cmd/backfill-brands
package main

import (
	"context"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/mtb-aggregator/api/internal/brand"
	"github.com/mtb-aggregator/api/internal/db"
)

func main() {
	_ = godotenv.Load()
	_ = godotenv.Load("../../.env")

	if err := brand.Load(""); err != nil {
		log.Fatalf("load brand aliases: %v", err)
	}

	connString := os.Getenv("DATABASE_URL")
	if connString == "" {
		log.Fatal("DATABASE_URL is required")
	}

	database, err := db.New(connString)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer database.Close()

	ctx := context.Background()
	updated, err := database.BackfillBrands(ctx, brand.Normalize)
	if err != nil {
		log.Fatalf("backfill: %v", err)
	}
	log.Printf("Backfill complete: %d listings updated", updated)
}
