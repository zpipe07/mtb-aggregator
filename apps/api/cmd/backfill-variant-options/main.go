// backfill-variant-options fetches Shopify product JSON for listings missing variant_options.
// Run after migration 021. Requires DATABASE_URL.
//
// From repo root: make backfill-variant-options
// From apps/api:  go run ./cmd/backfill-variant-options
package main

import (
	"context"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/mtb-aggregator/api/internal/db"
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

	n, err := database.BackfillVariantOptions(context.Background())
	if err != nil {
		log.Fatalf("backfill: %v", err)
	}
	log.Printf("Backfill complete: %d listings updated", n)
}
