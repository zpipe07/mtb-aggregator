package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/mtb-aggregator/api/internal/db"
)

type Handlers struct {
	DB      *db.DB
	ScraperURL string
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
