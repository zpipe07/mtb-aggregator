// migrate runs SQL migration files from a directory against DATABASE_URL.
// Use with Neon or any Postgres; uses pgx so no psql/SNI issues.
//
// From repo root: make db-migrate-remote  (uses .env from repo root via ../../.env)
// From apps/api: go run ./cmd/migrate
//
// Default MIGRATIONS_DIR is ../../packages/shared/migrations (from apps/api).
package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env from apps/api and from repo root
	_ = godotenv.Load()
	_ = godotenv.Load("../../.env")

	connString := os.Getenv("DATABASE_URL")
	if connString == "" {
		log.Fatal("DATABASE_URL is required (set in .env or environment)")
	}

	dir := os.Getenv("MIGRATIONS_DIR")
	if dir == "" {
		dir = "../../packages/shared/migrations"
	}
	absDir, err := filepath.Abs(dir)
	if err != nil {
		log.Fatalf("migrations dir: %v", err)
	}

	entries, err := os.ReadDir(absDir)
	if err != nil {
		log.Fatalf("read migrations dir: %v", err)
	}

	var files []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		files = append(files, e.Name())
	}
	sort.Strings(files)
	if len(files) == 0 {
		log.Printf("no .sql files in %s", absDir)
		return
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

	_, err = pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		log.Fatalf("schema_migrations: %v", err)
	}

	var ran int
	for _, name := range files {
		var done bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE filename = $1)`, name).Scan(&done); err != nil {
			log.Fatalf("check %s: %v", name, err)
		}
		if done {
			log.Printf("Skipping %s (already applied)", name)
			continue
		}

		path := filepath.Join(absDir, name)
		sql, err := os.ReadFile(path)
		if err != nil {
			log.Fatalf("read %s: %v", name, err)
		}
		log.Printf("Running %s...", name)
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			log.Fatalf("%s: %v", name, err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO schema_migrations (filename) VALUES ($1)`, name); err != nil {
			log.Fatalf("record %s: %v", name, err)
		}
		log.Printf("  OK")
		ran++
	}
	log.Printf("Migrations complete (%d files, %d newly applied).", len(files), ran)
}
