package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mtb-aggregator/api/internal/db"
)

func TestPostAdminListingEnrichmentRetry_invalidStep(t *testing.T) {
	t.Parallel()
	h := &Handlers{DB: &db.DB{}}
	req := httptest.NewRequest(http.MethodPost, "/admin/listings/1/enrichment/retry?step=invalid", nil)
	rec := httptest.NewRecorder()
	h.PostAdminListingEnrichmentRetry(rec, req, 1)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d want 400", rec.Code)
	}
}

func TestPostAdminListingEnrichmentRetry_missingStep(t *testing.T) {
	t.Parallel()
	h := &Handlers{DB: &db.DB{}}
	req := httptest.NewRequest(http.MethodPost, "/admin/listings/1/enrichment/retry", nil)
	rec := httptest.NewRecorder()
	h.PostAdminListingEnrichmentRetry(rec, req, 1)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d want 400", rec.Code)
	}
}
