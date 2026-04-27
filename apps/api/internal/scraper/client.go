package scraper

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// ScrapeResult matches the scraper's JSON response
type ScrapeResult struct {
	StoreSKU         string          `json:"store_sku"`
	ProductName      string          `json:"product_name"`
	CurrentPrice     float64         `json:"current_price"`
	OriginalPrice    *float64        `json:"original_price"`
	ProductURL       string          `json:"product_url"`
	ImageURL         *string         `json:"image_url"`
	Brand            *string         `json:"brand"`
	CategoryPath     []string        `json:"category_path"`
	IsInStock        bool            `json:"is_in_stock"`
	ProductGroupKey  *string         `json:"product_group_key"` // Shopify handle; API stores as store_id:handle
	VariantOptions   json.RawMessage `json:"variant_options"`
}

// ScrapeRequest is sent to the scraper
type ScrapeRequest struct {
	URL   string `json:"url"`
	Store string `json:"store"`
}

// EnrichVariant is one PDP variant row (JensonUSA enricher).
type EnrichVariant struct {
	Code        string            `json:"code"`
	Dimensions  map[string]string `json:"dimensions"`
	IsOrderable bool              `json:"is_orderable"`
}

// EnrichResult from POST /enrich
type EnrichResult struct {
	CategoryPath []string          `json:"category_path"`
	RawSpecs     map[string]string `json:"raw_specs"`
	Unavailable  bool              `json:"unavailable"`
	Description  *string           `json:"description,omitempty"`
	Variants     []EnrichVariant   `json:"variants,omitempty"`
}

type Client struct {
	baseURL    string
	secret     string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		secret:  strings.TrimSpace(os.Getenv("SCRAPER_SERVICE_SECRET")),
		httpClient: &http.Client{
			// Scrape can take 10+ min for multi-page clearance (9 pages × ~60s load + delays)
			Timeout: 15 * time.Minute,
		},
	}
}

func (c *Client) setServiceAuth(req *http.Request) {
	if c.secret != "" {
		req.Header.Set("X-Scraper-Secret", c.secret)
	}
}

func (c *Client) Scrape(ctx context.Context, url, store string) ([]ScrapeResult, error) {
	reqBody := ScrapeRequest{URL: url, Store: store}
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/scrape", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	c.setServiceAuth(req)

	resp, err := c.httpClient.Do(req)
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

func (c *Client) Enrich(ctx context.Context, productURL, store string) (*EnrichResult, error) {
	reqBody := map[string]string{"url": productURL, "store": store}
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/enrich", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	c.setServiceAuth(req)

	resp, err := c.httpClient.Do(req)
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
