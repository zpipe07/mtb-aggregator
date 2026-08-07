// migrate runs SQL migration files from a directory against DATABASE_URL.
// Use with Neon or any Postgres; uses pgx so no psql/SNI issues.
//
// From repo root: make db-migrate-remote  (uses .env from repo root via ../../.env)
// From apps/api: go run ./cmd/migrate
//
// Default MIGRATIONS_DIR is resolved via internal/db.ResolveMigrationsDir().
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

	dir, err := db.ResolveMigrationsDir()
	if err != nil {
		log.Fatal(err)
	}

	database, err := db.New(connString)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()

	ctx := context.Background()
	result, err := database.RunPendingMigrations(ctx, dir)
	if err != nil {
		log.Fatal(err)
	}
	for _, name := range result.Skipped {
		log.Printf("Skipping %s (already applied)", name)
	}
	for _, name := range result.Applied {
		log.Printf("Applied %s", name)
	}
	log.Printf("Migrations complete (%d files, %d newly applied).", result.Total, len(result.Applied))
}
