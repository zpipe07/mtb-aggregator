package api

import (
	"net/http"
	"strconv"
	"strings"
)

// DealsHandler routes /deals (list), /deals/:id (single), and /deals/:id/price-history
func (h *Handlers) DealsHandler(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if path == "/deals" || path == "/deals/" {
		h.GetDeals(w, r)
		return
	}
	if strings.HasPrefix(path, "/deals/") {
		rest := strings.TrimPrefix(path, "/deals/")
		if strings.HasSuffix(rest, "/price-history") {
			idStr := strings.TrimSuffix(rest, "/price-history")
			idStr = strings.Trim(idStr, "/")
			if id, err := strconv.Atoi(idStr); err == nil && id > 0 {
				h.GetPriceHistory(w, r, id)
				return
			}
		}
		h.GetDealByID(w, r)
		return
	}
	http.NotFound(w, r)
}
