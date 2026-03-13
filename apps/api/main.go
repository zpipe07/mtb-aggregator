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
	"time"

	"github.com/joho/godotenv"
	"github.com/mtb-aggregator/api/internal/api"
	"github.com/mtb-aggregator/api/internal/brand"
	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/normalization"
	"github.com/mtb-aggregator/api/internal/llm"
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Cron-Secret, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// responseRecorder wraps http.ResponseWriter to capture status code for logging.
type responseRecorder struct {
	http.ResponseWriter
	status int
}

func (r *responseRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.Printf("[http] %s %s %s %d %v", r.RemoteAddr, r.Method, r.URL.Path, rec.status, time.Since(start))
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

var specKeyAliasesSeedStruct = struct {
	Aliases []struct {
		RawSubstr    string `json:"raw_substr"`
		CanonicalKey string `json:"canonical_key"`
	} `json:"aliases"`
}{}

// seedSpecKeyAliasesFromFile reads spec_key_aliases.json and seeds spec_key_aliases if the table is empty.
func seedSpecKeyAliasesFromFile(ctx context.Context, database *db.DB) (bool, error) {
	path := os.Getenv("SPEC_KEY_ALIASES_PATH")
	if path == "" {
		path = "../../packages/shared/spec_key_aliases.json"
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	if err := json.Unmarshal(data, &specKeyAliasesSeedStruct); err != nil {
		return false, err
	}
	seedSlice := make([]struct{ RawSubstr, CanonicalKey string }, len(specKeyAliasesSeedStruct.Aliases))
	for i := range specKeyAliasesSeedStruct.Aliases {
		seedSlice[i].RawSubstr = specKeyAliasesSeedStruct.Aliases[i].RawSubstr
		seedSlice[i].CanonicalKey = specKeyAliasesSeedStruct.Aliases[i].CanonicalKey
	}
	return database.SeedSpecKeyAliasesIfEmpty(ctx, seedSlice)
}

// loadNormalizationFromDB loads spec_key_aliases and spec_normalization_rules into the normalization engine.
func loadNormalizationFromDB(ctx context.Context, database *db.DB) error {
	// Key aliases
	aliases, err := database.ListSpecKeyAliases(ctx)
	if err != nil {
		return err
	}
	normAliases := make([]normalization.KeyAlias, len(aliases))
	for i := range aliases {
		normAliases[i] = normalization.KeyAlias{RawSubstr: aliases[i].RawSubstr, CanonicalKey: aliases[i].CanonicalKey}
	}
	if len(normAliases) == 0 {
		normAliases = normalization.DefaultKeyAliases()
	}
	normalization.SetKeyAliases(normAliases)

	// Value rules
	rules, err := database.ListSpecNormalizationRules(ctx)
	if err != nil {
		return err
	}
	normRules := make([]normalization.ValueRule, len(rules))
	for i := range rules {
		normRules[i] = normalization.ValueRule{
			SpecKey:  rules[i].SpecKey,
			RuleType: rules[i].RuleType,
			Config:   rules[i].Config,
			Priority: rules[i].Priority,
		}
	}
	normalization.SetValueRules(normRules)
	return nil
}

func main() {
	log.Println("[startup] initializing API")

	// Load .env from cwd or monorepo root so ENRICH_BATCH_SIZE etc. are set when running locally
	if err := godotenv.Load(); err != nil {
		log.Printf("[startup] .env from cwd: %v (using env vars)", err)
	} else {
		log.Println("[startup] loaded .env from cwd")
	}
	if p, err := filepath.Abs("../../.env"); err == nil && p != "" {
		if err := godotenv.Load(p); err != nil {
			log.Printf("[startup] .env from monorepo root: %v", err)
		} else {
			log.Println("[startup] loaded .env from monorepo root")
		}
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
		log.Println("[startup] using default DATABASE_URL")
	} else {
		log.Println("[startup] DATABASE_URL set from env")
	}

	scraperURL := os.Getenv("SCRAPER_SERVICE_URL")
	if scraperURL == "" {
		scraperURL = "http://localhost:3000"
	}
	log.Printf("[startup] scraper service URL: %s", scraperURL)

	database, err := db.New(connString)
	if err != nil {
		log.Fatalf("[startup] database: %v", err)
	}
	defer database.Close()
	log.Println("[startup] database connected")

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

	if seeded, err := seedSpecKeyAliasesFromFile(ctx, database); err != nil {
		log.Printf("[normalization] seed spec_key_aliases from file: %v", err)
	} else if seeded {
		log.Println("[normalization] seeded spec_key_aliases from JSON")
	}
	if err := loadNormalizationFromDB(ctx, database); err != nil {
		log.Printf("[normalization] load from DB: %v", err)
	} else {
		log.Println("[normalization] loaded spec key aliases and normalization rules from DB")
	}

	if err := database.MarkStaleJobs(ctx); err != nil {
		log.Printf("[jobs] mark stale jobs: %v", err)
	} else {
		log.Println("[jobs] marked any orphaned running jobs as stale")
	}

	scraperClient := scraper.NewClient(scraperURL)
	llmClient := llm.New("", "")
	sched := scheduler.New(database, scraperURL, llmClient)
	handlers := &api.Handlers{DB: database, ScraperURL: scraperURL, Scraper: scraperClient, LLM: llmClient}
	log.Println("[startup] scheduler and handlers initialized")

	// Cron: every 4 hours (configurable via SCRAPE_CRON_SPEC, "disabled" = use external cron)
	cronSpec := os.Getenv("SCRAPE_CRON_SPEC")
	if cronSpec == "" {
		cronSpec = "0 */4 * * *"
	}
	if !strings.EqualFold(cronSpec, "disabled") {
		sched.Start(cronSpec, "cron")
		log.Printf("[startup] scrape cron started: %s", cronSpec)
	} else {
		log.Println("[startup] scrape cron disabled (use external cron for /scrape-now)")
	}

	// Enrichment cron: nightly at 2am (ENRICH_CRON_SPEC, "disabled" = use external cron)
	enrichCronSpec := os.Getenv("ENRICH_CRON_SPEC")
	if enrichCronSpec == "" {
		enrichCronSpec = "0 2 * * *"
	}
	if !strings.EqualFold(enrichCronSpec, "disabled") {
		sched.StartEnrichment(enrichCronSpec)
		log.Printf("[startup] enrich cron started: %s", enrichCronSpec)
	} else {
		log.Println("[startup] enrichment cron disabled (use external cron for /enrich-now)")
	}

	// Manual trigger for testing: POST /scrape-now (optional ?store=worldwidecyclery; requires CRON_SECRET or admin auth if set)
	http.HandleFunc("/scrape-now", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			log.Printf("[scrape-now] rejected: method %s", r.Method)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !validateCronOrAdmin(r) {
			log.Printf("[scrape-now] forbidden: %s", r.RemoteAddr)
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		storeType := strings.TrimSpace(r.URL.Query().Get("store"))
		storeLog := "all stores"
		if storeType != "" {
			storeLog = storeType
		}
		log.Printf("[scrape-now] triggered manually for %s", storeLog)
		sched.RunScrapeJob(storeType, "manual")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Manual trigger for enrichment: POST /enrich-now (add ?force=1 to re-enrich all; requires CRON_SECRET or admin auth if set)
	http.HandleFunc("/enrich-now", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			log.Printf("[enrich-now] rejected: method %s", r.Method)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !validateCronOrAdmin(r) {
			log.Printf("[enrich-now] forbidden: %s", r.RemoteAddr)
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		force := r.URL.Query().Get("force") == "1"
		store := strings.TrimSpace(r.URL.Query().Get("store"))
		storeLog := "all stores"
		if store != "" {
			storeLog = store
		}
		log.Printf("[enrich-now] triggered manually for %s (force=%v)", storeLog, force)
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
	http.HandleFunc("/categories/tree", handlers.GetCategoryTree)
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
	// Admin: GET /admin/jobs/:id, POST /admin/jobs/:id/cancel
	http.HandleFunc("/admin/jobs/", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/admin/jobs/")
		path = strings.Trim(path, "/")
		if path == "" {
			http.NotFound(w, r)
			return
		}
		parts := strings.SplitN(path, "/", 2)
		id, err := strconv.Atoi(strings.TrimSpace(parts[0]))
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		if len(parts) == 2 && strings.TrimSpace(parts[1]) == "cancel" && r.Method == http.MethodPost {
			handlers.PostAdminCancelScrapeJob(w, r, id)
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
	// Admin: GET /admin/enrich-jobs/:id, POST /admin/enrich-jobs/:id/cancel
	http.HandleFunc("/admin/enrich-jobs/", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/admin/enrich-jobs/")
		path = strings.Trim(path, "/")
		if path == "" {
			http.NotFound(w, r)
			return
		}
		parts := strings.SplitN(path, "/", 2)
		id, err := strconv.Atoi(strings.TrimSpace(parts[0]))
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		if len(parts) == 2 && strings.TrimSpace(parts[1]) == "cancel" && r.Method == http.MethodPost {
			handlers.PostAdminCancelEnrichJob(w, r, id)
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
		if len(parts) > 1 && parts[1] == "llm-overrides" {
			if r.Method != http.MethodPost {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			handlers.PostAdminListingLLMOverrides(w, r, id)
			return
		}
		if r.Method == http.MethodPatch {
			handlers.PatchAdminListingHidden(w, r, id)
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
		if path == "reorder" {
			handlers.PutAdminTaxonomyReorder(w, r)
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

	// Admin: GET/POST /admin/categories — category tree and create; GET/PUT/DELETE /admin/categories/:id
	http.HandleFunc("/admin/categories", api.AdminRequired(handlers.CategoriesAdminHandler))
	http.HandleFunc("/admin/categories/", api.AdminRequired(handlers.CategoriesAdminHandler))

	// Admin: GET /admin/spec-keys — discover spec keys in listings
	http.HandleFunc("/admin/spec-keys", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/spec-keys" {
			http.NotFound(w, r)
			return
		}
		handlers.GetAdminSpecKeys(w, r)
	}))
	// Admin: POST /admin/renormalize-specs — re-apply key aliases and value rules to all listings
	http.HandleFunc("/admin/renormalize-specs", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/renormalize-specs" {
			http.NotFound(w, r)
			return
		}
		handlers.PostAdminRenormalizeSpecs(w, r)
	}))
	// Admin: GET /admin/normalization/unmapped — unmapped category paths (dashboard)
	http.HandleFunc("/admin/normalization/unmapped", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/normalization/unmapped" {
			http.NotFound(w, r)
			return
		}
		handlers.GetAdminUnmappedItems(w, r)
	}))
	// Admin: GET/POST /admin/normalization/rules — spec value normalization rules
	http.HandleFunc("/admin/normalization/rules", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/normalization/rules" {
			http.NotFound(w, r)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handlers.GetAdminSpecNormalizationRules(w, r)
		case http.MethodPost:
			handlers.PostAdminSpecNormalizationRule(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	// Admin: PUT/DELETE /admin/normalization/rules/:id
	http.HandleFunc("/admin/normalization/rules/", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/admin/normalization/rules/")
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
		case http.MethodPut:
			handlers.PutAdminSpecNormalizationRule(w, r, id)
		case http.MethodDelete:
			handlers.DeleteAdminSpecNormalizationRule(w, r, id)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	// Admin: GET/POST /admin/normalization/key-aliases — spec key aliases
	http.HandleFunc("/admin/normalization/key-aliases", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/normalization/key-aliases" {
			http.NotFound(w, r)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handlers.GetAdminSpecKeyAliases(w, r)
		case http.MethodPost:
			handlers.PostAdminSpecKeyAlias(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	// Admin: PUT/DELETE /admin/normalization/key-aliases/:id
	http.HandleFunc("/admin/normalization/key-aliases/", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/admin/normalization/key-aliases/")
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
		case http.MethodPut:
			handlers.PutAdminSpecKeyAlias(w, r, id)
		case http.MethodDelete:
			handlers.DeleteAdminSpecKeyAlias(w, r, id)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	// Admin: GET/POST /admin/spec-filter-config — list or create
	http.HandleFunc("/admin/spec-filter-config", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/spec-filter-config" {
			http.NotFound(w, r)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handlers.GetAdminSpecFilterConfigs(w, r)
		case http.MethodPost:
			handlers.PostAdminSpecFilterConfig(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	// Admin: GET/PUT/DELETE /admin/spec-filter-config/:id
	http.HandleFunc("/admin/spec-filter-config/", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/admin/spec-filter-config/")
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
			handlers.GetAdminSpecFilterConfigByID(w, r, id)
		case http.MethodPut:
			handlers.PutAdminSpecFilterConfig(w, r, id)
		case http.MethodDelete:
			handlers.DeleteAdminSpecFilterConfig(w, r, id)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	// Admin: GET/POST /admin/spec-value-aliases — list (query ?spec_key=) or create
	http.HandleFunc("/admin/spec-value-aliases", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/spec-value-aliases" {
			http.NotFound(w, r)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handlers.GetAdminSpecValueAliases(w, r)
		case http.MethodPost:
			handlers.PostAdminSpecValueAlias(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	// Admin: GET/PUT/DELETE /admin/spec-value-aliases/:id
	http.HandleFunc("/admin/spec-value-aliases/", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/admin/spec-value-aliases/")
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
			handlers.GetAdminSpecValueAliasByID(w, r, id)
		case http.MethodPut:
			handlers.PutAdminSpecValueAlias(w, r, id)
		case http.MethodDelete:
			handlers.DeleteAdminSpecValueAlias(w, r, id)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Admin: GET/PUT /admin/category-classifier, POST /admin/category-classifier/test, POST /admin/category-classifier/run
	http.HandleFunc("/admin/category-classifier/test", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/category-classifier/test" {
			http.NotFound(w, r)
			return
		}
		if r.Method == http.MethodPost {
			handlers.PostCategoryClassifierTest(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/admin/category-classifier/run", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/category-classifier/run" {
			http.NotFound(w, r)
			return
		}
		if r.Method == http.MethodPost {
			handlers.PostCategoryClassifierRun(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/admin/category-classifier", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/category-classifier" {
			http.NotFound(w, r)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handlers.GetCategoryClassifier(w, r)
		case http.MethodPut:
			handlers.PutCategoryClassifier(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Admin: POST /admin/llm/run — re-run LLM extraction for all listings in a canonical category
	http.HandleFunc("/admin/llm/run", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/llm/run" {
			http.NotFound(w, r)
			return
		}
		if r.Method == http.MethodPost {
			handlers.PostAdminLLMRun(w, r)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Admin: GET/POST /admin/llm-profiles — list or create LLM prompt profiles
	http.HandleFunc("/admin/llm-profiles", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/llm-profiles" {
			http.NotFound(w, r)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handlers.GetLLMProfiles(w, r)
		case http.MethodPost:
			handlers.PostLLMProfile(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	// Admin: GET/PUT/DELETE /admin/llm-profiles/:id, POST /admin/llm-profiles/:id/test
	http.HandleFunc("/admin/llm-profiles/", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/admin/llm-profiles/")
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
		if len(parts) > 1 && parts[1] == "test" {
			if r.Method == http.MethodPost {
				handlers.PostLLMProfileTest(w, r, id)
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		if len(parts) > 1 {
			http.NotFound(w, r)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handlers.GetLLMProfileByID(w, r, id)
		case http.MethodPut:
			handlers.PutLLMProfile(w, r, id)
		case http.MethodDelete:
			handlers.DeleteLLMProfile(w, r, id)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	port := "8080"
	if p := os.Getenv("PORT"); p != "" {
		port = p
	}

	go func() {
		log.Printf("[startup] API listening on port %s", port)
		handler := loggingMiddleware(corsMiddleware(http.DefaultServeMux))
		if err := http.ListenAndServe(":"+port, handler); err != nil {
			log.Fatal(err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	s := <-sig
	log.Printf("[shutdown] received signal %v", s)
	sched.Stop()
	log.Println("[shutdown] complete")
}
