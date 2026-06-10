// seed runs packages/shared/seed.sql against DATABASE_URL.
// Use with Neon or any Postgres; uses pgx so no psql/SNI issues.
//
// From repo root: make db-seed-remote  (uses .env from repo root)
// From apps/api: go run ./cmd/seed
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
		log.Fatal("DATABASE_URL is required (set in .env or environment)")
	}

	seedPath, err := db.ResolveSeedFile()
	if err != nil {
		log.Fatal(err)
	}

	database, err := db.New(connString)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()

	ctx := context.Background()
	log.Printf("Running seed %s...", seedPath)
	if err := database.RunSeedFile(ctx, seedPath); err != nil {
		log.Fatal(err)
	}
	log.Printf("Seed complete.")
}
