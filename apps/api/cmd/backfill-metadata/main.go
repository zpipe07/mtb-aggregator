// backfill-metadata sets store_listings.metadata from product_name using metadata.Extract
// (wheel_size, model_year, groupset, etc.). Run once so existing listings can be filtered by metadata chips.
//
// From repo root: make backfill-metadata
// From apps/api:  go run ./cmd/backfill-metadata
package main

import (
	"context"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/metadata"
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
	updated, err := database.BackfillMetadata(ctx, metadata.Extract)
	if err != nil {
		log.Fatalf("backfill: %v", err)
	}
	log.Printf("Backfill complete: %d listings updated", updated)
}
