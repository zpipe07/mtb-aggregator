package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/mtb-aggregator/api/internal/api"
	"github.com/mtb-aggregator/api/internal/brand"
	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/scheduler"
	"github.com/mtb-aggregator/api/internal/scraper"
	"github.com/mtb-aggregator/api/internal/taxonomy"
)

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := os.Getenv("CORS_ORIGINS")
		if allowed == "" {
			allowed = "*"
		}
		if allowed == "*" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if origin != "" {
			for _, o := range strings.Split(allowed, ",") {
				if strings.TrimSpace(o) == origin {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					break
				}
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Cron-Secret, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func validateCronSecret(r *http.Request) bool {
	secret := os.Getenv("CRON_SECRET")
	if secret == "" {
		return true
	}
	got := r.Header.Get("X-Cron-Secret")
	if got == "" {
		got = r.URL.Query().Get("secret")
	}
	return got == secret
}

// validateCronOrAdmin returns true if either CRON_SECRET or admin Bearer token is valid.
func validateCronOrAdmin(r *http.Request) bool {
	return validateCronSecret(r) || api.ValidateAdminAuth(r)
}

var taxonomySeedStruct = struct {
	Mappings []struct {
		Raw      []string `json:"raw"`
		Canonical []string `json:"canonical"`
	} `json:"mappings"`
}{}

// seedCategoryMappingsFromFile reads category_taxonomy.json and seeds category_mappings if the table is empty. Returns (true, nil) if seeded.
func seedCategoryMappingsFromFile(ctx context.Context, database *db.DB) (bool, error) {
	path := os.Getenv("CATEGORY_TAXONOMY_PATH")
	if path == "" {
		path = "../../packages/shared/category_taxonomy.json"
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	if err := json.Unmarshal(data, &taxonomySeedStruct); err != nil {
		return false, err
	}
	seedSlice := make([]struct{ Raw []string; Canonical []string }, len(taxonomySeedStruct.Mappings))
	for i := range taxonomySeedStruct.Mappings {
		seedSlice[i].Raw = taxonomySeedStruct.Mappings[i].Raw
		seedSlice[i].Canonical = taxonomySeedStruct.Mappings[i].Canonical
	}
	return database.SeedCategoryMappingsIfEmpty(ctx, seedSlice)
}

// loadTaxonomyFromDB loads category_mappings from DB into the taxonomy in-memory cache.
func loadTaxonomyFromDB(ctx context.Context, database *db.DB) error {
	list, err := database.ListCategoryMappings(ctx)
	if err != nil {
		return err
	}
	mappings := make([]taxonomy.Mapping, len(list))
	for i := range list {
		mappings[i] = taxonomy.Mapping{Raw: list[i].RawKeywords, Canonical: list[i].Canonical}
	}
	taxonomy.SetMappings(mappings)
	return nil
}

func main() {
	// Load .env from cwd or monorepo root so ENRICH_BATCH_SIZE etc. are set when running locally
	_ = godotenv.Load()
	if p, _ := filepath.Abs("../../.env"); p != "" {
		_ = godotenv.Load(p)
	}

	if err := brand.Load(""); err != nil {
		log.Printf("[brand] could not load aliases (brand normalization disabled): %v", err)
	}
	if err := taxonomy.Load(""); err != nil {
		log.Printf("[taxonomy] could not load category taxonomy (canonical category disabled): %v", err)
	}

	connString := os.Getenv("DATABASE_URL")
	if connString == "" {
		connString = "postgres://mtb:mtb@localhost:5432/mtb_deals?sslmode=disable"
	}

	scraperURL := os.Getenv("SCRAPER_SERVICE_URL")
	if scraperURL == "" {
		scraperURL = "http://localhost:3000"
	}
	log.Printf("scraper service URL: %s (scrape-now requires scraper running: pnpm --filter @mtb-aggregator/scraper run dev)", scraperURL)

	database, err := db.New(connString)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer database.Close()

	// Seed category_mappings from JSON if table is empty, then load taxonomy from DB
	ctx := context.Background()
	if seeded, err := seedCategoryMappingsFromFile(ctx, database); err != nil {
		log.Printf("[taxonomy] seed from file: %v", err)
	} else if seeded {
		log.Println("[taxonomy] seeded category_mappings from JSON")
	}
	if err := loadTaxonomyFromDB(ctx, database); err != nil {
		log.Printf("[taxonomy] load from DB: %v", err)
	} else {
		log.Println("[taxonomy] loaded category mappings from DB")
	}

	sched := scheduler.New(database, scraperURL)
	scraperClient := scraper.NewClient(scraperURL)
	handlers := &api.Handlers{DB: database, ScraperURL: scraperURL, Scraper: scraperClient}

	// Cron: every 4 hours (configurable via SCRAPE_CRON_SPEC, "disabled" = use external cron)
	cronSpec := os.Getenv("SCRAPE_CRON_SPEC")
	if cronSpec == "" {
		cronSpec = "0 */4 * * *"
	}
	if !strings.EqualFold(cronSpec, "disabled") {
		sched.Start(cronSpec, "cron")
	} else {
		log.Println("scrape cron disabled (use external cron for /scrape-now)")
	}

	// Enrichment cron: nightly at 2am (ENRICH_CRON_SPEC, "disabled" = use external cron)
	enrichCronSpec := os.Getenv("ENRICH_CRON_SPEC")
	if enrichCronSpec == "" {
		enrichCronSpec = "0 2 * * *"
	}
	if !strings.EqualFold(enrichCronSpec, "disabled") {
		sched.StartEnrichment(enrichCronSpec)
	} else {
		log.Println("enrichment cron disabled (use external cron for /enrich-now)")
	}

	// Manual trigger for testing: POST /scrape-now (optional ?store=worldwidecyclery; requires CRON_SECRET or admin auth if set)
	http.HandleFunc("/scrape-now", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !validateCronOrAdmin(r) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		storeType := strings.TrimSpace(r.URL.Query().Get("store"))
		sched.RunScrapeJob(storeType, "manual")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Manual trigger for enrichment: POST /enrich-now (add ?force=1 to re-enrich all; requires CRON_SECRET or admin auth if set)
	http.HandleFunc("/enrich-now", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !validateCronOrAdmin(r) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		force := r.URL.Query().Get("force") == "1"
		store := strings.TrimSpace(r.URL.Query().Get("store"))
		sched.RunEnrichmentJobForStore(store, force, "manual")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// REST API
	http.HandleFunc("/deals", handlers.DealsHandler)
	http.HandleFunc("/deals/", handlers.DealsHandler)
	http.HandleFunc("/stores", handlers.GetStores)
	http.HandleFunc("/brands", handlers.GetBrands)
	http.HandleFunc("/categories", handlers.GetCategories)
	http.HandleFunc("/canonical-categories", handlers.GetCanonicalCategories)
	http.HandleFunc("/spec-values", handlers.GetSpecValues)
	http.HandleFunc("/facets", handlers.GetFacets)
	http.HandleFunc("/status", handlers.GetStatus)

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Admin: POST /admin/auth (no auth required) — validates password for dashboard login
	http.HandleFunc("/admin/auth", api.PostAuthHandler)
	// Admin: GET /admin/dashboard — aggregate stats, store health, scraper status (admin auth required)
	http.HandleFunc("/admin/dashboard", api.AdminRequired(handlers.GetAdminDashboard))
	// Admin: GET /admin/store-types — allowed store types for dropdown
	http.HandleFunc("/admin/store-types", api.AdminRequired(api.GetStoreTypes))
	// Admin: GET /admin/store-types-with-enrichers — store types that support enrichment (for Enrich button)
	http.HandleFunc("/admin/store-types-with-enrichers", api.AdminRequired(handlers.GetStoreTypesWithEnrichers))
	// Admin: GET/POST /admin/stores — list or create stores
	http.HandleFunc("/admin/stores", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/stores" {
			http.NotFound(w, r)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handlers.GetAdminStores(w, r)
		case http.MethodPost:
			handlers.PostAdminStore(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	// Admin: GET/PUT/DELETE /admin/stores/:id
	http.HandleFunc("/admin/stores/", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/admin/stores/")
		path = strings.Trim(path, "/")
		if path == "" {
			http.NotFound(w, r)
			return
		}
		id, err := strconv.Atoi(path)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handlers.GetAdminStoreByID(w, r, id)
		case http.MethodPut:
			handlers.PutAdminStore(w, r, id)
		case http.MethodDelete:
			handlers.DeleteAdminStore(w, r, id)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Admin: GET /admin/jobs — list scrape jobs (query: limit, offset, store_id)
	http.HandleFunc("/admin/jobs", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/jobs" {
			http.NotFound(w, r)
			return
		}
		handlers.GetAdminJobs(w, r)
	}))
	// Admin: GET /admin/jobs/:id
	http.HandleFunc("/admin/jobs/", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/admin/jobs/")
		path = strings.Trim(path, "/")
		if path == "" {
			http.NotFound(w, r)
			return
		}
		id, err := strconv.Atoi(path)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		handlers.GetAdminJobByID(w, r, id)
	}))

	// Admin: GET /admin/enrich-jobs — list enrich jobs (query: limit, offset)
	http.HandleFunc("/admin/enrich-jobs", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/enrich-jobs" {
			http.NotFound(w, r)
			return
		}
		handlers.GetAdminEnrichJobs(w, r)
	}))
	// Admin: GET /admin/enrich-jobs/:id
	http.HandleFunc("/admin/enrich-jobs/", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/admin/enrich-jobs/")
		path = strings.Trim(path, "/")
		if path == "" {
			http.NotFound(w, r)
			return
		}
		id, err := strconv.Atoi(path)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		handlers.GetAdminEnrichJobByID(w, r, id)
	}))

	// Admin: GET /admin/listings — data browser (query: store_id, brand, has_canonical_category, has_enrichment, category, canonical_category, q, sort, limit, offset)
	http.HandleFunc("/admin/listings", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/listings" {
			http.NotFound(w, r)
			return
		}
		handlers.GetAdminListings(w, r)
	}))
	// Admin: GET /admin/listings/:id, POST /admin/listings/:id/enrich
	http.HandleFunc("/admin/listings/", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/admin/listings/")
		path = strings.Trim(path, "/")
		if path == "" {
			http.NotFound(w, r)
			return
		}
		parts := strings.SplitN(path, "/", 2)
		id, err := strconv.Atoi(parts[0])
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		if len(parts) > 1 && parts[1] == "enrich" {
			if r.Method != http.MethodPost {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			handlers.PostAdminEnrichListing(w, r, id)
			return
		}
		handlers.GetAdminListingByID(w, r, id)
	}))

	// Admin: GET/POST /admin/taxonomy — list or create category mappings
	http.HandleFunc("/admin/taxonomy", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/taxonomy" {
			http.NotFound(w, r)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handlers.GetAdminTaxonomy(w, r)
		case http.MethodPost:
			handlers.PostAdminTaxonomy(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	// Admin: GET/PUT/DELETE /admin/taxonomy/:id, POST /admin/taxonomy/recategorize
	http.HandleFunc("/admin/taxonomy/", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/admin/taxonomy/")
		path = strings.Trim(path, "/")
		if path == "" {
			http.NotFound(w, r)
			return
		}
		if path == "recategorize" {
			handlers.PostAdminTaxonomyRecategorize(w, r)
			return
		}
		id, err := strconv.Atoi(path)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handlers.GetAdminTaxonomyByID(w, r, id)
		case http.MethodPut:
			handlers.PutAdminTaxonomy(w, r, id)
		case http.MethodDelete:
			handlers.DeleteAdminTaxonomy(w, r, id)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	port := "8080"
	if p := os.Getenv("PORT"); p != "" {
		port = p
	}

	go func() {
		log.Printf("API listening on port %s", port)
		handler := corsMiddleware(http.DefaultServeMux)
		if err := http.ListenAndServe(":"+port, handler); err != nil {
			log.Fatal(err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	sched.Stop()
	log.Println("shutdown complete")
}
