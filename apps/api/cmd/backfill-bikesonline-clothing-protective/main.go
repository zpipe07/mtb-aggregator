// backfill-bikesonline-clothing-protective applies confident LLM Gear sibling categories
// (Protection, Helmets, Gloves) for Bikes Online listings whose Shopify product_type
// "Clothing & Protective Gear" was keyword-mapped to Gear > Clothing.
//
// From repo root: make backfill-bikesonline-clothing-protective
// Dry run:        make backfill-bikesonline-clothing-protective DRY_RUN=1
package main

import (
	"context"
	"log"
	"os"
	"strings"

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

	dryRun := strings.TrimSpace(os.Getenv("DRY_RUN")) == "1" ||
		strings.EqualFold(strings.TrimSpace(os.Getenv("DRY_RUN")), "true")

	database, err := db.New(connString)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer database.Close()

	ctx := context.Background()
	result, err := database.BackfillBikesOnlineClothingProtectiveLLM(ctx, dryRun)
	if err != nil {
		log.Fatalf("backfill: %v", err)
	}
	db.LogBikesOnlineClothingProtectiveApplyResult(result)
	if dryRun {
		log.Printf("Dry run only; re-run without DRY_RUN=1 to apply")
	}
}
