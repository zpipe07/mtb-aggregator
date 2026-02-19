package api

import (
	"net/http"
	"strings"
)

// DealsHandler routes /deals (list) and /deals/:id (single)
func (h *Handlers) DealsHandler(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if path == "/deals" || path == "/deals/" {
		h.GetDeals(w, r)
		return
	}
	if strings.HasPrefix(path, "/deals/") {
		h.GetDealByID(w, r)
		return
	}
	http.NotFound(w, r)
}
