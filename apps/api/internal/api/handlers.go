package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/mtb-aggregator/api/internal/brand"
	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/llm"
	"github.com/mtb-aggregator/api/internal/llmlisting"
	"github.com/mtb-aggregator/api/internal/normalization"
	"github.com/mtb-aggregator/api/internal/scraper"
	"github.com/mtb-aggregator/api/internal/sentryutil"
	"github.com/mtb-aggregator/api/internal/taxonomy"
)

type Handlers struct {
	DB         *db.DB
	ScraperURL string
	Scraper    *scraper.Client
	LLM        *llm.Client
}

// parseNonEmptyQueryMulti returns trimmed, non-empty, de-duplicated values from repeated query params (order preserved).
func parseNonEmptyQueryMulti(vals []string) []string {
	if len(vals) == 0 {
		return nil
	}
	seen := make(map[string]struct{})
	var out []string
	for _, v := range vals {
		t := strings.TrimSpace(v)
		if t == "" {
			continue
		}
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	return out
}

func (h *Handlers) GetDeals(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	params := db.GetDealsParams{Limit: 50}
	if s := r.URL.Query().Get("store"); s != "" {
		params.StoreName = s
	}
	if b := parseNonEmptyQueryMulti(r.URL.Query()["brand"]); len(b) > 0 {
		params.Brands = b
	}
	if s := r.URL.Query().Get("category"); s != "" {
		params.Category = s
	}
	if s := r.URL.Query().Get("category_slug"); s != "" {
		params.CategorySlug = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("canonical_category"); s != "" {
		params.CanonicalCategory = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("min_discount"); s != "" {
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			params.MinDiscount = &f
		}
	}
	if s := r.URL.Query().Get("min_price"); s != "" {
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			params.MinPrice = &f
		}
	}
	if s := r.URL.Query().Get("max_price"); s != "" {
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			params.MaxPrice = &f
		}
	}
	if s := r.URL.Query().Get("exclude_category_slug"); s != "" {
		params.ExcludeCategorySlug = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("q"); s != "" {
		params.Search = s
	}
	if s := r.URL.Query().Get("sort"); s != "" {
		params.Sort = s
	}
	if s := r.URL.Query().Get("price_dropped"); s == "1" || s == "true" {
		v := true
		params.PriceDropped = &v
	}
	if s := r.URL.Query().Get("price_drop_within_days"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			params.PriceDropWithinDays = n
		}
	}
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			params.Limit = n
		}
	}
	if s := r.URL.Query().Get("offset"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 0 {
			params.Offset = n
		}
	}
	// Parse spec filters: repeated spec_<key>=<value> (OR within key, AND across keys).
	params.SpecFilters = make(map[string][]string)
	for key, vals := range r.URL.Query() {
		if !strings.HasPrefix(key, "spec_") {
			continue
		}
		specKey := strings.TrimSpace(strings.TrimPrefix(key, "spec_"))
		if specKey == "" {
			continue
		}
		for _, v := range vals {
			if t := strings.TrimSpace(v); t != "" {
				params.SpecFilters[specKey] = append(params.SpecFilters[specKey], t)
			}
		}
	}
	for k, sl := range params.SpecFilters {
		deduped := parseNonEmptyQueryMulti(sl)
		if len(deduped) == 0 {
			delete(params.SpecFilters, k)
		} else {
			params.SpecFilters[k] = deduped
		}
	}
	if r.URL.Query().Get("group_variants") == "1" || r.URL.Query().Get("group_variants") == "true" {
		params.GroupVariants = true
	}
	if r.URL.Query().Get("exclude_home_demoted") == "1" || r.URL.Query().Get("exclude_home_demoted") == "true" {
		params.ExcludeHomeDemoted = true
	}

	result, err := h.DB.GetDeals(r.Context(), params)
	if err != nil {
		log.Printf("[api] GetDeals error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	deals := result.Deals
	// Use affiliate_url if set, else product_url for "View Deal" link
	for i := range deals {
		if deals[i].AffiliateURL == nil || *deals[i].AffiliateURL == "" {
			deals[i].AffiliateURL = &deals[i].ProductURL
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"deals":       deals,
		"total_count": result.TotalCount,
	})
}

func (h *Handlers) GetDealByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idStr := r.URL.Path[len("/deals/"):]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	deal, err := h.DB.GetDealByID(r.Context(), id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	if deal.AffiliateURL == nil || *deal.AffiliateURL == "" {
		deal.AffiliateURL = &deal.ProductURL
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(deal)
}

func (h *Handlers) GetPriceHistory(w http.ResponseWriter, r *http.Request, dealID int) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	result, err := h.DB.GetPriceHistory(r.Context(), dealID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if result == nil {
		result = &db.PriceHistoryResult{Points: []db.PriceHistoryPoint{}}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *Handlers) GetStores(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	stores, err := h.DB.GetStoresWithCounts(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if stores == nil {
		stores = []db.StoreWithCount{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stores)
}

func (h *Handlers) GetSitemapListings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limit := db.MaxSitemapListings
	if s := strings.TrimSpace(r.URL.Query().Get("limit")); s != "" {
		if n, err := strconv.Atoi(s); err == nil {
			limit = n
		}
	}

	listings, err := h.DB.ListSitemapListings(r.Context(), limit)
	if err != nil {
		log.Printf("[api] GetSitemapListings error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if listings == nil {
		listings = []db.SitemapListing{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"listings": listings,
	})
}

func (h *Handlers) GetBrands(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	brands, err := h.DB.GetBrands(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if brands == nil {
		brands = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(brands)
}

func (h *Handlers) GetCategories(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	categories, err := h.DB.GetCategories(r.Context())
	if err != nil {
		log.Printf("[api] GetCategories error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if categories == nil {
		categories = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(categories)
}

func (h *Handlers) GetCanonicalCategories(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Deprecated: use GET /categories/tree for structured category data. Kept for backward compat.
	w.Header().Set("Deprecation", "true")
	w.Header().Set("Link", "</categories/tree>; rel=\"successor\"")

	list, err := h.DB.GetCanonicalCategories(r.Context())
	if err != nil {
		log.Printf("[api] GetCanonicalCategories error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

// GetSpecValues returns distinct metadata values for a given spec key, e.g. ?key=material.
// GetFacets returns spec facets, brand facets, and price range for the current filter context.
func (h *Handlers) GetFacets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	params := db.GetFacetsParams{}
	if s := r.URL.Query().Get("store"); s != "" {
		params.StoreName = strings.TrimSpace(s)
	}
	if b := parseNonEmptyQueryMulti(r.URL.Query()["brand"]); len(b) > 0 {
		params.Brands = b
	}
	if s := r.URL.Query().Get("category"); s != "" {
		params.Category = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("canonical_category"); s != "" {
		params.CanonicalCategory = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("category_slug"); s != "" {
		params.CategorySlug = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("min_discount"); s != "" {
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			params.MinDiscount = &f
		}
	}
	if s := r.URL.Query().Get("min_price"); s != "" {
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			params.MinPrice = &f
		}
	}
	if s := r.URL.Query().Get("max_price"); s != "" {
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			params.MaxPrice = &f
		}
	}
	if s := r.URL.Query().Get("q"); s != "" {
		params.Search = strings.TrimSpace(s)
	}
	params.SpecFilters = make(map[string][]string)
	for key, vals := range r.URL.Query() {
		if !strings.HasPrefix(key, "spec_") {
			continue
		}
		specKey := strings.TrimSpace(strings.TrimPrefix(key, "spec_"))
		if specKey == "" {
			continue
		}
		for _, v := range vals {
			if t := strings.TrimSpace(v); t != "" {
				params.SpecFilters[specKey] = append(params.SpecFilters[specKey], t)
			}
		}
	}
	for k, sl := range params.SpecFilters {
		deduped := parseNonEmptyQueryMulti(sl)
		if len(deduped) == 0 {
			delete(params.SpecFilters, k)
		} else {
			params.SpecFilters[k] = deduped
		}
	}
	result, err := h.DB.GetFacets(r.Context(), params)
	if err != nil {
		log.Printf("[api] GetFacets error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if result == nil {
		result = &db.GetFacetsResult{}
	}
	if result.SpecFacets == nil {
		result.SpecFacets = []db.SpecFacet{}
	}
	if result.BrandFacets == nil {
		result.BrandFacets = []db.BrandFacet{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *Handlers) GetSpecValues(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	key := strings.TrimSpace(r.URL.Query().Get("key"))
	if key == "" {
		http.Error(w, "key required", http.StatusBadRequest)
		return
	}

	values, err := h.DB.GetDistinctMetadataValues(r.Context(), key, 200)
	if err != nil {
		log.Printf("[api] GetSpecValues error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if values == nil {
		values = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(values)
}

func (h *Handlers) GetStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	stores, err := h.DB.GetStoresWithCounts(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	scraperReachable := false
	if resp, err := http.Get(h.ScraperURL + "/health"); err == nil {
		resp.Body.Close()
		scraperReachable = resp.StatusCode == 200
	}

	type storeStatus struct {
		Name        string `json:"name"`
		DealCount   int    `json:"deal_count"`
		LastScraped string `json:"last_scraped"`
		Success     bool   `json:"success"`
	}
	var storeStatuses []storeStatus
	for _, s := range stores {
		storeStatuses = append(storeStatuses, storeStatus{
			Name:        s.Name,
			DealCount:   s.DealCount,
			LastScraped: s.LastScraped,
			Success:     s.LastScraped != "",
		})
	}
	if storeStatuses == nil {
		storeStatuses = []storeStatus{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"stores":            storeStatuses,
		"scraper_reachable": scraperReachable,
	})
}

// GetAdminDashboard returns aggregate stats, store health, and scraper reachability for the admin dashboard.
func (h *Handlers) GetAdminDashboard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	stats, err := h.DB.GetDashboardStats(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	stores, err := h.DB.GetStoresWithCountsAndHealth(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	scraperReachable := false
	if resp, err := http.Get(h.ScraperURL + "/health"); err == nil {
		resp.Body.Close()
		scraperReachable = resp.StatusCode == 200
	}

	enrichmentPct := 0.0
	if stats.TotalListings > 0 {
		enrichmentPct = 100 * float64(stats.EnrichedListings) / float64(stats.TotalListings)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"stats":                      stats,
		"stores":                     stores,
		"scraper_reachable":          scraperReachable,
		"enrichment_pct":             enrichmentPct,
		"store_types_with_enrichers": db.StoreTypesWithEnrichers,
	})
}

// GetAdminPipelineMetrics returns flow-centric pipeline health for admin insights.
// Query: days (default 30, max 90) — window for latency, event throughput, and scrape job charts.
func (h *Handlers) GetAdminPipelineMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	days := 30
	if s := r.URL.Query().Get("days"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			days = n
		}
	}

	metrics, err := h.DB.GetPipelineMetrics(r.Context(), days)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

// GetStoreTypesWithEnrichers returns store_type values that support PDP enrichment (for showing Enrich button in UI).
func (h *Handlers) GetStoreTypesWithEnrichers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(db.StoreTypesWithEnrichers)
}

// GetAdminStores returns all stores with full detail (admin).
func (h *Handlers) GetAdminStores(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	stores, err := h.DB.GetStores(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Include deal count for UI
	withCounts, _ := h.DB.GetStoresWithCountsAndHealth(r.Context())
	countByID := make(map[int]int)
	for _, s := range withCounts {
		countByID[s.ID] = s.DealCount
	}
	type storeRow struct {
		ID                    int     `json:"id"`
		Name                  string  `json:"name"`
		BaseURL               string  `json:"base_url"`
		ScrapeURL             string  `json:"scrape_url"`
		StoreType             string  `json:"store_type"`
		AffiliateNetwork      *string `json:"affiliate_network,omitempty"`
		LastScrapeResultCount *int    `json:"last_scrape_result_count,omitempty"`
		DealCount             int     `json:"deal_count"`
	}
	var out []storeRow
	for _, s := range stores {
		out = append(out, storeRow{
			ID:                    s.ID,
			Name:                  s.Name,
			BaseURL:               s.BaseURL,
			ScrapeURL:             s.ScrapeURL,
			StoreType:             s.StoreType,
			AffiliateNetwork:      s.AffiliateNetwork,
			LastScrapeResultCount: s.LastScrapeResultCount,
			DealCount:             countByID[s.ID],
		})
	}
	if out == nil {
		out = []storeRow{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

// PostAdminStore creates a store (admin). Body: name, base_url, scrape_url, store_type, affiliate_network.
func (h *Handlers) PostAdminStore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Name             string  `json:"name"`
		BaseURL          string  `json:"base_url"`
		ScrapeURL        string  `json:"scrape_url"`
		StoreType        string  `json:"store_type"`
		AffiliateNetwork *string `json:"affiliate_network"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(body.Name)
	baseURL := strings.TrimSpace(body.BaseURL)
	scrapeURL := strings.TrimSpace(body.ScrapeURL)
	storeType := strings.TrimSpace(body.StoreType)
	if storeType == "" {
		storeType = "jensonusa"
	}
	if name == "" || baseURL == "" || scrapeURL == "" {
		http.Error(w, "name, base_url, scrape_url required", http.StatusBadRequest)
		return
	}
	if !isAllowedStoreType(storeType) {
		http.Error(w, "invalid store_type", http.StatusBadRequest)
		return
	}
	s := db.Store{Name: name, BaseURL: baseURL, ScrapeURL: scrapeURL, StoreType: storeType, AffiliateNetwork: body.AffiliateNetwork}
	id, err := h.DB.CreateStore(r.Context(), s)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "store name already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id})
}

func isAllowedStoreType(t string) bool {
	for _, allowed := range AllowedStoreTypes {
		if strings.EqualFold(t, allowed) {
			return true
		}
	}
	return false
}

// GetAdminStoreByID returns one store by id (admin).
func (h *Handlers) GetAdminStoreByID(w http.ResponseWriter, r *http.Request, id int) {
	store, err := h.DB.GetStoreByID(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if store == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(store)
}

// PutAdminStore updates a store (admin). Body: name, base_url, scrape_url, store_type, affiliate_network.
func (h *Handlers) PutAdminStore(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Name             string  `json:"name"`
		BaseURL          string  `json:"base_url"`
		ScrapeURL        string  `json:"scrape_url"`
		StoreType        string  `json:"store_type"`
		AffiliateNetwork *string `json:"affiliate_network"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(body.Name)
	baseURL := strings.TrimSpace(body.BaseURL)
	scrapeURL := strings.TrimSpace(body.ScrapeURL)
	storeType := strings.TrimSpace(body.StoreType)
	if name == "" || baseURL == "" || scrapeURL == "" {
		http.Error(w, "name, base_url, scrape_url required", http.StatusBadRequest)
		return
	}
	if storeType != "" && !isAllowedStoreType(storeType) {
		http.Error(w, "invalid store_type", http.StatusBadRequest)
		return
	}
	if storeType == "" {
		storeType = "jensonusa"
	}
	err := h.DB.UpdateStore(r.Context(), id, name, baseURL, scrapeURL, storeType, body.AffiliateNetwork)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "store name already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}

// DeleteAdminStore deletes a store (admin).
func (h *Handlers) DeleteAdminStore(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	err := h.DB.DeleteStore(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetAdminJobs returns recent scrape jobs. Query: limit (default 50), offset (default 0), store_id (optional).
func (h *Handlers) GetAdminJobs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	limit := 50
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	offset := 0
	if s := r.URL.Query().Get("offset"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 0 {
			offset = n
		}
	}
	storeID := 0
	if s := r.URL.Query().Get("store_id"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			storeID = n
		}
	}
	jobs, err := h.DB.GetScrapeJobs(r.Context(), storeID, limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if jobs == nil {
		jobs = []db.ScrapeJob{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(jobs)
}

// GetAdminJobByID returns one scrape job by id (admin).
func (h *Handlers) GetAdminJobByID(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	job, err := h.DB.GetScrapeJobByID(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if job == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

// PostAdminCancelScrapeJob sets status=cancelled for a running scrape job (admin).
func (h *Handlers) PostAdminCancelScrapeJob(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ok, err := h.DB.CancelScrapeJob(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if ok {
		json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "status": "cancelled"})
	} else {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": "job not running or not found"})
	}
}

// GetAdminEnrichJobs returns recent enrich jobs. Query: limit (default 50), offset (default 0).
func (h *Handlers) GetAdminEnrichJobs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	limit := 50
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	offset := 0
	if s := r.URL.Query().Get("offset"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 0 {
			offset = n
		}
	}
	jobs, err := h.DB.GetEnrichJobs(r.Context(), limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if jobs == nil {
		jobs = []db.EnrichJob{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(jobs)
}

// GetAdminEnrichJobByID returns one enrich job by id (admin).
func (h *Handlers) GetAdminEnrichJobByID(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	job, err := h.DB.GetEnrichJobByID(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if job == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

// PostAdminCancelEnrichJob sets status=cancelled for a running enrich job (admin).
func (h *Handlers) PostAdminCancelEnrichJob(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ok, err := h.DB.CancelEnrichJob(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if ok {
		json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "status": "cancelled"})
	} else {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": "job not running or not found"})
	}
}

// GetAdminListings returns paginated listings for the admin data browser. Query: store_id, brand, has_canonical_category, has_enrichment, category (substring on any retailer or canonical segment), category_slug (subtree on category_id; same as GET /deals), canonical_category (exact path; ignored when category_slug is set), q, sort (newest, discount, price_asc, price_desc, relevance, last_enriched), limit, offset, llm_confidence_below.
func (h *Handlers) GetAdminListings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	params := db.GetAdminListingsParams{Limit: 50, Offset: 0}
	if s := r.URL.Query().Get("store_id"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			params.StoreID = n
		}
	}
	if s := r.URL.Query().Get("brand"); s != "" {
		params.Brand = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("has_canonical_category"); s != "" {
		params.HasCanonicalCategory = boolPtr(s == "1" || strings.EqualFold(s, "true"))
	}
	if s := r.URL.Query().Get("has_enrichment"); s != "" {
		params.HasEnrichment = boolPtr(s == "1" || strings.EqualFold(s, "true"))
	}
	if s := r.URL.Query().Get("in_stock"); s != "" {
		params.InStock = boolPtr(s == "1" || strings.EqualFold(s, "true"))
	}
	if s := r.URL.Query().Get("hidden"); s != "" {
		params.Hidden = boolPtr(s == "1" || strings.EqualFold(s, "true"))
	}
	if s := r.URL.Query().Get("home_demoted"); s != "" {
		params.HomeDemoted = boolPtr(s == "1" || strings.EqualFold(s, "true"))
	}
	if s := r.URL.Query().Get("category"); s != "" {
		params.Category = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("category_slug"); s != "" {
		params.CategorySlug = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("canonical_category"); s != "" {
		params.CanonicalCategory = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("q"); s != "" {
		params.Search = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("sort"); s != "" {
		params.Sort = s
	}
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			params.Limit = n
		}
	}
	if s := r.URL.Query().Get("offset"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 0 {
			params.Offset = n
		}
	}
	if s := r.URL.Query().Get("llm_confidence_below"); s != "" {
		if f, err := strconv.ParseFloat(s, 64); err == nil && f >= 0 && f <= 1 {
			params.LLMConfidenceBelow = &f
		}
	}
	listings, totalCount, err := h.DB.GetAdminListings(r.Context(), params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if listings == nil {
		listings = []db.AdminListing{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"listings":    listings,
		"total_count": totalCount,
	})
}

func boolPtr(b bool) *bool { return &b }

// PatchAdminListingHidden sets listing visibility flags (admin). Body: {"hidden": true|false} and/or {"home_demoted": true|false}.
func (h *Handlers) PatchAdminListingHidden(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Hidden      *bool `json:"hidden"`
		HomeDemoted *bool `json:"home_demoted"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.Hidden == nil && body.HomeDemoted == nil {
		http.Error(w, "hidden or home_demoted field required", http.StatusBadRequest)
		return
	}
	if body.Hidden != nil {
		err := h.DB.SetListingHidden(r.Context(), id, *body.Hidden)
		if err != nil {
			if strings.Contains(err.Error(), "not found") {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if body.HomeDemoted != nil {
		err := h.DB.SetListingHomeDemoted(r.Context(), id, *body.HomeDemoted)
		if err != nil {
			if strings.Contains(err.Error(), "not found") {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// PatchAdminListingCategory sets canonical category from admin picker. Body: {"category_id": 5}.
func (h *Handlers) PatchAdminListingCategory(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		CategoryID *int `json:"category_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.CategoryID == nil || *body.CategoryID <= 0 {
		http.Error(w, "category_id required", http.StatusBadRequest)
		return
	}
	cat, err := h.DB.GetCategoryByID(r.Context(), *body.CategoryID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if cat == nil {
		http.Error(w, "category not found", http.StatusNotFound)
		return
	}
	siblingsUpdated, err := h.DB.UpdateListingCategoryManual(r.Context(), id, *body.CategoryID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	resp := map[string]interface{}{
		"ok":               true,
		"siblings_updated": siblingsUpdated,
	}
	listing, err := h.DB.GetAdminListingByID(r.Context(), id)
	if err == nil && listing != nil && len(listing.CategoryPath) > 0 {
		path, _ := h.DB.GetCategoryPathNamesRootToLeaf(r.Context(), *body.CategoryID)
		mapped := taxonomy.Map(listing.CategoryPath)
		if mapped == nil || !canonicalPathsEqual(mapped, path) {
			kw := strings.ToLower(strings.TrimSpace(strings.Join(listing.CategoryPath, " ")))
			if kw != "" {
				breadcrumb := strings.Join(listing.CategoryPath, " > ")
				target := strings.Join(path, " > ")
				resp["suggested_mapping"] = map[string]interface{}{
					"raw_keywords": []string{kw},
					"canonical":    path,
					"reason": fmt.Sprintf(
						"Store breadcrumb %q doesn't map to the selected category (%s)",
						breadcrumb, target,
					),
				}
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func canonicalPathsEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// PostAdminListingLLMOverrides sets manual overrides for LLM-derived specs (admin). Body: {"mtb_class": "Trail", ...}.
func (h *Handlers) PostAdminListingLLMOverrides(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if len(body) == 0 {
		http.Error(w, "llm_overrides object required", http.StatusBadRequest)
		return
	}
	if err := h.DB.UpdateListingLLMOverrides(r.Context(), id, body); err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// GetAdminListingByID returns one listing by id for admin detail (admin).
func (h *Handlers) GetAdminListingByID(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	listing, err := h.DB.GetAdminListingByID(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if listing == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(listing)
}

// PostAdminEnrichListing runs enrichment for a single listing (admin). Useful for testing enricher logic without running the full batch.
func (h *Handlers) PostAdminEnrichListing(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.Scraper == nil {
		http.Error(w, "scraper not configured", http.StatusServiceUnavailable)
		return
	}
	storeID, productURL, storeType, storeSKU, err := h.DB.GetListingEnrichmentInfo(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if productURL == "" {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	hasEnricher := false
	for _, t := range db.StoreTypesWithEnrichers {
		if strings.EqualFold(t, storeType) {
			hasEnricher = true
			break
		}
	}
	if !hasEnricher {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "no enricher for store type " + storeType,
		})
		return
	}
	result, err := h.Scraper.Enrich(r.Context(), productURL, storeType)
	if err != nil {
		log.Printf("[admin] enrich listing %d: %v", id, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{
			"error": err.Error(),
		})
		return
	}
	if err := h.DB.UpdateListingEnrichment(r.Context(), id, result.CategoryPath, result.RawSpecs, result.Unavailable, result.Description); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := applyJensonPDPAfterEnrich(r.Context(), h.DB, storeID, storeType, storeSKU, result.Variants, nil); err != nil {
		log.Printf("[admin] jenson variant fan-out listing %d: %v", id, err)
	}
	if err := applyCompetitiveCyclistPDPAfterEnrich(r.Context(), h.DB, id, storeID, storeType, storeSKU, productURL, result.Variants, nil); err != nil {
		log.Printf("[admin] competitivecyclist variant fan-out listing %d: %v", id, err)
	}
	if err := applyUniversalCyclesPDPAfterEnrich(r.Context(), h.DB, id, storeType, result.Variants, nil); err != nil {
		log.Printf("[admin] universalcycles variant fan-out listing %d: %v", id, err)
	}
	if err := applyFoxRacingPDPAfterEnrich(r.Context(), h.DB, storeID, storeType, storeSKU, result.Variants, nil); err != nil {
		log.Printf("[admin] foxracing variant fan-out listing %d: %v", id, err)
	}
	if err := applyBellPDPAfterEnrich(r.Context(), h.DB, storeID, storeType, productURL, result.Variants, nil); err != nil {
		log.Printf("[admin] bell variant fan-out listing %d: %v", id, err)
	}
	if err := applyGiroPDPAfterEnrich(r.Context(), h.DB, storeID, storeType, productURL, result.Variants, nil); err != nil {
		log.Printf("[admin] giro variant fan-out listing %d: %v", id, err)
	}
	var llmWarnings []string
	if w := h.runLLMCategoryClassification(r.Context(), id); w != "" {
		llmWarnings = append(llmWarnings, w)
	}
	if w := h.runLLMExtractionIfApplicable(r.Context(), id); w != "" {
		llmWarnings = append(llmWarnings, w)
	}
	resp := map[string]interface{}{
		"ok":            true,
		"category_path": result.CategoryPath,
		"unavailable":   result.Unavailable,
	}
	if len(llmWarnings) > 0 {
		resp["llm_warnings"] = llmWarnings
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// PostAdminListingLLMSpecs runs LLM category classification (when enabled) and prompt-profile extraction
// from data already stored on the listing (no PDP scrape). Query allow_empty_specs=1 skips requiring non-empty metadata.specs.
func (h *Handlers) PostAdminListingLLMSpecs(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.LLM == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "OpenAI client not configured"})
		return
	}
	ctx := r.Context()
	listing, err := h.DB.GetListingForLLM(ctx, id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if listing == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if r.URL.Query().Get("allow_empty_specs") != "1" && !llmlisting.MetadataHasNonEmptySpecs(listing.Metadata) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "listing has empty metadata.specs; enrich PDP first or pass allow_empty_specs=1",
		})
		return
	}
	var llmWarnings []string
	if w := h.runLLMCategoryClassification(ctx, id); w != "" {
		llmWarnings = append(llmWarnings, w)
	}
	if w := h.runLLMExtractionIfApplicable(ctx, id); w != "" {
		llmWarnings = append(llmWarnings, w)
	}
	resp := map[string]interface{}{"ok": true}
	if len(llmWarnings) > 0 {
		resp["llm_warnings"] = llmWarnings
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// runLLMCategoryClassification runs LLM category classification to refine canonical_category.
// Returns a non-empty warning string on LLM failure (logged and reported to Sentry).
func (h *Handlers) runLLMCategoryClassification(ctx context.Context, listingID int) string {
	err := llmlisting.ClassificationStep(ctx, h.DB, h.LLM, listingID)
	if err == nil {
		return ""
	}
	llmlisting.HandleLLMStepError(err, nil, nil, listingID, "classify", "api", "admin_enrich")
	return fmt.Sprintf("LLM classify failed: %v", err)
}

// runLLMExtractionIfApplicable runs LLM spec extraction for a listing if a matching profile exists.
// Non-fatal: logs errors but does not fail the enrichment. Used by PostAdminEnrichListing.
// Returns a non-empty warning string on LLM failure.
func (h *Handlers) runLLMExtractionIfApplicable(ctx context.Context, listingID int) string {
	err := llmlisting.SpecExtractionStep(ctx, h.DB, h.LLM, listingID)
	if err == nil {
		return ""
	}
	llmlisting.HandleLLMStepError(err, nil, nil, listingID, "extract", "api", "admin_enrich")
	return fmt.Sprintf("LLM extract failed: %v", err)
}

// reloadTaxonomyFromDB loads category_mappings from DB into the taxonomy in-memory cache.
func (h *Handlers) reloadTaxonomyFromDB(ctx context.Context) error {
	list, err := h.DB.ListCategoryMappings(ctx)
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

// reloadNormalizationFromDB loads spec_key_aliases and spec_normalization_rules into the normalization engine.
func (h *Handlers) reloadNormalizationFromDB(ctx context.Context) error {
	aliases, err := h.DB.ListSpecKeyAliases(ctx)
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
	rules, err := h.DB.ListSpecNormalizationRules(ctx)
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

// GetAdminTaxonomy returns all category mappings (admin).
func (h *Handlers) GetAdminTaxonomy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	list, err := h.DB.ListCategoryMappings(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []db.CategoryMapping{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

// PostAdminTaxonomy creates a category mapping (admin). Body: raw_keywords, canonical, priority.
func (h *Handlers) PostAdminTaxonomy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		RawKeywords []string `json:"raw_keywords"`
		Canonical   []string `json:"canonical"`
		Priority    int      `json:"priority"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if len(body.RawKeywords) == 0 || len(body.Canonical) == 0 {
		http.Error(w, "raw_keywords and canonical required (non-empty arrays)", http.StatusBadRequest)
		return
	}
	id, err := h.DB.CreateCategoryMapping(r.Context(), body.RawKeywords, body.Canonical, body.Priority)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := h.reloadTaxonomyFromDB(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id})
}

// GetAdminTaxonomyByID returns one category mapping by id (admin).
func (h *Handlers) GetAdminTaxonomyByID(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	m, err := h.DB.GetCategoryMapping(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if m == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(m)
}

// PutAdminTaxonomy updates a category mapping (admin). Body: raw_keywords, canonical, priority.
func (h *Handlers) PutAdminTaxonomy(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		RawKeywords []string `json:"raw_keywords"`
		Canonical   []string `json:"canonical"`
		Priority    int      `json:"priority"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if len(body.RawKeywords) == 0 || len(body.Canonical) == 0 {
		http.Error(w, "raw_keywords and canonical required (non-empty arrays)", http.StatusBadRequest)
		return
	}
	if err := h.DB.UpdateCategoryMapping(r.Context(), id, body.RawKeywords, body.Canonical, body.Priority); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := h.reloadTaxonomyFromDB(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}

// DeleteAdminTaxonomy deletes a category mapping (admin).
func (h *Handlers) DeleteAdminTaxonomy(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := h.DB.DeleteCategoryMapping(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := h.reloadTaxonomyFromDB(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PutAdminTaxonomyReorder updates priorities for multiple mappings in one transaction (admin). Body: { "updates": [{ "id", "priority" }] }.
func (h *Handlers) PutAdminTaxonomyReorder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Updates []struct {
			ID       int `json:"id"`
			Priority int `json:"priority"`
		} `json:"updates"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if len(body.Updates) == 0 {
		http.Error(w, "updates required (non-empty array)", http.StatusBadRequest)
		return
	}
	updates := make([]struct {
		ID       int
		Priority int
	}, len(body.Updates))
	for i, u := range body.Updates {
		updates[i] = struct {
			ID       int
			Priority int
		}{ID: u.ID, Priority: u.Priority}
	}
	if err := h.DB.BatchUpdateCategoryMappingPriorities(r.Context(), updates); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := h.reloadTaxonomyFromDB(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}

// PostAdminTaxonomyRecategorize runs a full backfill of canonical_category on all listings (admin).
func (h *Handlers) PostAdminTaxonomyRecategorize(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	updated, err := h.DB.BackfillCanonicalCategories(r.Context(), taxonomy.Map)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"updated": updated})
}

// --- Spec filter config (admin) ---

// GetAdminSpecFilterConfigs returns all spec_filter_config rows (admin).
func (h *Handlers) GetAdminSpecFilterConfigs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	list, err := h.DB.ListSpecFilterConfigs(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []db.SpecFilterConfig{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

// PostAdminSpecFilterConfig creates a spec_filter_config row (admin). Body: spec_key, visible, merge_into, display_label, sort_order.
func (h *Handlers) PostAdminSpecFilterConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		SpecKey      string  `json:"spec_key"`
		Visible      bool    `json:"visible"`
		MergeInto    *string `json:"merge_into"`
		DisplayLabel *string `json:"display_label"`
		SortOrder    int     `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.SpecKey == "" {
		http.Error(w, "spec_key required", http.StatusBadRequest)
		return
	}
	id, err := h.DB.CreateSpecFilterConfig(r.Context(), body.SpecKey, body.Visible, body.MergeInto, body.DisplayLabel, body.SortOrder)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id})
}

// GetAdminSpecFilterConfigByID returns one spec_filter_config by id (admin).
func (h *Handlers) GetAdminSpecFilterConfigByID(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	c, err := h.DB.GetSpecFilterConfigByID(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if c == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

// PutAdminSpecFilterConfig updates a spec_filter_config by id (admin).
func (h *Handlers) PutAdminSpecFilterConfig(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		SpecKey      string  `json:"spec_key"`
		Visible      bool    `json:"visible"`
		MergeInto    *string `json:"merge_into"`
		DisplayLabel *string `json:"display_label"`
		SortOrder    int     `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.SpecKey == "" {
		http.Error(w, "spec_key required", http.StatusBadRequest)
		return
	}
	if err := h.DB.UpdateSpecFilterConfig(r.Context(), id, body.SpecKey, body.Visible, body.MergeInto, body.DisplayLabel, body.SortOrder); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}

// DeleteAdminSpecFilterConfig deletes a spec_filter_config by id (admin).
func (h *Handlers) DeleteAdminSpecFilterConfig(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := h.DB.DeleteSpecFilterConfig(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetAdminSpecValueAliases returns spec_value_aliases rows, optionally filtered by ?spec_key= (admin).
func (h *Handlers) GetAdminSpecValueAliases(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	specKey := strings.TrimSpace(r.URL.Query().Get("spec_key"))
	list, err := h.DB.ListSpecValueAliases(r.Context(), specKey)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []db.SpecValueAlias{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

// PostAdminSpecValueAlias creates a spec_value_aliases row (admin). Body: spec_key, raw_value, display_value.
func (h *Handlers) PostAdminSpecValueAlias(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		SpecKey      string `json:"spec_key"`
		RawValue     string `json:"raw_value"`
		DisplayValue string `json:"display_value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.SpecKey == "" || body.RawValue == "" || body.DisplayValue == "" {
		http.Error(w, "spec_key, raw_value, display_value required", http.StatusBadRequest)
		return
	}
	id, err := h.DB.CreateSpecValueAlias(r.Context(), body.SpecKey, body.RawValue, body.DisplayValue)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id})
}

// GetAdminSpecValueAliasByID returns one spec_value_aliases row by id (admin).
func (h *Handlers) GetAdminSpecValueAliasByID(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	a, err := h.DB.GetSpecValueAliasByID(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if a == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(a)
}

// PutAdminSpecValueAlias updates a spec_value_aliases row by id (admin).
func (h *Handlers) PutAdminSpecValueAlias(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		SpecKey      string `json:"spec_key"`
		RawValue     string `json:"raw_value"`
		DisplayValue string `json:"display_value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.SpecKey == "" || body.RawValue == "" || body.DisplayValue == "" {
		http.Error(w, "spec_key, raw_value, display_value required", http.StatusBadRequest)
		return
	}
	if err := h.DB.UpdateSpecValueAlias(r.Context(), id, body.SpecKey, body.RawValue, body.DisplayValue); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}

// DeleteAdminSpecValueAlias deletes a spec_value_aliases row by id (admin).
func (h *Handlers) DeleteAdminSpecValueAlias(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := h.DB.DeleteSpecValueAlias(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetAdminSpecKeys returns discovered spec keys from listings with product counts (admin).
func (h *Handlers) GetAdminSpecKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	keys, err := h.DB.GetDiscoveredSpecKeys(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if keys == nil {
		keys = []db.DiscoveredSpecKey{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(keys)
}

// PostAdminRenormalizeSpecs re-applies key aliases and value rules to all listings' metadata.specs (admin).
func (h *Handlers) PostAdminRenormalizeSpecs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	updated, err := h.DB.RenormalizeSpecs(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"updated": updated})
}

// PostAdminRenormalizeBrands re-applies brand aliases to store_listings.brand (admin).
func (h *Handlers) PostAdminRenormalizeBrands(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	updated, err := h.DB.BackfillBrands(r.Context(), brand.Normalize)
	if err != nil {
		sentryutil.CaptureError(err, map[string]string{"component": "api", "handler": "renormalize_brands"})
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"updated": updated})
}

// --- Normalization (spec key aliases, value rules, unmapped dashboard) ---

// GetAdminUnmappedItems returns uncategorized category paths and counts (admin).
func (h *Handlers) GetAdminUnmappedItems(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	limit := 20
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	paths, err := h.DB.GetUnmappedCategoryPaths(r.Context(), limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	uncategorizedCount, _ := h.DB.GetUncategorizedCount(r.Context())
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"uncategorized_count":     uncategorizedCount,
		"unmapped_category_paths": paths,
	})
}

// GetAdminSpecNormalizationRules returns all spec normalization rules (admin).
func (h *Handlers) GetAdminSpecNormalizationRules(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	list, err := h.DB.ListSpecNormalizationRules(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []db.SpecNormalizationRule{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

// PostAdminSpecNormalizationRule creates a spec normalization rule (admin).
func (h *Handlers) PostAdminSpecNormalizationRule(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		SpecKey  string                 `json:"spec_key"`
		RuleType string                 `json:"rule_type"`
		Config   map[string]interface{} `json:"config"`
		Priority int                    `json:"priority"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.SpecKey == "" || body.RuleType == "" {
		http.Error(w, "spec_key and rule_type required", http.StatusBadRequest)
		return
	}
	validTypes := map[string]bool{"unit_normalize": true, "value_map": true, "regex_replace": true, "case_normalize": true}
	if !validTypes[body.RuleType] {
		http.Error(w, "rule_type must be unit_normalize, value_map, regex_replace, or case_normalize", http.StatusBadRequest)
		return
	}
	if body.Config == nil {
		body.Config = make(map[string]interface{})
	}
	id, err := h.DB.CreateSpecNormalizationRule(r.Context(), body.SpecKey, body.RuleType, body.Config, body.Priority)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := h.reloadNormalizationFromDB(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id})
}

// PutAdminSpecNormalizationRule updates a spec normalization rule (admin).
func (h *Handlers) PutAdminSpecNormalizationRule(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		SpecKey  string                 `json:"spec_key"`
		RuleType string                 `json:"rule_type"`
		Config   map[string]interface{} `json:"config"`
		Priority int                    `json:"priority"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.SpecKey == "" || body.RuleType == "" {
		http.Error(w, "spec_key and rule_type required", http.StatusBadRequest)
		return
	}
	if body.Config == nil {
		body.Config = make(map[string]interface{})
	}
	if err := h.DB.UpdateSpecNormalizationRule(r.Context(), id, body.SpecKey, body.RuleType, body.Config, body.Priority); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := h.reloadNormalizationFromDB(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}

// DeleteAdminSpecNormalizationRule deletes a spec normalization rule (admin).
func (h *Handlers) DeleteAdminSpecNormalizationRule(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := h.DB.DeleteSpecNormalizationRule(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := h.reloadNormalizationFromDB(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetAdminSpecKeyAliases returns all spec key aliases (admin).
func (h *Handlers) GetAdminSpecKeyAliases(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	list, err := h.DB.ListSpecKeyAliases(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []db.SpecKeyAlias{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

// PostAdminSpecKeyAlias creates a spec key alias (admin).
func (h *Handlers) PostAdminSpecKeyAlias(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		RawSubstr    string `json:"raw_substr"`
		CanonicalKey string `json:"canonical_key"`
		Priority     int    `json:"priority"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.RawSubstr == "" || body.CanonicalKey == "" {
		http.Error(w, "raw_substr and canonical_key required", http.StatusBadRequest)
		return
	}
	id, err := h.DB.CreateSpecKeyAlias(r.Context(), body.RawSubstr, body.CanonicalKey, body.Priority)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := h.reloadNormalizationFromDB(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id})
}

// PutAdminSpecKeyAlias updates a spec key alias (admin).
func (h *Handlers) PutAdminSpecKeyAlias(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		RawSubstr    string `json:"raw_substr"`
		CanonicalKey string `json:"canonical_key"`
		Priority     int    `json:"priority"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.RawSubstr == "" || body.CanonicalKey == "" {
		http.Error(w, "raw_substr and canonical_key required", http.StatusBadRequest)
		return
	}
	if err := h.DB.UpdateSpecKeyAlias(r.Context(), id, body.RawSubstr, body.CanonicalKey, body.Priority); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := h.reloadNormalizationFromDB(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}

// DeleteAdminSpecKeyAlias deletes a spec key alias (admin).
func (h *Handlers) DeleteAdminSpecKeyAlias(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := h.DB.DeleteSpecKeyAlias(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := h.reloadNormalizationFromDB(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
