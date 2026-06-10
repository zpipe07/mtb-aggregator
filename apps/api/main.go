package main

import (
	"context"
	"encoding/json"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
	"github.com/joho/godotenv"
	"github.com/mtb-aggregator/api/internal/api"
	"github.com/mtb-aggregator/api/internal/brand"
	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/llm"
	"github.com/mtb-aggregator/api/internal/logutil"
	"github.com/mtb-aggregator/api/internal/normalization"
	"github.com/mtb-aggregator/api/internal/scheduler"
	"github.com/mtb-aggregator/api/internal/scraper"
	"github.com/mtb-aggregator/api/internal/taxonomy"
)

// sentryRelease returns the release string for Sentry: explicit SENTRY_RELEASE, else Render's RENDER_GIT_COMMIT.
func sentryRelease() string {
	if r := strings.TrimSpace(os.Getenv("SENTRY_RELEASE")); r != "" {
		return r
	}
	return strings.TrimSpace(os.Getenv("RENDER_GIT_COMMIT"))
}

// initSentry configures error reporting when SENTRY_DSN is set. Returns whether Sentry is active.
func initSentry(logger *slog.Logger) bool {
	dsn := strings.TrimSpace(os.Getenv("SENTRY_DSN"))
	if dsn == "" {
		return false
	}
	if err := sentry.Init(sentry.ClientOptions{
		Dsn:              dsn,
		Environment:      os.Getenv("SENTRY_ENVIRONMENT"),
		Release:          sentryRelease(),
		TracesSampleRate: 0,
	}); err != nil {
		logger.Error("sentry init failed", logutil.ErrAttr(err))
		return false
	}
	logger.Info("sentry initialized")
	return true
}

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

func accessLoggingMiddleware(logger *slog.Logger, next http.Handler) http.Handler {
	if !logutil.HTTPAccessEnabled() {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		if r.URL.Path == "/health" {
			return
		}
		attrs := []any{
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"client_ip", logutil.ClientIP(r),
			"request_id", logutil.RequestID(r),
		}
		if q := r.URL.RawQuery; q != "" {
			attrs = append(attrs, "query", q)
		}
		logger.Info("request", attrs...)
	})
}

// isProduction is used for security defaults (e.g. cron triggers). Set APP_ENV=production, or deploy on Render (RENDER=true).
func isProduction() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV"))) {
	case "production", "prod":
		return true
	}
	return strings.EqualFold(strings.TrimSpace(os.Getenv("RENDER")), "true")
}

// validateCronSecret checks X-Cron-Secret or ?secret= against CRON_SECRET.
// With no CRON_SECRET: in production, returns false (fail closed); with ALLOW_OPEN_CRON=1, returns true (escape hatch for staging).
// Otherwise non-production allows unauthenticated triggers for local dev.
func validateCronSecret(r *http.Request) bool {
	secret := strings.TrimSpace(os.Getenv("CRON_SECRET"))
	if secret != "" {
		got := r.Header.Get("X-Cron-Secret")
		if got == "" {
			got = r.URL.Query().Get("secret")
		}
		return got == secret
	}
	if strings.TrimSpace(os.Getenv("ALLOW_OPEN_CRON")) == "1" {
		return true
	}
	if isProduction() {
		return false
	}
	return true
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
	logutil.Init("api")
	startupLog := logutil.Logger("startup")
	securityLog := logutil.Logger("security")
	taxonomyLog := logutil.Logger("taxonomy")
	normalizationLog := logutil.Logger("normalization")
	jobsLog := logutil.Logger("jobs")
	httpLog := logutil.Logger("http")
	scrapeNowLog := logutil.Logger("scrape-now")
	enrichNowLog := logutil.Logger("enrich-now")
	llmSpecsNowLog := logutil.Logger("llm-specs-now")
	shutdownLog := logutil.Logger("shutdown")

	startupLog.Info("initializing API")

	// Load .env from cwd or monorepo root so ENRICH_BATCH_SIZE etc. are set when running locally
	if err := godotenv.Load(); err != nil {
		startupLog.Info("no .env in cwd; using env vars", logutil.ErrAttr(err))
	} else {
		startupLog.Info("loaded .env from cwd")
	}
	if p, err := filepath.Abs("../../.env"); err == nil && p != "" {
		if err := godotenv.Load(p); err != nil {
			startupLog.Debug("no .env at monorepo root", logutil.ErrAttr(err))
		} else {
			startupLog.Info("loaded .env from monorepo root")
		}
	}

	sentryEnabled := initSentry(logutil.Logger("sentry"))

	if err := brand.Load(""); err != nil {
		logutil.Logger("brand").Warn("could not load aliases; brand normalization disabled", logutil.ErrAttr(err))
	}
	// Taxonomy is loaded from DB (loadTaxonomyFromDB); taxonomy.Load() from JSON is no longer used.

	connString := os.Getenv("DATABASE_URL")
	if connString == "" {
		connString = "postgres://mtb:mtb@localhost:5432/mtb_deals?sslmode=disable"
		startupLog.Info("using default DATABASE_URL")
	} else {
		startupLog.Info("DATABASE_URL set from env")
	}

	scraperURL := os.Getenv("SCRAPER_SERVICE_URL")
	if scraperURL == "" {
		scraperURL = "http://localhost:3000"
	}
	startupLog.Info("scraper service configured", "url", scraperURL)

	if isProduction() && strings.TrimSpace(os.Getenv("CRON_SECRET")) == "" && strings.TrimSpace(os.Getenv("ALLOW_OPEN_CRON")) != "1" {
		securityLog.Warn("CRON_SECRET unset in production: POST /scrape-now, /enrich-now, and /llm-specs-now require admin Bearer or set CRON_SECRET for X-Cron-Secret")
	}
	if isProduction() && strings.TrimSpace(os.Getenv("SCRAPER_SERVICE_SECRET")) == "" {
		securityLog.Warn("SCRAPER_SERVICE_SECRET unset in production: set the same value on API and scraper to authenticate POST /scrape and /enrich")
	}

	database, err := db.New(connString)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer database.Close()
	startupLog.Info("database connected")

	// Seed category_mappings from JSON if table is empty, then load taxonomy from DB
	ctx := context.Background()
	if seeded, err := seedCategoryMappingsFromFile(ctx, database); err != nil {
		taxonomyLog.Error("seed from file failed", logutil.ErrAttr(err))
	} else if seeded {
		taxonomyLog.Info("seeded category_mappings from JSON")
	}
	if err := loadTaxonomyFromDB(ctx, database); err != nil {
		taxonomyLog.Error("load from DB failed", logutil.ErrAttr(err))
	} else {
		taxonomyLog.Info("loaded category mappings from DB")
	}

	if seeded, err := seedSpecKeyAliasesFromFile(ctx, database); err != nil {
		normalizationLog.Error("seed spec_key_aliases from file failed", logutil.ErrAttr(err))
	} else if seeded {
		normalizationLog.Info("seeded spec_key_aliases from JSON")
	}
	if err := loadNormalizationFromDB(ctx, database); err != nil {
		normalizationLog.Error("load from DB failed", logutil.ErrAttr(err))
	} else {
		normalizationLog.Info("loaded spec key aliases and normalization rules from DB")
	}

	if err := database.MarkStaleJobs(ctx); err != nil {
		jobsLog.Error("mark stale jobs failed", logutil.ErrAttr(err))
	} else {
		jobsLog.Info("marked any orphaned running jobs as stale")
	}

	scraperClient := scraper.NewClient(scraperURL)
	llmClient := llm.New("", "")
	sched := scheduler.New(database, scraperURL, llmClient)
	handlers := &api.Handlers{DB: database, ScraperURL: scraperURL, Scraper: scraperClient, LLM: llmClient}
	startupLog.Info("scheduler and handlers initialized")

	// Cron: once a day at midnight (configurable via SCRAPE_CRON_SPEC, "disabled" = use external cron)
	cronSpec := os.Getenv("SCRAPE_CRON_SPEC")
	if cronSpec == "" {
		cronSpec = "0 0 * * *"
	}
	if !strings.EqualFold(cronSpec, "disabled") {
		sched.Start(cronSpec, "cron")
		startupLog.Info("scrape cron started", "spec", cronSpec)
	} else {
		startupLog.Info("scrape cron disabled (use external cron for /scrape-now)")
	}

	// Enrichment cron: nightly at 2am (ENRICH_CRON_SPEC, "disabled" = use external cron)
	enrichCronSpec := os.Getenv("ENRICH_CRON_SPEC")
	if enrichCronSpec == "" {
		enrichCronSpec = "0 2 * * *"
	}
	if !strings.EqualFold(enrichCronSpec, "disabled") {
		sched.StartEnrichment(enrichCronSpec)
		startupLog.Info("enrich cron started", "spec", enrichCronSpec)
	} else {
		startupLog.Info("enrichment cron disabled (use external cron for /enrich-now)")
	}

	// Catch-up: if the process missed scheduled jobs (was down during cron time,
	// deploy, restart), run overdue scrape/enrich once on startup.
	catchUpScrapeInterval := 24 * time.Hour
	catchUpEnrichInterval := 24 * time.Hour
	if cronSpec != "disabled" || enrichCronSpec != "disabled" {
		go sched.RunCatchUp(catchUpScrapeInterval, catchUpEnrichInterval)
	}

	// Manual trigger: POST /scrape-now (optional ?store=). Auth: valid CRON_SECRET, or admin Bearer, or (non-production only) open cron.
	http.HandleFunc("/scrape-now", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			scrapeNowLog.Warn("rejected request", "method", r.Method)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !validateCronOrAdmin(r) {
			scrapeNowLog.Warn("forbidden", "client_ip", logutil.ClientIP(r))
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		storeType := strings.TrimSpace(r.URL.Query().Get("store"))
		storeLog := "all stores"
		if storeType != "" {
			storeLog = storeType
		}
		scrapeNowLog.Info("triggered manually", "store", storeLog)
		sched.RunScrapeJob(storeType, "manual")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Manual trigger: POST /enrich-now (?force=1 re-enriches all). Same auth as /scrape-now.
	http.HandleFunc("/enrich-now", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			enrichNowLog.Warn("rejected request", "method", r.Method)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !validateCronOrAdmin(r) {
			enrichNowLog.Warn("forbidden", "client_ip", logutil.ClientIP(r))
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		force := r.URL.Query().Get("force") == "1"
		store := strings.TrimSpace(r.URL.Query().Get("store"))
		var canonPath []string
		if c := strings.TrimSpace(r.URL.Query().Get("canonical_category")); c != "" {
			for _, p := range strings.Split(c, " > ") {
				if t := strings.TrimSpace(p); t != "" {
					canonPath = append(canonPath, t)
				}
			}
		}
		var confBelow *float64
		if s := strings.TrimSpace(r.URL.Query().Get("llm_confidence_below")); s != "" {
			if v, err := strconv.ParseFloat(s, 64); err == nil && v >= 0 && v <= 1 {
				confBelow = &v
			}
		}
		storeLog := "all stores"
		if store != "" {
			storeLog = store
		}
		enrichNowLog.Info("triggered manually", "store", storeLog, "force", force, "canonical", canonPath, "llm_below", confBelow)
		go func() {
			if len(canonPath) > 0 || confBelow != nil {
				sched.RunEnrichmentWithFilter(db.EnrichmentFilter{
					StoreType:          store,
					CanonicalCategory:  canonPath,
					LlmConfidenceBelow: confBelow,
				}, force, "manual")
			} else {
				sched.RunEnrichmentJobForStore(store, force, "manual")
			}
		}()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte(`{"status":"ok","async":true}`))
	})

	// POST /llm-specs-now (?store=&canonical_category=&llm_confidence_below=&allow_empty_specs=1) — classify + extract from DB only (async enrich job).
	http.HandleFunc("/llm-specs-now", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			llmSpecsNowLog.Warn("rejected request", "method", r.Method)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !validateCronOrAdmin(r) {
			llmSpecsNowLog.Warn("forbidden", "client_ip", logutil.ClientIP(r))
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		store := strings.TrimSpace(r.URL.Query().Get("store"))
		storeLog := "all stores"
		if store != "" {
			storeLog = store
		}
		llmSpecsNowLog.Info("triggered", "store", storeLog)
		handlers.PostLLMSpecsNow(w, r)
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

	// Admin: POST /admin/listings/bulk-classify, bulk-enrich
	http.HandleFunc("/admin/listings/bulk-classify", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/listings/bulk-classify" {
			http.NotFound(w, r)
			return
		}
		handlers.PostAdminListingsBulkClassify(w, r)
	}))
	http.HandleFunc("/admin/listings/bulk-enrich", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/listings/bulk-enrich" {
			http.NotFound(w, r)
			return
		}
		handlers.PostAdminListingsBulkEnrich(w, r)
	}))

	http.HandleFunc("/admin/listings/bulk-llm-specs", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/listings/bulk-llm-specs" {
			http.NotFound(w, r)
			return
		}
		handlers.PostAdminListingsBulkLLMSpecs(w, r)
	}))
	http.HandleFunc("/admin/listings/bulk-set-category", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/listings/bulk-set-category" {
			http.NotFound(w, r)
			return
		}
		handlers.PostAdminListingsBulkSetCategory(w, r)
	}))
	// Admin: GET /admin/listings — data browser (query: store_id, brand, has_canonical_category, has_enrichment, category, category_slug, canonical_category, q, sort, limit, offset, llm_confidence_below)
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
		if len(parts) > 1 && parts[1] == "llm-specs" {
			if r.Method != http.MethodPost {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			handlers.PostAdminListingLLMSpecs(w, r, id)
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
		if len(parts) > 1 && parts[1] == "category" {
			handlers.PatchAdminListingCategory(w, r, id)
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
	// Admin: GET /admin/db/migrations — list migration status; POST /admin/db/migrate, /admin/db/seed
	http.HandleFunc("/admin/db/migrations", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/db/migrations" {
			http.NotFound(w, r)
			return
		}
		handlers.GetAdminDBMigrations(w, r)
	}))
	http.HandleFunc("/admin/db/migrate", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/db/migrate" {
			http.NotFound(w, r)
			return
		}
		handlers.PostAdminDBMigrate(w, r)
	}))
	http.HandleFunc("/admin/db/seed", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/db/seed" {
			http.NotFound(w, r)
			return
		}
		handlers.PostAdminDBSeed(w, r)
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

	// Admin: GET/POST /admin/llm-extraction-field-defs — LLM extraction field library
	http.HandleFunc("/admin/llm-extraction-field-defs", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/admin/llm-extraction-field-defs" {
			http.NotFound(w, r)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handlers.GetLLMExtractionFieldDefs(w, r)
		case http.MethodPost:
			handlers.PostLLMExtractionFieldDef(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	// Admin: GET/PUT/DELETE /admin/llm-extraction-field-defs/:id
	http.HandleFunc("/admin/llm-extraction-field-defs/", api.AdminRequired(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/admin/llm-extraction-field-defs/")
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
			handlers.GetLLMExtractionFieldDefByID(w, r, id)
		case http.MethodPut:
			handlers.PutLLMExtractionFieldDef(w, r, id)
		case http.MethodDelete:
			handlers.DeleteLLMExtractionFieldDef(w, r, id)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	port := "8080"
	if p := os.Getenv("PORT"); p != "" {
		port = p
	}

	go func() {
		startupLog.Info("API listening", "port", port)
		handler := accessLoggingMiddleware(httpLog, corsMiddleware(http.DefaultServeMux))
		if sentryEnabled {
			sentryHandler := sentryhttp.New(sentryhttp.Options{})
			handler = sentryHandler.Handle(handler)
		}
		if err := http.ListenAndServe(":"+port, handler); err != nil {
			log.Fatal(err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	s := <-sig
	shutdownLog.Info("received signal", "signal", s.String())
	sched.Stop()
	if sentryEnabled {
		sentry.Flush(2 * time.Second)
	}
	shutdownLog.Info("shutdown complete")
}
