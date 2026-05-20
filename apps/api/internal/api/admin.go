package api

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"strings"
)

const adminPasswordEnv = "ADMIN_PASSWORD"

// AllowedStoreTypes are store_type values that have a registered scraper parser. Update when adding parsers.
var AllowedStoreTypes = []string{"jensonusa", "worldwidecyclery", "revelbikes", "backcountry", "competitivecyclist", "ridebicycles", "thundermountainbikes", "canyon"}

// constantTimeEqual compares two strings in constant time when lengths match.
func constantTimeEqual(a, b string) bool {
	aa := []byte(a)
	bb := []byte(b)
	if len(aa) != len(bb) {
		return false
	}
	return subtle.ConstantTimeCompare(aa, bb) == 1
}

// ValidateAdminAuth returns true if r has a valid admin Bearer token.
func ValidateAdminAuth(r *http.Request) bool {
	expected := strings.TrimSpace(os.Getenv(adminPasswordEnv))
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
	token := strings.TrimSpace(s[len(prefix):])
	return constantTimeEqual(token, expected)
}

// PostAuthHandler handles POST /admin/auth: body {"password":"..."}, returns 200 if match.
func PostAuthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	expected := strings.TrimSpace(os.Getenv(adminPasswordEnv))
	if expected == "" {
		http.Error(w, "admin disabled", http.StatusServiceUnavailable)
		return
	}

	ip := clientIP(r)
	if !globalAdminAuthLimiter.allowAdminAuth(ip) {
		w.Header().Set("Retry-After", strconv.Itoa(globalAdminAuthLimiter.retryAfterSeconds(ip)))
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}

	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	guess := strings.TrimSpace(body.Password)
	if !constantTimeEqual(guess, expected) {
		globalAdminAuthLimiter.recordAdminAuthFailure(ip)
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	globalAdminAuthLimiter.resetAdminAuth(ip)
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
