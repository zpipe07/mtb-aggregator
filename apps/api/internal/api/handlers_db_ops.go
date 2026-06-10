package api

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/sentryutil"
)

// adminDBOpsAllowed returns true when admin DB maintenance endpoints may run.
// In production, set ALLOW_ADMIN_DB_OPS=1 to enable migrations and seed from the dashboard.
func adminDBOpsAllowed() bool {
	if strings.TrimSpace(os.Getenv("ALLOW_ADMIN_DB_OPS")) == "1" {
		return true
	}
	switch strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV"))) {
	case "production", "prod":
		return false
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("RENDER")), "true") {
		return false
	}
	return true
}

// GetAdminDBMigrations returns migration file status (applied vs pending).
func (h *Handlers) GetAdminDBMigrations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	dir, err := db.ResolveMigrationsDir()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	entries, err := h.DB.ListMigrationStatus(r.Context(), dir)
	if err != nil {
		sentryutil.CaptureError(err, map[string]string{"component": "api", "handler": "admin_db_migrations"})
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	pending := 0
	for _, e := range entries {
		if !e.Applied {
			pending++
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"migrations_dir": dir,
		"migrations":     entries,
		"pending_count":  pending,
		"ops_allowed":    adminDBOpsAllowed(),
	})
}

// PostAdminDBMigrate applies pending SQL migrations.
func (h *Handlers) PostAdminDBMigrate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !adminDBOpsAllowed() {
		http.Error(w, "admin DB operations disabled in production; set ALLOW_ADMIN_DB_OPS=1", http.StatusForbidden)
		return
	}
	dir, err := db.ResolveMigrationsDir()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	result, err := h.DB.RunPendingMigrations(r.Context(), dir)
	if err != nil {
		sentryutil.CaptureError(err, map[string]string{"component": "api", "handler": "admin_db_migrate"})
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// PostAdminDBSeed runs packages/shared/seed.sql (idempotent store inserts).
func (h *Handlers) PostAdminDBSeed(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !adminDBOpsAllowed() {
		http.Error(w, "admin DB operations disabled in production; set ALLOW_ADMIN_DB_OPS=1", http.StatusForbidden)
		return
	}
	seedPath, err := db.ResolveSeedFile()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := h.DB.RunSeedFile(r.Context(), seedPath); err != nil {
		sentryutil.CaptureError(err, map[string]string{"component": "api", "handler": "admin_db_seed"})
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":        true,
		"seed_file": seedPath,
	})
}
