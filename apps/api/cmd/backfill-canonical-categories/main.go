// backfill-canonical-categories sets store_listings.canonical_category from category_path
// using packages/shared/category_taxonomy.json. Run once after adding the taxonomy, or when updating mappings.
//
// From repo root: make backfill-canonical-categories
// From apps/api:  go run ./cmd/backfill-canonical-categories
package main

import (
	"context"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/taxonomy"
)

func main() {
	_ = godotenv.Load()
	_ = godotenv.Load("../../.env")

	if err := taxonomy.Load(""); err != nil {
		log.Fatalf("load taxonomy: %v", err)
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
	updated, err := database.BackfillCanonicalCategories(ctx, taxonomy.Map)
	if err != nil {
		log.Fatalf("backfill: %v", err)
	}
	log.Printf("Backfill complete: %d listings updated", updated)
}
