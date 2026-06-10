package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// MigrationEntry describes one SQL migration file and whether it has been applied.
type MigrationEntry struct {
	Filename  string     `json:"filename"`
	Applied   bool       `json:"applied"`
	AppliedAt *time.Time `json:"applied_at,omitempty"`
}

// MigrationRunResult is returned after applying pending migrations.
type MigrationRunResult struct {
	Applied []string `json:"applied"`
	Skipped []string `json:"skipped"`
	Total   int      `json:"total"`
}

// ResolveMigrationsDir returns the absolute path to the migrations directory.
func ResolveMigrationsDir() (string, error) {
	return resolveSharedPath("MIGRATIONS_DIR", "packages/shared/migrations")
}

// ResolveSeedFile returns the absolute path to seed.sql.
func ResolveSeedFile() (string, error) {
	return resolveSharedPath("SEED_FILE", "packages/shared/seed.sql")
}

func resolveSharedPath(envKey, defaultRel string) (string, error) {
	if v := strings.TrimSpace(os.Getenv(envKey)); v != "" {
		abs, err := filepath.Abs(v)
		if err != nil {
			return "", fmt.Errorf("%s: %w", envKey, err)
		}
		return abs, nil
	}
	candidates := []string{
		filepath.Join("..", "..", defaultRel),
		defaultRel,
		filepath.Join("/app", defaultRel),
	}
	for _, c := range candidates {
		abs, err := filepath.Abs(c)
		if err != nil {
			continue
		}
		if _, err := os.Stat(abs); err == nil {
			return abs, nil
		}
	}
	return "", fmt.Errorf("%s not found (set %s)", defaultRel, envKey)
}

func listMigrationSQLFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read migrations dir: %w", err)
	}
	var files []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		files = append(files, e.Name())
	}
	sort.Strings(files)
	return files, nil
}

func (db *DB) ensureSchemaMigrationsTable(ctx context.Context) error {
	_, err := db.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	return err
}

// ListMigrationStatus returns all migration files and whether each has been applied.
func (db *DB) ListMigrationStatus(ctx context.Context, dir string) ([]MigrationEntry, error) {
	if err := db.ensureSchemaMigrationsTable(ctx); err != nil {
		return nil, fmt.Errorf("schema_migrations: %w", err)
	}
	files, err := listMigrationSQLFiles(dir)
	if err != nil {
		return nil, err
	}
	applied := make(map[string]time.Time)
	rows, err := db.pool.Query(ctx, `SELECT filename, applied_at FROM schema_migrations`)
	if err != nil {
		return nil, fmt.Errorf("list applied migrations: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		var at time.Time
		if err := rows.Scan(&name, &at); err != nil {
			return nil, err
		}
		applied[name] = at
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]MigrationEntry, 0, len(files))
	for _, name := range files {
		entry := MigrationEntry{Filename: name}
		if at, ok := applied[name]; ok {
			entry.Applied = true
			t := at
			entry.AppliedAt = &t
		}
		out = append(out, entry)
	}
	return out, nil
}

// RunPendingMigrations applies migration files that have not yet been recorded in schema_migrations.
func (db *DB) RunPendingMigrations(ctx context.Context, dir string) (*MigrationRunResult, error) {
	if err := db.ensureSchemaMigrationsTable(ctx); err != nil {
		return nil, fmt.Errorf("schema_migrations: %w", err)
	}
	files, err := listMigrationSQLFiles(dir)
	if err != nil {
		return nil, err
	}
	result := &MigrationRunResult{Total: len(files)}
	for _, name := range files {
		var done bool
		if err := db.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE filename = $1)`, name).Scan(&done); err != nil {
			return nil, fmt.Errorf("check %s: %w", name, err)
		}
		if done {
			result.Skipped = append(result.Skipped, name)
			continue
		}
		path := filepath.Join(dir, name)
		sql, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", name, err)
		}
		if _, err := db.pool.Exec(ctx, string(sql)); err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		if _, err := db.pool.Exec(ctx, `INSERT INTO schema_migrations (filename) VALUES ($1)`, name); err != nil {
			return nil, fmt.Errorf("record %s: %w", name, err)
		}
		result.Applied = append(result.Applied, name)
	}
	return result, nil
}

// RunSeedFile executes the seed SQL file (idempotent inserts).
func (db *DB) RunSeedFile(ctx context.Context, seedPath string) error {
	sql, err := os.ReadFile(seedPath)
	if err != nil {
		return fmt.Errorf("read seed file: %w", err)
	}
	if _, err := db.pool.Exec(ctx, string(sql)); err != nil {
		return fmt.Errorf("seed: %w", err)
	}
	return nil
}
