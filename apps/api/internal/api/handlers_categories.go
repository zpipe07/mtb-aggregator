package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/mtb-aggregator/api/internal/db"
)

// GetCategoryTree returns the full category hierarchy as a nested tree (public).
func (h *Handlers) GetCategoryTree(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tree, err := h.DB.ListCategoriesTree(r.Context())
	if err != nil {
		log.Printf("[api] GetCategoryTree error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tree == nil {
		tree = []db.CategoryTreeNode{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tree)
}

// GetAdminCategories returns the category tree for admin (same as public; admin can also use CRUD).
func (h *Handlers) GetAdminCategories(w http.ResponseWriter, r *http.Request) {
	h.GetCategoryTree(w, r)
}

// PostAdminCategory creates a category (admin). Body: { "slug", "name", "parent_id"?, "sort_order" }.
func (h *Handlers) PostAdminCategory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Slug        string `json:"slug"`
		Name        string `json:"name"`
		ParentID    *int   `json:"parent_id,omitempty"`
		SortOrder   int    `json:"sort_order"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	body.Slug = strings.TrimSpace(strings.ToLower(strings.ReplaceAll(body.Slug, " ", "-")))
	body.Name = strings.TrimSpace(body.Name)
	if body.Slug == "" || body.Name == "" {
		http.Error(w, "slug and name required", http.StatusBadRequest)
		return
	}
	id, err := h.DB.CreateCategory(r.Context(), body.Slug, body.Name, body.ParentID, body.SortOrder, body.Description)
	if err != nil {
		log.Printf("[api] PostAdminCategory error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id})
}

// GetAdminCategoryByID returns a single category by id (admin).
func (h *Handlers) GetAdminCategoryByID(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	c, err := h.DB.GetCategoryByID(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if c == nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

// PutAdminCategory updates a category by id (admin). Body: { "slug", "name", "sort_order" }.
func (h *Handlers) PutAdminCategory(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Slug        string `json:"slug"`
		Name        string `json:"name"`
		SortOrder   int    `json:"sort_order"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	body.Slug = strings.TrimSpace(strings.ToLower(strings.ReplaceAll(body.Slug, " ", "-")))
	body.Name = strings.TrimSpace(body.Name)
	if body.Slug == "" || body.Name == "" {
		http.Error(w, "slug and name required", http.StatusBadRequest)
		return
	}
	if err := h.DB.UpdateCategory(r.Context(), id, body.Slug, body.Name, body.SortOrder, body.Description); err != nil {
		log.Printf("[api] PutAdminCategory error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true})
}

// DeleteAdminCategory deletes a category by id (admin).
func (h *Handlers) DeleteAdminCategory(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := h.DB.DeleteCategory(r.Context(), id); err != nil {
		if strings.Contains(err.Error(), "cannot delete") {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		log.Printf("[api] DeleteAdminCategory error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetAdminCategoryProfileFields returns effective extraction_schema.fields for a category (admin).
func (h *Handlers) GetAdminCategoryProfileFields(w http.ResponseWriter, r *http.Request, id int) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	profile, err := h.DB.GetLLMPromptProfileForCategoryID(r.Context(), id)
	if err != nil {
		log.Printf("[api] GetAdminCategoryProfileFields error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var fields []interface{}
	if profile != nil && len(profile.ExtractionSchema) > 0 {
		var schema struct {
			Fields []interface{} `json:"fields"`
		}
		if err := json.Unmarshal(profile.ExtractionSchema, &schema); err == nil {
			fields = schema.Fields
		}
	}
	if fields == nil {
		fields = []interface{}{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"fields": fields})
}

// CategoriesAdminHandler routes /admin/categories and /admin/categories/:id.
func (h *Handlers) CategoriesAdminHandler(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/admin/categories")
	path = strings.Trim(path, "/")
	if path == "" {
		switch r.Method {
		case http.MethodGet:
			h.GetAdminCategories(w, r)
		case http.MethodPost:
			h.PostAdminCategory(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
		return
	}
	parts := strings.SplitN(path, "/", 2)
	id, err := strconv.Atoi(parts[0])
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if len(parts) > 1 && parts[1] == "profile-fields" {
		h.GetAdminCategoryProfileFields(w, r, id)
		return
	}
	if len(parts) > 1 {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet:
		h.GetAdminCategoryByID(w, r, id)
	case http.MethodPut:
		h.PutAdminCategory(w, r, id)
	case http.MethodDelete:
		h.DeleteAdminCategory(w, r, id)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
