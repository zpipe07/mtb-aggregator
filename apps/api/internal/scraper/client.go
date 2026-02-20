package scraper

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// ScrapeResult matches the scraper's JSON response
type ScrapeResult struct {
	StoreSKU      string   `json:"store_sku"`
	ProductName   string   `json:"product_name"`
	CurrentPrice  float64  `json:"current_price"`
	OriginalPrice *float64 `json:"original_price"`
	ProductURL    string   `json:"product_url"`
	ImageURL      *string  `json:"image_url"`
	Brand         *string   `json:"brand"`
	CategoryPath  []string  `json:"category_path"`
	IsInStock     bool      `json:"is_in_stock"`
}

// ScrapeRequest is sent to the scraper
type ScrapeRequest struct {
	URL   string `json:"url"`
	Store string `json:"store"`
}

// EnrichResult from POST /enrich
type EnrichResult struct {
	CategoryPath []string `json:"category_path"`
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			// Scrape can take 10+ min for multi-page clearance (9 pages × ~60s load + delays)
			Timeout: 15 * time.Minute,
		},
	}
}

func (c *Client) Scrape(url, store string) ([]ScrapeResult, error) {
	reqBody := ScrapeRequest{URL: url, Store: store}
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	resp, err := c.httpClient.Post(c.baseURL+"/scrape", "application/json", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("scrape request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("scraper returned status %d", resp.StatusCode)
	}

	var results []ScrapeResult
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return results, nil
}

func (c *Client) Enrich(productURL, store string) (*EnrichResult, error) {
	reqBody := map[string]string{"url": productURL, "store": store}
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	resp, err := c.httpClient.Post(c.baseURL+"/enrich", "application/json", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("enrich request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("scraper returned status %d", resp.StatusCode)
	}

	var result EnrichResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}
