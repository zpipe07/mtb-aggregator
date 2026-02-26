package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/scraper"
)

type Handlers struct {
	DB          *db.DB
	ScraperURL  string
	Scraper     *scraper.Client
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
	if s := r.URL.Query().Get("brand"); s != "" {
		params.Brand = s
	}
	if s := r.URL.Query().Get("category"); s != "" {
		params.Category = s
	}
	if s := r.URL.Query().Get("canonical_category"); s != "" {
		params.CanonicalCategory = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("min_discount"); s != "" {
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			params.MinDiscount = &f
		}
	}
	if s := r.URL.Query().Get("q"); s != "" {
		params.Search = s
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
	if s := r.URL.Query().Get("wheel_size"); s != "" {
		params.WheelSize = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("model_year"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 2010 && n <= 2030 {
			params.ModelYear = n
		}
	}
	if s := r.URL.Query().Get("groupset"); s != "" {
		params.Groupset = strings.TrimSpace(s)
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
		"stores":             storeStatuses,
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
		"stats":              stats,
		"stores":             stores,
		"scraper_reachable":  scraperReachable,
		"enrichment_pct":     enrichmentPct,
	})
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

// GetAdminListings returns paginated listings for the admin data browser. Query: store_id, brand, has_canonical_category, has_enrichment, category, canonical_category, q, sort, limit, offset.
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
	if s := r.URL.Query().Get("category"); s != "" {
		params.Category = strings.TrimSpace(s)
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
	productURL, storeType, err := h.DB.GetListingEnrichmentInfo(r.Context(), id)
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
	result, err := h.Scraper.Enrich(productURL, storeType)
	if err != nil {
		log.Printf("[admin] enrich listing %d: %v", id, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{
			"error": err.Error(),
		})
		return
	}
	if err := h.DB.UpdateListingEnrichment(r.Context(), id, result.CategoryPath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":            true,
		"category_path": result.CategoryPath,
	})
}
