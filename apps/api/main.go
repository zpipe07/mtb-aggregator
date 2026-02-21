package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/mtb-aggregator/api/internal/api"
	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/scheduler"
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Cron-Secret")
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

func main() {
	// Load .env from cwd or monorepo root so ENRICH_BATCH_SIZE etc. are set when running locally
	_ = godotenv.Load()
	if p, _ := filepath.Abs("../../.env"); p != "" {
		_ = godotenv.Load(p)
	}

	connString := os.Getenv("DATABASE_URL")
	if connString == "" {
		connString = "postgres://mtb:mtb@localhost:5432/mtb_deals?sslmode=disable"
	}

	scraperURL := os.Getenv("SCRAPER_SERVICE_URL")
	if scraperURL == "" {
		scraperURL = "http://localhost:3000"
	}

	database, err := db.New(connString)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer database.Close()

	sched := scheduler.New(database, scraperURL)
	handlers := &api.Handlers{DB: database, ScraperURL: scraperURL}

	// Cron: every 4 hours (configurable via SCRAPE_CRON_SPEC, "disabled" = use external cron)
	cronSpec := os.Getenv("SCRAPE_CRON_SPEC")
	if cronSpec == "" {
		cronSpec = "0 */4 * * *"
	}
	if !strings.EqualFold(cronSpec, "disabled") {
		sched.Start(cronSpec)
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

	// Manual trigger for testing: POST /scrape-now (requires CRON_SECRET if set)
	http.HandleFunc("/scrape-now", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !validateCronSecret(r) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		sched.RunScrapeJob()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Manual trigger for enrichment: POST /enrich-now (add ?force=1 to re-enrich all, requires CRON_SECRET if set)
	http.HandleFunc("/enrich-now", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !validateCronSecret(r) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		force := r.URL.Query().Get("force") == "1"
		sched.RunEnrichmentJob(force)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// REST API
	http.HandleFunc("/deals", handlers.DealsHandler)
	http.HandleFunc("/deals/", handlers.DealsHandler)
	http.HandleFunc("/stores", handlers.GetStores)
	http.HandleFunc("/brands", handlers.GetBrands)
	http.HandleFunc("/categories", handlers.GetCategories)
	http.HandleFunc("/status", handlers.GetStatus)

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

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
