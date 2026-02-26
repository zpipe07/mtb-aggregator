package api

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
)

const adminPasswordEnv = "ADMIN_PASSWORD"

// AllowedStoreTypes are store_type values that have a registered scraper parser. Update when adding parsers.
var AllowedStoreTypes = []string{"jensonusa", "worldwidecyclery", "revelbikes"}

// ValidateAdminAuth returns true if r has a valid admin Bearer token.
func ValidateAdminAuth(r *http.Request) bool {
	expected := os.Getenv(adminPasswordEnv)
	if expected == "" {
		return false
	}
	s := r.Header.Get("Authorization")
	if s == "" {
		return false
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(s, prefix) {
		return false
	}
	return strings.TrimSpace(s[len(prefix):]) == expected
}

// PostAuthHandler handles POST /admin/auth: body {"password":"..."}, returns 200 if match.
func PostAuthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	expected := os.Getenv(adminPasswordEnv)
	if expected == "" {
		http.Error(w, "admin disabled", http.StatusServiceUnavailable)
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.Password) != expected {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}

// GetStoreTypes returns the list of allowed store_type values for the admin UI dropdown.
func GetStoreTypes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.Encode(AllowedStoreTypes)
}

// AdminRequired wraps a handler and returns 401 if the request is not admin-authenticated.
func AdminRequired(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ValidateAdminAuth(r) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}
