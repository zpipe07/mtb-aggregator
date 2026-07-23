package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/mtb-aggregator/api/internal/enrichstate"
)

// GetAdminEnrichmentStepMetrics returns per-step backlog, success rates, and confidence distribution.
func (h *Handlers) GetAdminEnrichmentStepMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	days := 7
	if s := r.URL.Query().Get("days"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			days = n
		}
	}
	metrics, err := h.DB.GetEnrichmentStepMetrics(r.Context(), days)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(metrics)
}

// PostAdminListingEnrichmentRetry clears step state so the listing is picked up on the next enrich run.
// Query: step=pdp|classify|extract (required). Idempotent when step is already pending.
func (h *Handlers) PostAdminListingEnrichmentRetry(w http.ResponseWriter, r *http.Request, listingID int) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	stepRaw := r.URL.Query().Get("step")
	step, ok := enrichstate.ParseStep(stepRaw)
	if !ok {
		http.Error(w, "invalid or missing step query (pdp, classify, extract)", http.StatusBadRequest)
		return
	}
	exists, err := h.DB.ListingExists(r.Context(), listingID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !exists {
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}
	if err := h.DB.ResetListingEnrichmentStep(r.Context(), listingID, step); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":         true,
		"listing_id": listingID,
		"step":       string(step),
	})
}
