package api

import (
	"encoding/json"
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
