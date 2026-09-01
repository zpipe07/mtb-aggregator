package scraper

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientScrapeReadsTruncatedHeader(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/scrape" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Scrape-Truncated", "1")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]ScrapeResult{
			{StoreSKU: "FK001472 BLK 203MM", ProductName: "Fox 40", CurrentPrice: 1249, ProductURL: "https://www.jensonusa.com/fox-40", IsInStock: true},
		})
	}))
	t.Cleanup(server.Close)

	c := NewClient(server.URL)
	listings, truncated, err := c.Scrape(context.Background(), "https://www.jensonusa.com/sale", "jensonusa")
	if err != nil {
		t.Fatalf("Scrape: %v", err)
	}
	if !truncated {
		t.Fatal("truncated = false, want true from X-Scrape-Truncated")
	}
	if len(listings) != 1 || listings[0].StoreSKU != "FK001472 BLK 203MM" {
		t.Fatalf("listings = %+v", listings)
	}
}

func TestClientScrapeUntruncated(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]ScrapeResult{})
	}))
	t.Cleanup(server.Close)

	c := NewClient(server.URL)
	_, truncated, err := c.Scrape(context.Background(), "https://www.jensonusa.com/sale", "jensonusa")
	if err != nil {
		t.Fatalf("Scrape: %v", err)
	}
	if truncated {
		t.Fatal("truncated = true, want false without header")
	}
}
