package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/sentryutil"
)

// bulkListingsFilterBody is the JSON body for POST /admin/listings/bulk-classify and bulk-enrich.
// Matches the admin data browser filter fields (GetAdminListings).
type bulkListingsFilterBody struct {
	StoreID              int      `json:"store_id"`
	Brand                string   `json:"brand"`
	HasCanonicalCategory *bool    `json:"has_canonical_category"`
	HasEnrichment        *bool    `json:"has_enrichment"`
	InStock              *bool    `json:"in_stock"`
	Hidden               *bool    `json:"hidden"`
	Category             string   `json:"category"`
	CategorySlug         string   `json:"category_slug"`
	CanonicalCategory    string   `json:"canonical_category"`
	Q                    string   `json:"q"`
	LLMConfidenceBelow   *float64 `json:"llm_confidence_below"`
}

func (b bulkListingsFilterBody) toGetAdminListingsParams() db.GetAdminListingsParams {
	return db.GetAdminListingsParams{
		StoreID:              b.StoreID,
		Brand:                b.Brand,
		HasCanonicalCategory: b.HasCanonicalCategory,
		HasEnrichment:        b.HasEnrichment,
		InStock:              b.InStock,
		Hidden:               b.Hidden,
		Category:             b.Category,
		CategorySlug:         strings.TrimSpace(b.CategorySlug),
		CanonicalCategory:    b.CanonicalCategory,
		Search:               b.Q,
		LLMConfidenceBelow:   b.LLMConfidenceBelow,
		Limit:                0,
		Offset:               0,
	}
}

// bulkListingsWorkTimeout bounds background bulk classify/re-enrich so goroutines do not run forever.
// Env BULK_LISTINGS_WORK_TIMEOUT (Go duration, e.g. 2h, 90m). Default 2h.
// This is decoupled from the HTTP request (which may hit ~30s dev-proxy limits); work uses context.Background.
func bulkListingsWorkTimeout() time.Duration {
	if s := os.Getenv("BULK_LISTINGS_WORK_TIMEOUT"); s != "" {
		if d, err := time.ParseDuration(s); err == nil && d > 0 {
			return d
		}
	}
	return 2 * time.Hour
}

func logBulkEnrichJobFinalize(handler string, jobID int, status string, err error) {
	if err == nil {
		return
	}
	log.Printf("[admin] %s job %d: failed to persist final status %q: %v", handler, jobID, status, err)
	sentryutil.CaptureError(err, map[string]string{
		"component": "api",
		"handler":   handler,
		"phase":     "finalize_job",
		"status":    status,
	})
}

// enrichJobStoreTypePtr returns store_type for enrich_jobs when the admin filter is scoped to one store by id; otherwise nil.
func enrichJobStoreTypePtr(ctx context.Context, dbx *db.DB, storeID int) (*string, error) {
	if storeID <= 0 {
		return nil, nil
	}
	st, err := dbx.GetStoreByID(ctx, storeID)
	if err != nil {
		return nil, err
	}
	if st == nil {
		return nil, nil
	}
	t := st.StoreType
	return &t, nil
}

// PostAdminListingsBulkClassify re-runs LLM category classification for all listings matching the filter.
func (h *Handlers) PostAdminListingsBulkClassify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body bulkListingsFilterBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	params := body.toGetAdminListingsParams()
	maxN := adminBulkMaxListings()
	ids, total, err := h.DB.ListAdminListingIDsByFilter(r.Context(), params, false, false, maxN)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if total > maxN {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error": fmt.Sprintf("filter matches %d listings (max per run is %d); narrow filters", total, maxN),
		})
		return
	}
	if len(ids) == 0 {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "processed": 0, "total": 0, "job_id": 0, "async": false})
		return
	}

	storeTypeForJob, err := enrichJobStoreTypePtr(r.Context(), h.DB, body.StoreID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jobID, err := h.DB.CreateEnrichJob(r.Context(), storeTypeForJob, "manual", false, "classify")
	if err != nil {
		log.Printf("[admin] bulk classify create job: %v", err)
		sentryutil.CaptureError(err, map[string]string{"component": "api", "handler": "bulk_classify", "phase": "create_job"})
		http.Error(w, "could not create job: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if jobID == 0 {
		http.Error(w, "could not create job", http.StatusInternalServerError)
		return
	}
	idsCopy := append([]int(nil), ids...)
	hnd := h
	go runBulkClassifyInBackground(hnd, jobID, idsCopy, total)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":     true,
		"async":  true,
		"job_id": jobID,
		"total":  total,
		"message": "Job started. Processing continues on the server; check Operations for progress.",
	})
}

// PostAdminListingsBulkEnrich runs the full PDP + LLM pipeline for all listings matching the filter.
func (h *Handlers) PostAdminListingsBulkEnrich(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.Scraper == nil {
		http.Error(w, "scraper not configured", http.StatusServiceUnavailable)
		return
	}
	var body bulkListingsFilterBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	params := body.toGetAdminListingsParams()
	maxN := adminBulkMaxListings()
	ids, total, err := h.DB.ListAdminListingIDsByFilter(r.Context(), params, true, true, maxN)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if total > maxN {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error": fmt.Sprintf("filter matches %d listings (max per run is %d); narrow filters or use category/store filters", total, maxN),
		})
		return
	}
	if len(ids) == 0 {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":      true,
			"async":   false,
			"processed": 0, "enriched": 0, "total": 0, "job_id": 0,
		})
		return
	}

	storeTypeForJob, err := enrichJobStoreTypePtr(r.Context(), h.DB, body.StoreID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jobID, jerr := h.DB.CreateEnrichJob(r.Context(), storeTypeForJob, "manual", true, "enrich")
	if jerr != nil {
		log.Printf("[admin] bulk enrich create job: %v", jerr)
		sentryutil.CaptureError(jerr, map[string]string{"component": "api", "handler": "bulk_enrich", "phase": "create_job"})
		http.Error(w, "could not create job: "+jerr.Error(), http.StatusInternalServerError)
		return
	}
	if jobID == 0 {
		http.Error(w, "could not create job", http.StatusInternalServerError)
		return
	}
	idsCopy := append([]int(nil), ids...)
	hnd := h
	go runBulkEnrichInBackground(hnd, jobID, idsCopy, total)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":     true,
		"async":  true,
		"job_id": jobID,
		"total":  total,
		"message": "Job started. Re-enrich runs in the background; check Operations for progress.",
	})
}

func runBulkClassifyInBackground(h *Handlers, jobID int, ids []int, total int) {
	log.Printf("[admin] bulk_classify job %d: starting %d listings (filter total %d)", jobID, len(ids), total)
	workCtx, cancel := context.WithTimeout(context.Background(), bulkListingsWorkTimeout())
	defer cancel()
	processed := 0
	var errStrs []string
	for _, id := range ids {
		if workCtx.Err() != nil {
			errStrs = append(errStrs, "job timed out: "+workCtx.Err().Error())
			if err := h.DB.UpdateEnrichJobDetached(jobID, "timed_out", &processed, &processed, errStrs); err != nil {
				logBulkEnrichJobFinalize("bulk_classify", jobID, "timed_out", err)
			}
			return
		}
		if wn := h.runLLMCategoryClassification(workCtx, id); wn != "" {
			errStrs = append(errStrs, wn)
		}
		processed++
	}
	if err := h.DB.UpdateEnrichJobDetached(jobID, "completed", &processed, &processed, errStrs); err != nil {
		logBulkEnrichJobFinalize("bulk_classify", jobID, "completed", err)
	}
	log.Printf("[admin] bulk_classify job %d: completed, processed %d", jobID, processed)
}

func runBulkEnrichInBackground(h *Handlers, jobID int, ids []int, total int) {
	log.Printf("[admin] bulk_enrich job %d: starting %d listings (filter total %d)", jobID, len(ids), total)
	workCtx, cancel := context.WithTimeout(context.Background(), bulkListingsWorkTimeout())
	defer cancel()
	enrichedN := 0
	var errStrs []string
	processedN := 0
	jensonSeen := make(map[string]bool)
	for _, id := range ids {
		if workCtx.Err() != nil {
			errStrs = append(errStrs, "job timed out: "+workCtx.Err().Error())
			if err := h.DB.UpdateEnrichJobDetached(jobID, "timed_out", &processedN, &enrichedN, errStrs); err != nil {
				logBulkEnrichJobFinalize("bulk_enrich", jobID, "timed_out", err)
			}
			return
		}
		if err := h.adminEnrichOneListing(workCtx, id, &errStrs, jensonSeen); err != nil {
			errStrs = append(errStrs, err.Error())
		} else {
			enrichedN++
		}
		processedN++
	}
	if err := h.DB.UpdateEnrichJobDetached(jobID, "completed", &processedN, &enrichedN, errStrs); err != nil {
		logBulkEnrichJobFinalize("bulk_enrich", jobID, "completed", err)
	}
	log.Printf("[admin] bulk_enrich job %d: completed, processed %d enriched %d", jobID, processedN, enrichedN)
}

// adminEnrichOneListing runs PDP enrich + LLM for one listing. errStrs collects non-fatal LLM warnings; returns fatal error.
// jensonSeen dedupes JensonUSA PDP variant fan-out across listings in the same product_group_key (optional).
func (h *Handlers) adminEnrichOneListing(ctx context.Context, id int, errStrs *[]string, jensonSeen map[string]bool) error {
	storeID, productURL, storeType, storeSKU, err := h.DB.GetListingEnrichmentInfo(ctx, id)
	if err != nil {
		return err
	}
	if productURL == "" {
		return fmt.Errorf("listing %d: no product URL", id)
	}
	hasEnricher := false
	for _, t := range db.StoreTypesWithEnrichers {
		if strings.EqualFold(t, storeType) {
			hasEnricher = true
			break
		}
	}
	if !hasEnricher {
		return fmt.Errorf("listing %d: no enricher for store %s", id, storeType)
	}
	result, err := h.Scraper.Enrich(ctx, productURL, storeType)
	if err != nil {
		return fmt.Errorf("listing %d: %w", id, err)
	}
	if err := h.DB.UpdateListingEnrichment(ctx, id, result.CategoryPath, result.RawSpecs, result.Unavailable, result.Description); err != nil {
		return fmt.Errorf("listing %d update: %w", id, err)
	}
	if err := applyJensonPDPAfterEnrich(ctx, h.DB, storeID, storeType, storeSKU, result.Variants, jensonSeen); err != nil {
		log.Printf("[admin] bulk enrich jenson variant fan-out listing %d: %v", id, err)
	}
	if w := h.runLLMCategoryClassification(ctx, id); w != "" && errStrs != nil {
		*errStrs = append(*errStrs, w)
	}
	if w := h.runLLMExtractionIfApplicable(ctx, id); w != "" && errStrs != nil {
		*errStrs = append(*errStrs, w)
	}
	return nil
}