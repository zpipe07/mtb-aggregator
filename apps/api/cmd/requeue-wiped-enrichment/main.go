// requeue-wiped-enrichment clears last_enriched_at on listings whose metadata was wiped when
// scrape upsert overwrote enriched metadata with empty scrape payload. Follow with make enrich-now FORCE=1.
//
// From repo root: make requeue-wiped-enrichment
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

	n, err := database.RequeueWipedEnrichment(context.Background())
	if err != nil {
		log.Fatalf("requeue: %v", err)
	}
	log.Printf("Requeued %d listings for re-enrichment (run make enrich-now FORCE=1)", n)
}
