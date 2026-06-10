package db

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveMigrationsDirFromEnv(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MIGRATIONS_DIR", dir)
	got, err := ResolveMigrationsDir()
	if err != nil {
		t.Fatal(err)
	}
	if got != dir {
		t.Fatalf("got %q want %q", got, dir)
	}
}

func TestListMigrationSQLFiles(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"002_b.sql", "001_a.sql", "readme.txt", "subdir"} {
		path := filepath.Join(dir, name)
		if name == "subdir" {
			if err := os.Mkdir(path, 0o755); err != nil {
				t.Fatal(err)
			}
			continue
		}
		if err := os.WriteFile(path, []byte("-- test"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	files, err := listMigrationSQLFiles(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 || files[0] != "001_a.sql" || files[1] != "002_b.sql" {
		t.Fatalf("got %v", files)
	}
}
