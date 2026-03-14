package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/mtb-aggregator/api/internal/llm"
)

// GetLLMProfiles returns all LLM prompt profiles (admin).
func (h *Handlers) GetLLMProfiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	list, err := h.DB.ListLLMPromptProfiles(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Convert to API-friendly shape (canonical_category as joined string for display)
	out := make([]map[string]interface{}, len(list))
	for i, p := range list {
		out[i] = map[string]interface{}{
			"id":                 p.ID,
			"canonical_category": p.CanonicalCategory,
			"name":               p.Name,
			"system_prompt":      p.SystemPrompt,
			"extraction_schema":  json.RawMessage(p.ExtractionSchema),
			"enabled":            p.Enabled,
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

// PostLLMProfile creates an LLM prompt profile (admin).
func (h *Handlers) PostLLMProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		CanonicalCategory []string          `json:"canonical_category"`
		Name              string            `json:"name"`
		SystemPrompt      string            `json:"system_prompt"`
		ExtractionSchema  json.RawMessage   `json:"extraction_schema"`
		Enabled           *bool             `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if len(body.CanonicalCategory) == 0 || body.Name == "" || body.SystemPrompt == "" || len(body.ExtractionSchema) == 0 {
		http.Error(w, "canonical_category, name, system_prompt, and extraction_schema required", http.StatusBadRequest)
		return
	}
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	id, err := h.DB.CreateLLMPromptProfile(r.Context(), body.CanonicalCategory, body.Name, body.SystemPrompt, body.ExtractionSchema, enabled)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id})
}

// GetLLMProfileByID returns one LLM prompt profile by id (admin).
func (h *Handlers) GetLLMProfileByID(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	p, err := h.DB.GetLLMPromptProfileByID(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if p == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":                 p.ID,
		"canonical_category": p.CanonicalCategory,
		"name":               p.Name,
		"system_prompt":      p.SystemPrompt,
		"extraction_schema":  json.RawMessage(p.ExtractionSchema),
		"enabled":            p.Enabled,
	})
}

// PutLLMProfile updates an LLM prompt profile (admin).
func (h *Handlers) PutLLMProfile(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		CanonicalCategory []string          `json:"canonical_category"`
		Name              string            `json:"name"`
		SystemPrompt      string            `json:"system_prompt"`
		ExtractionSchema  json.RawMessage   `json:"extraction_schema"`
		Enabled           *bool             `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	existing, err := h.DB.GetLLMPromptProfileByID(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if existing == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	cat := body.CanonicalCategory
	if len(cat) == 0 {
		cat = existing.CanonicalCategory
	}
	name := body.Name
	if name == "" {
		name = existing.Name
	}
	prompt := body.SystemPrompt
	if prompt == "" {
		prompt = existing.SystemPrompt
	}
	schema := body.ExtractionSchema
	if len(schema) == 0 {
		schema = existing.ExtractionSchema
	}
	enabled := existing.Enabled
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	if err := h.DB.UpdateLLMPromptProfile(r.Context(), id, cat, name, prompt, schema, enabled); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "updated"})
}

// DeleteLLMProfile deletes an LLM prompt profile (admin).
func (h *Handlers) DeleteLLMProfile(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := h.DB.DeleteLLMPromptProfile(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "deleted"})
}

// PostLLMProfileTest runs the LLM extraction for a profile against a listing (admin).
// Body: {"listing_id": 123}. Returns the extracted JSON from the LLM.
func (h *Handlers) PostLLMProfileTest(w http.ResponseWriter, r *http.Request, profileID int) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.LLM == nil {
		http.Error(w, "LLM client not configured (set OPENAI_API_KEY)", http.StatusServiceUnavailable)
		return
	}
	var body struct {
		ListingID int `json:"listing_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.ListingID <= 0 {
		http.Error(w, "listing_id required", http.StatusBadRequest)
		return
	}
	profile, err := h.DB.GetLLMPromptProfileByID(r.Context(), profileID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if profile == nil {
		http.Error(w, "profile not found", http.StatusNotFound)
		return
	}
	listing, err := h.DB.GetAdminListingByID(r.Context(), body.ListingID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if listing == nil {
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}
	// Parse metadata for description and specs
	var meta struct {
		Description string            `json:"description"`
		Specs       map[string]string `json:"specs"`
	}
	_ = json.Unmarshal(listing.Metadata, &meta)
	input := llm.ExtractInput{
		ProductName:  listing.ProductName,
		Description:  meta.Description,
		Specs:        meta.Specs,
		CategoryPath: listing.CanonicalCategory,
	}
	if len(input.CategoryPath) == 0 {
		input.CategoryPath = listing.CategoryPath
	}
	var llmProfile llm.Profile
	if err := json.Unmarshal(profile.ExtractionSchema, &llmProfile.ExtractionSchema); err != nil {
		http.Error(w, "invalid extraction_schema: "+err.Error(), http.StatusBadRequest)
		return
	}
	llmProfile.SystemPrompt = profile.SystemPrompt
	result, err := h.LLM.Extract(r.Context(), llmProfile, input)
	if err != nil {
		http.Error(w, "LLM extraction failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if result == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"result": nil, "message": "LLM client disabled (no API key)"})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"result": result})
}

// GetCategoryClassifier returns the singleton category classifier config (admin).
func (h *Handlers) GetCategoryClassifier(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	cfg, err := h.DB.GetCategoryClassifier(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if cfg == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"config": nil})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":                   cfg.ID,
		"system_prompt":        cfg.SystemPrompt,
		"confidence_threshold": cfg.ConfidenceThreshold,
		"enabled":              cfg.Enabled,
	})
}

// PutCategoryClassifier updates the singleton category classifier config (admin).
func (h *Handlers) PutCategoryClassifier(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		SystemPrompt        string   `json:"system_prompt"`
		ConfidenceThreshold *float64 `json:"confidence_threshold"`
		Enabled             *bool    `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	cfg, err := h.DB.GetCategoryClassifier(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if cfg == nil {
		http.Error(w, "category classifier config not found (run migration first)", http.StatusNotFound)
		return
	}
	if body.SystemPrompt != "" {
		cfg.SystemPrompt = body.SystemPrompt
	}
	if body.ConfidenceThreshold != nil {
		cfg.ConfidenceThreshold = *body.ConfidenceThreshold
	}
	if body.Enabled != nil {
		cfg.Enabled = *body.Enabled
	}
	if err := h.DB.UpsertCategoryClassifier(r.Context(), cfg); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "updated"})
}

// PostCategoryClassifierTest runs classification on a single listing (admin). Body: {"listing_id": 123}.
func (h *Handlers) PostCategoryClassifierTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.LLM == nil {
		http.Error(w, "LLM client not configured (set OPENAI_API_KEY)", http.StatusServiceUnavailable)
		return
	}
	var body struct {
		ListingID int `json:"listing_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.ListingID <= 0 {
		http.Error(w, "listing_id required", http.StatusBadRequest)
		return
	}
	cfg, err := h.DB.GetCategoryClassifier(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if cfg == nil || !cfg.Enabled {
		http.Error(w, "category classifier not configured or disabled", http.StatusNotFound)
		return
	}
	validPaths, err := h.DB.GetAllCategoryPaths(r.Context())
	if err != nil {
		http.Error(w, "failed to load categories: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if len(validPaths) == 0 {
		http.Error(w, "no categories in tree (run migrations 017 and 018 to seed categories)", http.StatusInternalServerError)
		return
	}
	listing, err := h.DB.GetListingForCategoryClassification(r.Context(), body.ListingID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if listing == nil {
		http.Error(w, "listing not found", http.StatusNotFound)
		return
	}
	var meta struct {
		Description string                 `json:"description"`
		Specs      map[string]interface{} `json:"specs"`
	}
	_ = json.Unmarshal(listing.Metadata, &meta)
	specs := make(map[string]string)
	if meta.Specs != nil {
		for k, v := range meta.Specs {
			if v != nil {
				specs[k] = fmt.Sprint(v)
			}
		}
	}
	input := llm.ClassifyInput{
		ProductName:  listing.ProductName,
		Description:  meta.Description,
		Specs:        specs,
		CategoryPath: listing.CategoryPath,
	}
	config := llm.ClassifyConfig{
		SystemPrompt:        cfg.SystemPrompt,
		ValidCategories:     validPaths,
		ConfidenceThreshold: cfg.ConfidenceThreshold,
	}
	result, err := h.LLM.Classify(r.Context(), config, input)
	if err != nil {
		http.Error(w, "classification failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if result == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"result": nil, "message": "LLM client disabled (no API key)"})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"result": map[string]interface{}{
			"canonical_category": result.CanonicalCategory,
			"confidence":         result.Confidence,
			"reasoning":          result.Reasoning,
		},
	})
}

// PostCategoryClassifierRun re-runs category classification on listings. Body: {"store": "worldwidecyclery", "canonical_category": ["Bikes", "Mountain"], "limit": 100}.
func (h *Handlers) PostCategoryClassifierRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Store             string   `json:"store"`
		CanonicalCategory []string `json:"canonical_category"`
		Limit             int      `json:"limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	limit := body.Limit
	if limit <= 0 {
		limit = 500
	}
	ids, err := h.DB.ListListingIDsForCategoryClassifierRun(r.Context(), body.Store, body.CanonicalCategory, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	processed := 0
	for _, id := range ids {
		h.runLLMCategoryClassification(r.Context(), id)
		processed++
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "processed": processed})
}

// PostAdminLLMRun re-runs LLM extraction for all listings in a canonical category. Body: {"canonical_category": ["Bikes", "Mountain"]}.
func (h *Handlers) PostAdminLLMRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		CanonicalCategory []string `json:"canonical_category"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if len(body.CanonicalCategory) == 0 {
		http.Error(w, "canonical_category required", http.StatusBadRequest)
		return
	}
	ids, err := h.DB.ListListingIDsByCanonicalCategory(r.Context(), body.CanonicalCategory)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	processed := 0
	for _, id := range ids {
		h.runLLMExtractionIfApplicable(r.Context(), id)
		processed++
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "processed": processed})
}
