package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/mtb-aggregator/api/internal/api"
	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/scheduler"
)

func main() {
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

	// Cron: every 4 hours (configurable via SCRAPE_CRON_SPEC)
	cronSpec := os.Getenv("SCRAPE_CRON_SPEC")
	if cronSpec == "" {
		cronSpec = "0 */4 * * *"
	}
	sched.Start(cronSpec)

	// Manual trigger for testing: POST /scrape-now
	http.HandleFunc("/scrape-now", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		sched.RunScrapeJob()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// REST API
	http.HandleFunc("/deals", handlers.DealsHandler)
	http.HandleFunc("/deals/", handlers.DealsHandler)
	http.HandleFunc("/stores", handlers.GetStores)
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
		if err := http.ListenAndServe(":"+port, nil); err != nil {
			log.Fatal(err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	sched.Stop()
	log.Println("shutdown complete")
}
