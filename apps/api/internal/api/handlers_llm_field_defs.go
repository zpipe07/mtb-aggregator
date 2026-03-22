package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/mtb-aggregator/api/internal/db"
)

// GetLLMExtractionFieldDefs lists field definitions (admin). Query: ?q= search on key/label.
func (h *Handlers) GetLLMExtractionFieldDefs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	list, err := h.DB.ListLLMExtractionFieldDefs(r.Context(), q)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

// PostLLMExtractionFieldDef creates a field definition (admin).
func (h *Handlers) PostLLMExtractionFieldDef(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		FieldKey    string          `json:"field_key"`
		FieldType   string          `json:"field_type"`
		Description string          `json:"description"`
		Label       *string         `json:"label"`
		Values      json.RawMessage `json:"values"`
		Filterable  *bool           `json:"filterable"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.FieldKey == "" || body.FieldType == "" || body.Description == "" {
		http.Error(w, "field_key, field_type, and description required", http.StatusBadRequest)
		return
	}
	id, err := h.DB.CreateLLMExtractionFieldDef(r.Context(), body.FieldKey, body.FieldType, body.Description, body.Label, body.Values, body.Filterable)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]int{"id": id})
}

// GetLLMExtractionFieldDefByID returns one field def (admin).
func (h *Handlers) GetLLMExtractionFieldDefByID(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	d, err := h.DB.GetLLMExtractionFieldDefByID(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if d == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(d)
}

// PutLLMExtractionFieldDef updates a field def (admin). field_key cannot change.
func (h *Handlers) PutLLMExtractionFieldDef(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		FieldKey    string          `json:"field_key"`
		FieldType   string          `json:"field_type"`
		Description string          `json:"description"`
		Label       *string         `json:"label"`
		Values      json.RawMessage `json:"values"`
		Filterable  *bool           `json:"filterable"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.FieldKey == "" || body.FieldType == "" || body.Description == "" {
		http.Error(w, "field_key, field_type, and description required", http.StatusBadRequest)
		return
	}
	err := h.DB.UpdateLLMExtractionFieldDef(r.Context(), id, body.FieldKey, body.FieldType, body.Description, body.Label, body.Values, body.Filterable)
	if err != nil {
		if strings.Contains(err.Error(), "immutable") {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "updated"})
}

// DeleteLLMExtractionFieldDef deletes a field def (admin). 409 if referenced.
func (h *Handlers) DeleteLLMExtractionFieldDef(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	err := h.DB.DeleteLLMExtractionFieldDef(r.Context(), id)
	if err != nil {
		if errors.Is(err, db.ErrFieldDefInUse) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "deleted"})
}
