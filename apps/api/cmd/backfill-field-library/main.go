// backfill-field-library renames ambiguous llm_specs / extraction_schema keys, seeds llm_extraction_field_defs,
// and fills llm_prompt_profile_fields from existing profiles. Run after migration 019.
//
// From repo root: make backfill-field-library
// From apps/api:  go run ./cmd/backfill-field-library
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
	st, err := database.BackfillFieldLibrary(ctx)
	if err != nil {
		log.Fatalf("backfill: %v", err)
	}
	log.Printf("Backfill complete: profiles_updated=%d listings_updated=%d field_defs_created=%d profile_field_rows=%d",
		st.ProfilesUpdated, st.ListingsUpdated, st.FieldDefsCreated, st.ProfileFieldRows)
}
