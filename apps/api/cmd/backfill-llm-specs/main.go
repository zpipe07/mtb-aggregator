// backfill-llm-specs populates metadata.llm_specs from metadata.specs for listings
// that were LLM-enriched before the llm_specs split. Run after migration 016.
//
// From repo root: make backfill-llm-specs
// From apps/api:  go run ./cmd/backfill-llm-specs
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

	ctx := context.Background()
	updated, err := database.BackfillLLMSpecs(ctx)
	if err != nil {
		log.Fatalf("backfill: %v", err)
	}
	log.Printf("Backfill complete: %d listings updated", updated)
}
