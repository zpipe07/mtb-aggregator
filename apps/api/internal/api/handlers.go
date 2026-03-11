package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/normalization"
	"github.com/mtb-aggregator/api/internal/scraper"
	"github.com/mtb-aggregator/api/internal/taxonomy"
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
	// Parse spec filters: spec_<key>=<value> for multiple, or legacy spec_key/spec_value
	params.SpecFilters = make(map[string]string)
	for key, vals := range r.URL.Query() {
		if strings.HasPrefix(key, "spec_") && len(vals) > 0 && vals[0] != "" {
			specKey := strings.TrimPrefix(key, "spec_")
			specKey = strings.TrimSpace(specKey)
			if specKey != "" {
				params.SpecFilters[specKey] = strings.TrimSpace(vals[0])
			}
		}
	}
	// Legacy: if no spec_ params, fall back to spec_key/spec_value
	if len(params.SpecFilters) == 0 {
		if s := r.URL.Query().Get("spec_key"); s != "" {
			params.SpecKey = strings.TrimSpace(s)
		}
		if s := r.URL.Query().Get("spec_value"); s != "" {
			params.SpecValue = strings.TrimSpace(s)
		}
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
	if s := r.URL.Query().Get("brand"); s != "" {
		params.Brand = strings.TrimSpace(s)
	}
	if s := r.URL.Query().Get("category"); s != "" {
		params.Category = strings.TrimSpace(s)
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
		params.Search = strings.TrimSpace(s)
	}
	// Parse spec_<key>=<value> params for multiple spec filters
	params.SpecFilters = make(map[string]string)
	for key, vals := range r.URL.Query() {
		if strings.HasPrefix(key, "spec_") && len(vals) > 0 && vals[0] != "" {
			specKey := strings.TrimPrefix(key, "spec_")
			specKey = strings.TrimSpace(specKey)
			if specKey != "" {
				params.SpecFilters[specKey] = strings.TrimSpace(vals[0])
			}
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
		"stats":                      stats,
		"stores":                    stores,
		"scraper_reachable":         scraperReachable,
		"enrichment_pct":             enrichmentPct,
		"store_types_with_enrichers": db.StoreTypesWithEnrichers,
	})
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
	if s := r.URL.Query().Get("in_stock"); s != "" {
		params.InStock = boolPtr(s == "1" || strings.EqualFold(s, "true"))
	}
	if s := r.URL.Query().Get("hidden"); s != "" {
		params.Hidden = boolPtr(s == "1" || strings.EqualFold(s, "true"))
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

// PatchAdminListingHidden sets the hidden flag for a listing (admin). Body: {"hidden": true|false}.
func (h *Handlers) PatchAdminListingHidden(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Hidden *bool `json:"hidden"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.Hidden == nil {
		http.Error(w, "hidden field required", http.StatusBadRequest)
		return
	}
	err := h.DB.SetListingHidden(r.Context(), id, *body.Hidden)
	if err != nil {
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
	if err := h.DB.UpdateListingEnrichment(r.Context(), id, result.CategoryPath, result.RawSpecs, result.Unavailable); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":            true,
		"category_path": result.CategoryPath,
		"unavailable":   result.Unavailable,
	})
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
		Priority    int     `json:"priority"`
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
		Priority    int     `json:"priority"`
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
	updates := make([]struct{ ID int; Priority int }, len(body.Updates))
	for i, u := range body.Updates {
		updates[i] = struct{ ID int; Priority int }{ID: u.ID, Priority: u.Priority}
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
		"uncategorized_count": uncategorizedCount,
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
