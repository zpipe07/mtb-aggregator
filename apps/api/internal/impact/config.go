package impact

import (
	"os"
	"strconv"
	"strings"
)

const (
	EnvAccountSID         = "IMPACT_ACCOUNT_SID"
	EnvAuthToken          = "IMPACT_AUTH_TOKEN"
	EnvAPIBaseURL         = "IMPACT_API_BASE_URL"
	EnvCCCatalogID        = "IMPACT_CC_CATALOG_ID"
	EnvCCItemSearchQuery  = "IMPACT_CC_ITEM_SEARCH_QUERY"
	EnvCCCategoryContains = "IMPACT_CC_CATEGORY_CONTAINS"
	EnvCCPageSize         = "IMPACT_CC_PAGE_SIZE"

	DefaultAPIBaseURL      = "https://api.impact.com"
	DefaultIRVersion       = 12
	DefaultCCItemQuery     = "StockAvailability!=OutOfStock"
	DefaultCCPageSize      = 100
	DefaultCCCategoryMatch = "bike"
)

// Config holds Impact Partner API credentials and CC ingest tuning.
type Config struct {
	AccountSID         string
	AuthToken          string
	APIBaseURL         string
	CCCatalogID        string // optional; skips catalog list
	CCItemSearchQuery  string
	CCCategoryContains string // optional substring filter on category path (default Bike)
	PageSize           int
}

// ConfigFromEnv loads Impact catalog credentials and CC overrides.
// Missing AccountSID or AuthToken → empty strings (caller must check CatalogConfigured).
func ConfigFromEnv() Config {
	pageSize := DefaultCCPageSize
	if s := strings.TrimSpace(os.Getenv(EnvCCPageSize)); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			pageSize = n
		}
	}
	catContains := DefaultCCCategoryMatch
	if _, set := os.LookupEnv(EnvCCCategoryContains); set {
		catContains = strings.TrimSpace(os.Getenv(EnvCCCategoryContains))
	}
	q := strings.TrimSpace(os.Getenv(EnvCCItemSearchQuery))
	if q == "" {
		q = DefaultCCItemQuery
	}
	base := strings.TrimSpace(os.Getenv(EnvAPIBaseURL))
	if base == "" {
		base = DefaultAPIBaseURL
	}
	return Config{
		AccountSID:         strings.TrimSpace(os.Getenv(EnvAccountSID)),
		AuthToken:          strings.TrimSpace(os.Getenv(EnvAuthToken)),
		APIBaseURL:         strings.TrimRight(base, "/"),
		CCCatalogID:        strings.TrimSpace(os.Getenv(EnvCCCatalogID)),
		CCItemSearchQuery:  q,
		CCCategoryContains: catContains,
		PageSize:           pageSize,
	}
}

// CatalogConfigured reports whether API credentials are present for catalog calls.
func (c Config) CatalogConfigured() bool {
	return c.AccountSID != "" && c.AuthToken != ""
}

