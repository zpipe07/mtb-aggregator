// backfill-canonical-categories sets store_listings.canonical_category from category_path
// using category_mappings in the database, then Wheels/Tires title refine (ZAC-263).
// Run after updating mappings in the admin UI or DB.
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
	list, err := database.ListCategoryMappings(ctx)
	if err != nil {
		log.Fatalf("load mappings: %v", err)
	}
	mappings := make([]taxonomy.Mapping, len(list))
	for i := range list {
		mappings[i] = taxonomy.Mapping{Raw: list[i].RawKeywords, Canonical: list[i].Canonical}
	}
	taxonomy.SetMappings(mappings)

	updated, err := database.BackfillCanonicalCategories(ctx, taxonomy.Map)
	if err != nil {
		log.Fatalf("backfill: %v", err)
	}
	log.Printf("Backfill complete: %d listings updated", updated)
}
