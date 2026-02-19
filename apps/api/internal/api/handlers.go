package api

import (
	"encoding/json"
	"net/http"
	"strconv"

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
	if s := r.URL.Query().Get("min_discount"); s != "" {
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			params.MinDiscount = &f
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

	deals, err := h.DB.GetDeals(r.Context(), params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Use affiliate_url if set, else product_url for "View Deal" link
	for i := range deals {
		if deals[i].AffiliateURL == nil || *deals[i].AffiliateURL == "" {
			deals[i].AffiliateURL = &deals[i].ProductURL
		}
	}

	// Ensure we always return [] not null when empty
	if deals == nil {
		deals = []db.Deal{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(deals)
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stores)
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"stores":             storeStatuses,
		"scraper_reachable": scraperReachable,
	})
}
