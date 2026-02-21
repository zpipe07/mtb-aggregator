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
	"path/filepath"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	_ = godotenv.Load("../../.env")

	connString := os.Getenv("DATABASE_URL")
	if connString == "" {
		log.Fatal("DATABASE_URL is required (set in .env or environment)")
	}

	seedPath := os.Getenv("SEED_FILE")
	if seedPath == "" {
		seedPath = "../../packages/shared/seed.sql"
	}
	absPath, err := filepath.Abs(seedPath)
	if err != nil {
		log.Fatalf("seed path: %v", err)
	}
	sql, err := os.ReadFile(absPath)
	if err != nil {
		log.Fatalf("read seed file: %v", err)
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, connString)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("ping: %v", err)
	}

	log.Printf("Running seed %s...", absPath)
	if _, err := pool.Exec(ctx, string(sql)); err != nil {
		log.Fatalf("seed: %v", err)
	}
	log.Printf("Seed complete.")
}
