package db

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lib/pq"
	"github.com/mtb-aggregator/api/internal/metadata"
	"github.com/mtb-aggregator/api/internal/taxonomy"
)

type Store struct {
	ID                    int
	Name                  string
	BaseURL               string
	ScrapeURL             string
	StoreType             string
	AffiliateNetwork      *string // optional
	LastScrapeResultCount *int    // nil before first scrape; used for health monitoring (0 for 2+ runs = possible breakage)
}

type Listing struct {
	StoreID            int
	StoreSKU           string
	ProductName        string
	CurrentPrice       float64
	OriginalPrice      *float64
	ProductURL         string
	ImageURL           *string
	Brand              *string
	CategoryPath       []string
	CanonicalCategory  []string // MTB taxonomy path e.g. ["Components", "Brakes"]
	Metadata           []byte   // JSONB: wheel_size, suspension_travel_mm, model_year, groupset
	IsInStock          bool
}

type DB struct {
	pool *pgxpool.Pool
}

func New(connString string) (*DB, error) {
	pool, err := pgxpool.New(context.Background(), connString)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &DB{pool: pool}, nil
}

func (db *DB) Close() {
	db.pool.Close()
}

func (db *DB) GetStores(ctx context.Context) ([]Store, error) {
	return db.getStores(ctx, "")
}

// GetStoresByType returns stores with the given store_type (e.g. "worldwidecyclery").
// Pass empty string to get all stores (same as GetStores).
func (db *DB) GetStoresByType(ctx context.Context, storeType string) ([]Store, error) {
	return db.getStores(ctx, storeType)
}

// GetStoreByID returns one store by id, or nil if not found.
func (db *DB) GetStoreByID(ctx context.Context, id int) (*Store, error) {
	var s Store
	err := db.pool.QueryRow(ctx, `
		SELECT id, name, base_url, scrape_url, COALESCE(store_type, 'jensonusa'), affiliate_network, last_scrape_result_count
		FROM stores WHERE id = $1
	`, id).Scan(&s.ID, &s.Name, &s.BaseURL, &s.ScrapeURL, &s.StoreType, &s.AffiliateNetwork, &s.LastScrapeResultCount)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	return &s, nil
}

func (db *DB) getStores(ctx context.Context, storeType string) ([]Store, error) {
	query := `
		SELECT id, name, base_url, scrape_url, COALESCE(store_type, 'jensonusa'), affiliate_network, last_scrape_result_count FROM stores
	`
	args := []interface{}{}
	if storeType != "" {
		query += ` WHERE LOWER(COALESCE(store_type, '')) = LOWER($1)`
		args = append(args, storeType)
	}
	query += ` ORDER BY id`

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stores []Store
	for rows.Next() {
		var s Store
		if err := rows.Scan(&s.ID, &s.Name, &s.BaseURL, &s.ScrapeURL, &s.StoreType, &s.AffiliateNetwork, &s.LastScrapeResultCount); err != nil {
			return nil, err
		}
		stores = append(stores, s)
	}
	return stores, rows.Err()
}

// CreateStore inserts a store and returns its id. Name must be unique.
func (db *DB) CreateStore(ctx context.Context, s Store) (int, error) {
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO stores (name, base_url, scrape_url, store_type, affiliate_network)
		VALUES ($1, $2, $3, COALESCE(NULLIF(TRIM($4), ''), 'jensonusa'), NULLIF(TRIM($5), ''))
		RETURNING id
	`, s.Name, s.BaseURL, s.ScrapeURL, s.StoreType, s.AffiliateNetwork).Scan(&id)
	if err != nil {
		return 0, err
	}
	return id, nil
}

// UpdateStore updates a store by id. Only non-zero/non-empty fields are updated; pass nil for AffiliateNetwork to clear.
func (db *DB) UpdateStore(ctx context.Context, id int, name, baseURL, scrapeURL, storeType string, affiliateNetwork *string) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE stores SET
			name = $1,
			base_url = $2,
			scrape_url = $3,
			store_type = COALESCE(NULLIF(TRIM($4), ''), store_type),
			affiliate_network = $5
		WHERE id = $6
	`, name, baseURL, scrapeURL, storeType, affiliateNetwork, id)
	return err
}

// DeleteStore deletes a store by id. Listings and price_history cascade.
func (db *DB) DeleteStore(ctx context.Context, id int) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM stores WHERE id = $1`, id)
	return err
}

// UpdateStoreLastScrapeResultCount records the number of listings returned by the last scrape for health monitoring.
func (db *DB) UpdateStoreLastScrapeResultCount(ctx context.Context, storeID int, count int) error {
	_, err := db.pool.Exec(ctx, `UPDATE stores SET last_scrape_result_count = $1 WHERE id = $2`, count, storeID)
	return err
}

func (db *DB) GetLastPrice(ctx context.Context, storeID int, storeSKU string) (float64, bool, error) {
	var price float64
	err := db.pool.QueryRow(ctx, `
		SELECT current_price FROM store_listings
		WHERE store_id = $1 AND store_sku = $2
	`, storeID, storeSKU).Scan(&price)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return 0, false, nil
		}
		return 0, false, err
	}
	return price, true, nil
}

func (db *DB) UpsertListing(ctx context.Context, listing Listing) (int, error) {
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO store_listings (store_id, store_sku, product_name, current_price, original_price, product_url, image_url, brand, category_path, canonical_category, metadata, is_in_stock, last_scraped)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
		ON CONFLICT (store_id, store_sku) DO UPDATE SET
			product_name = EXCLUDED.product_name,
			current_price = EXCLUDED.current_price,
			original_price = EXCLUDED.original_price,
			product_url = EXCLUDED.product_url,
			image_url = EXCLUDED.image_url,
			brand = EXCLUDED.brand,
			category_path = CASE WHEN EXCLUDED.category_path IS NOT NULL AND array_length(EXCLUDED.category_path, 1) > 0 THEN EXCLUDED.category_path ELSE store_listings.category_path END,
			canonical_category = EXCLUDED.canonical_category,
			metadata = EXCLUDED.metadata,
			is_in_stock = EXCLUDED.is_in_stock,
			last_scraped = NOW()
		RETURNING id
	`, listing.StoreID, listing.StoreSKU, listing.ProductName, listing.CurrentPrice, listing.OriginalPrice,
		listing.ProductURL, listing.ImageURL, listing.Brand, pq.Array(listing.CategoryPath), pq.Array(listing.CanonicalCategory), listing.Metadata, listing.IsInStock).Scan(&id)
	return id, err
}

func (db *DB) InsertPriceHistory(ctx context.Context, listingID int, price float64) error {
	_, err := db.pool.Exec(ctx, `
		INSERT INTO price_history (listing_id, price) VALUES ($1, $2)
	`, listingID, price)
	return err
}

// Deal includes store name for API response
type Deal struct {
	ID            int      `json:"id"`
	StoreID       int      `json:"store_id"`
	StoreName     string   `json:"store_name"`
	StoreSKU      string   `json:"store_sku"`
	ProductName   string   `json:"product_name"`
	CurrentPrice  float64  `json:"current_price"`
	OriginalPrice *float64 `json:"original_price,omitempty"`
	ProductURL    string   `json:"product_url"`
	AffiliateURL  *string  `json:"affiliate_url,omitempty"`
	ImageURL      *string  `json:"image_url,omitempty"`
	Brand         *string   `json:"brand,omitempty"`
	CategoryPath       []string        `json:"category_path,omitempty"`
	CanonicalCategory  []string        `json:"canonical_category,omitempty"`
	Metadata           json.RawMessage `json:"metadata,omitempty"`
	IsInStock          bool            `json:"is_in_stock"`
	DiscountPct   *float64 `json:"discount_pct,omitempty"`
	LastScraped   string   `json:"last_scraped"`
}

// AdminListing extends Deal with created_at, last_enriched_at, and hidden for the admin data browser.
type AdminListing struct {
	Deal
	CreatedAt      string `json:"created_at"`
	LastEnrichedAt string `json:"last_enriched_at"`
	Hidden         bool   `json:"hidden"`
}

// GetAdminListingsParams for admin listing browser filters.
type GetAdminListingsParams struct {
	StoreID               int     // 0 = all
	Brand                 string
	HasCanonicalCategory  *bool   // true = has canonical category set; false = not set; nil = any
	HasEnrichment         *bool   // true = last_enriched_at IS NOT NULL; false = NULL; nil = any
	InStock               *bool   // true = is_in_stock; false = out of stock; nil = any
	Hidden                *bool   // true = hidden only; false = visible only; nil = any
	Category              string
	CanonicalCategory     string
	Search                string
	Sort                  string  // newest, discount, price_asc, price_desc, relevance
	LLMConfidenceBelow    *float64 // filter: (metadata->>'llm_confidence')::float < value (e.g. 0.7 for low confidence)
	Limit                 int
	Offset                int
}

// GetAdminListings returns listings for the admin data browser with full detail.
func (db *DB) GetAdminListings(ctx context.Context, params GetAdminListingsParams) ([]AdminListing, int, error) {
	if params.Limit <= 0 {
		params.Limit = 50
	}
	if params.Limit > 200 {
		params.Limit = 200
	}
	sort := params.Sort
	if sort == "" {
		sort = "newest"
	}
	if params.Search == "" && sort == "relevance" {
		sort = "newest"
	}

	query := `
		SELECT l.id, l.store_id, s.name, l.store_sku, l.product_name, l.current_price, l.original_price,
			l.product_url, l.affiliate_url, l.image_url, l.brand, COALESCE(l.category_path, '{}'), COALESCE(l.canonical_category, '{}'), l.metadata, l.is_in_stock, l.hidden, l.last_scraped::text,
			l.created_at::text, l.last_enriched_at::text,
			COUNT(*) OVER() AS total_count
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE 1=1
	`
	args := []interface{}{}
	argNum := 1

	if params.StoreID > 0 {
		query += fmt.Sprintf(" AND l.store_id = $%d", argNum)
		args = append(args, params.StoreID)
		argNum++
	}
	if params.Brand != "" {
		query += fmt.Sprintf(" AND l.brand ILIKE $%d", argNum)
		args = append(args, params.Brand)
		argNum++
	}
	if params.HasCanonicalCategory != nil {
		if *params.HasCanonicalCategory {
			query += " AND l.canonical_category IS NOT NULL AND array_length(l.canonical_category, 1) > 0"
		} else {
			query += " AND (l.canonical_category IS NULL OR array_length(l.canonical_category, 1) IS NULL)"
		}
	}
	if params.HasEnrichment != nil {
		if *params.HasEnrichment {
			query += " AND l.last_enriched_at IS NOT NULL"
		} else {
			query += " AND l.last_enriched_at IS NULL"
		}
	}
	if params.InStock != nil {
		if *params.InStock {
			query += " AND l.is_in_stock = true"
		} else {
			query += " AND l.is_in_stock = false"
		}
	}
	if params.Hidden != nil {
		query += fmt.Sprintf(" AND l.hidden = $%d", argNum)
		args = append(args, *params.Hidden)
		argNum++
	}
	if params.Category != "" {
		query += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM unnest(COALESCE(l.category_path, '{}')) AS c WHERE c ILIKE $%d)", argNum)
		args = append(args, params.Category)
		argNum++
	}
	if params.CanonicalCategory != "" {
		path := strings.Split(params.CanonicalCategory, " > ")
		trimmed := make([]string, 0, len(path))
		for _, p := range path {
			if t := strings.TrimSpace(p); t != "" {
				trimmed = append(trimmed, t)
			}
		}
		if len(trimmed) > 0 {
			query += fmt.Sprintf(" AND l.canonical_category = $%d", argNum)
			args = append(args, pq.Array(trimmed))
			argNum++
		}
	}
	if params.Search != "" {
		query += fmt.Sprintf(" AND l.search_vector @@ plainto_tsquery('english', $%d)", argNum)
		args = append(args, params.Search)
		argNum++
	}
	if params.LLMConfidenceBelow != nil {
		query += fmt.Sprintf(" AND (l.metadata->>'llm_confidence')::float < $%d", argNum)
		args = append(args, *params.LLMConfidenceBelow)
		argNum++
	}

	switch sort {
	case "relevance":
		query += fmt.Sprintf(" ORDER BY ts_rank(l.search_vector, plainto_tsquery('english', $%d)) DESC", argNum)
		args = append(args, params.Search)
		argNum++
	case "discount":
		query += ` ORDER BY (CASE WHEN l.original_price IS NOT NULL AND l.original_price > 0 AND l.current_price < l.original_price THEN (1 - l.current_price / l.original_price) * 100 ELSE 0 END) DESC NULLS LAST`
	case "price_asc":
		query += " ORDER BY l.current_price ASC"
	case "price_desc":
		query += " ORDER BY l.current_price DESC"
	default:
		query += " ORDER BY l.last_scraped DESC"
	}

	query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argNum, argNum+1)
	args = append(args, params.Limit, params.Offset)

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var listings []AdminListing
	var totalCount int
	for rows.Next() {
		var a AdminListing
		var lastScraped []byte
		var cp, canCat pgtype.FlatArray[string]
		var meta []byte
		var createdAt, lastEnrichedAt []byte
		if err := rows.Scan(&a.ID, &a.StoreID, &a.StoreName, &a.StoreSKU, &a.ProductName, &a.CurrentPrice, &a.OriginalPrice,
			&a.ProductURL, &a.AffiliateURL, &a.ImageURL, &a.Brand, &cp, &canCat, &meta, &a.IsInStock, &a.Hidden, &lastScraped,
			&createdAt, &lastEnrichedAt, &totalCount); err != nil {
			return nil, 0, err
		}
		a.CategoryPath = cp
		a.CanonicalCategory = canCat
		a.Metadata = json.RawMessage(meta)
		a.LastScraped = string(lastScraped)
		if len(createdAt) > 0 {
			a.CreatedAt = string(createdAt)
		}
		if len(lastEnrichedAt) > 0 {
			a.LastEnrichedAt = string(lastEnrichedAt)
		}
		if a.OriginalPrice != nil && *a.OriginalPrice > 0 && *a.OriginalPrice > a.CurrentPrice {
			pct := (1 - a.CurrentPrice/(*a.OriginalPrice)) * 100
			if pct > 0 {
				a.DiscountPct = &pct
			}
		}
		listings = append(listings, a)
	}
	if listings == nil {
		listings = []AdminListing{}
	}
	return listings, totalCount, rows.Err()
}

// GetAdminListingByID returns one listing by id for admin detail view, or nil if not found.
func (db *DB) GetAdminListingByID(ctx context.Context, id int) (*AdminListing, error) {
	var a AdminListing
	var lastScraped []byte
	var cp, canCat pgtype.FlatArray[string]
	var meta []byte
	var createdAt, lastEnrichedAt *string
	err := db.pool.QueryRow(ctx, `
		SELECT l.id, l.store_id, s.name, l.store_sku, l.product_name, l.current_price, l.original_price,
			l.product_url, l.affiliate_url, l.image_url, l.brand, COALESCE(l.category_path, '{}'), COALESCE(l.canonical_category, '{}'), l.metadata, l.is_in_stock, l.hidden, l.last_scraped::text,
			l.created_at::text, l.last_enriched_at::text
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE l.id = $1
	`, id).Scan(&a.ID, &a.StoreID, &a.StoreName, &a.StoreSKU, &a.ProductName, &a.CurrentPrice, &a.OriginalPrice,
		&a.ProductURL, &a.AffiliateURL, &a.ImageURL, &a.Brand, &cp, &canCat, &meta, &a.IsInStock, &a.Hidden, &lastScraped,
		&createdAt, &lastEnrichedAt)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	a.CategoryPath = cp
	a.CanonicalCategory = canCat
	a.Metadata = json.RawMessage(meta)
	a.LastScraped = string(lastScraped)
	if createdAt != nil {
		a.CreatedAt = *createdAt
	}
	if lastEnrichedAt != nil {
		a.LastEnrichedAt = *lastEnrichedAt
	}
	if a.OriginalPrice != nil && *a.OriginalPrice > 0 && *a.OriginalPrice > a.CurrentPrice {
		pct := (1 - a.CurrentPrice/(*a.OriginalPrice)) * 100
		if pct > 0 {
			a.DiscountPct = &pct
		}
	}
	return &a, nil
}

// SetListingHidden sets the hidden flag for a listing by id. Returns error if not found.
func (db *DB) SetListingHidden(ctx context.Context, id int, hidden bool) error {
	cmd, err := db.pool.Exec(ctx, `UPDATE store_listings SET hidden = $1 WHERE id = $2`, hidden, id)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return fmt.Errorf("listing not found")
	}
	return nil
}

// GetDealsParams for filtering, search, and sort
type GetDealsParams struct {
	StoreID           *int
	StoreName         string
	Brand             string
	Category          string
	CanonicalCategory string // e.g. "Bikes > Mountain" (exact path match)
	MinDiscount       *float64
	Search            string // full-text search query (q)
	Sort              string // newest, discount, price_asc, price_desc, relevance
	Limit             int
	Offset            int
	SpecKey           string            // legacy: single spec filter (use SpecFilters for multi)
	SpecValue         string            // legacy: single spec value
	SpecFilters       map[string]string // multiple spec filters: key -> value (e.g. hub_spacing=148mm)
}

// GetDealsResult includes deals and total count for pagination
type GetDealsResult struct {
	Deals      []Deal
	TotalCount int
}

func (db *DB) GetDeals(ctx context.Context, params GetDealsParams) (*GetDealsResult, error) {
	if params.Limit <= 0 {
		params.Limit = 50
	}
	// Normalize sort: default newest; relevance only valid when Search is set
	sort := params.Sort
	if sort == "" {
		sort = "newest"
	}
	if params.Search == "" && sort == "relevance" {
		sort = "newest"
	}

	query := `
		SELECT l.id, l.store_id, s.name, l.store_sku, l.product_name, l.current_price, l.original_price,
			l.product_url, l.affiliate_url, l.image_url, l.brand, COALESCE(l.category_path, '{}'), COALESCE(l.canonical_category, '{}'), l.metadata, l.is_in_stock, l.last_scraped::text,
			COUNT(*) OVER() AS total_count
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE 1=1 AND l.is_in_stock = true AND l.hidden = false
	`
	args := []interface{}{}
	argNum := 1

	if params.StoreID != nil {
		query += fmt.Sprintf(" AND l.store_id = $%d", argNum)
		args = append(args, *params.StoreID)
		argNum++
	}
	if params.StoreName != "" {
		query += fmt.Sprintf(" AND s.name ILIKE $%d", argNum)
		args = append(args, params.StoreName)
		argNum++
	}
	if params.Brand != "" {
		query += fmt.Sprintf(" AND l.brand ILIKE $%d", argNum)
		args = append(args, params.Brand)
		argNum++
	}
	if params.Category != "" {
		query += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM unnest(COALESCE(l.category_path, '{}')) AS c WHERE c ILIKE $%d)", argNum)
		args = append(args, params.Category)
		argNum++
	}
	if params.CanonicalCategory != "" {
		// Parse "Bikes > Mountain" into array and match exactly
		path := strings.Split(params.CanonicalCategory, " > ")
		trimmed := make([]string, 0, len(path))
		for _, p := range path {
			if t := strings.TrimSpace(p); t != "" {
				trimmed = append(trimmed, t)
			}
		}
		if len(trimmed) > 0 {
			query += fmt.Sprintf(" AND l.canonical_category = $%d", argNum)
			args = append(args, pq.Array(trimmed))
			argNum++
		}
	}
	// Spec filters: query metadata.llm_specs (LLM-derived). Use SpecFilters map if non-empty, else legacy SpecKey/SpecValue.
	specFilters := params.SpecFilters
	if len(specFilters) == 0 && params.SpecKey != "" && params.SpecValue != "" {
		specFilters = map[string]string{params.SpecKey: params.SpecValue}
	}
	expanded := make(map[string][]string)
	for k, v := range specFilters {
		if k != "" && v != "" {
			expanded[k] = []string{v}
		}
	}
	for k, values := range expanded {
		if k == "" || len(values) == 0 {
			continue
		}
		if len(values) == 1 {
			query += fmt.Sprintf(" AND l.metadata->'llm_specs'->>$%d ILIKE $%d", argNum, argNum+1)
			args = append(args, k, values[0])
			argNum += 2
		} else {
			query += fmt.Sprintf(" AND (l.metadata->'llm_specs'->>$%d)::text ILIKE ANY($%d::text[])", argNum, argNum+1)
			args = append(args, k, pq.Array(values))
			argNum += 2
		}
	}
	if params.MinDiscount != nil && *params.MinDiscount > 0 {
		query += fmt.Sprintf(" AND l.original_price IS NOT NULL AND l.original_price > 0 AND l.current_price < l.original_price AND (1 - l.current_price / l.original_price) * 100 >= $%d", argNum)
		args = append(args, *params.MinDiscount)
		argNum++
	}
	if params.Search != "" {
		query += fmt.Sprintf(" AND l.search_vector @@ plainto_tsquery('english', $%d)", argNum)
		args = append(args, params.Search)
		argNum++
	}

	// ORDER BY
	switch sort {
	case "relevance":
		query += fmt.Sprintf(" ORDER BY ts_rank(l.search_vector, plainto_tsquery('english', $%d)) DESC", argNum)
		args = append(args, params.Search)
		argNum++
	case "discount":
		query += ` ORDER BY (CASE WHEN l.original_price IS NOT NULL AND l.original_price > 0 AND l.current_price < l.original_price THEN (1 - l.current_price / l.original_price) * 100 ELSE 0 END) DESC NULLS LAST`
	case "price_asc":
		query += " ORDER BY l.current_price ASC"
	case "price_desc":
		query += " ORDER BY l.current_price DESC"
	default:
		query += " ORDER BY l.last_scraped DESC"
	}

	query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argNum, argNum+1)
	args = append(args, params.Limit, params.Offset)

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deals []Deal
	var totalCount int
	for rows.Next() {
		var d Deal
		var lastScraped []byte
		var cp, canCat pgtype.FlatArray[string]
		var meta []byte
		if err := rows.Scan(&d.ID, &d.StoreID, &d.StoreName, &d.StoreSKU, &d.ProductName, &d.CurrentPrice, &d.OriginalPrice,
			&d.ProductURL, &d.AffiliateURL, &d.ImageURL, &d.Brand, &cp, &canCat, &meta, &d.IsInStock, &lastScraped, &totalCount); err != nil {
			return nil, err
		}
		d.CategoryPath = cp
		d.CanonicalCategory = canCat
		d.Metadata = json.RawMessage(meta)
		d.LastScraped = string(lastScraped)
		if d.OriginalPrice != nil && *d.OriginalPrice > 0 && *d.OriginalPrice > d.CurrentPrice {
			pct := (1 - d.CurrentPrice/(*d.OriginalPrice)) * 100
			if pct > 0 {
				d.DiscountPct = &pct
			}
		}
		deals = append(deals, d)
	}
	if deals == nil {
		deals = []Deal{}
	}
	return &GetDealsResult{Deals: deals, TotalCount: totalCount}, rows.Err()
}

func (db *DB) GetDealByID(ctx context.Context, id int) (*Deal, error) {
	var d Deal
	var lastScraped []byte
	var cp pgtype.FlatArray[string]
	var canCat pgtype.FlatArray[string]
	var meta []byte
	err := db.pool.QueryRow(ctx, `
		SELECT l.id, l.store_id, s.name, l.store_sku, l.product_name, l.current_price, l.original_price,
			l.product_url, l.affiliate_url, l.image_url, l.brand, COALESCE(l.category_path, '{}'), COALESCE(l.canonical_category, '{}'), l.metadata, l.is_in_stock, l.last_scraped::text
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE l.id = $1 AND l.hidden = false
	`, id).Scan(&d.ID, &d.StoreID, &d.StoreName, &d.StoreSKU, &d.ProductName, &d.CurrentPrice, &d.OriginalPrice,
		&d.ProductURL, &d.AffiliateURL, &d.ImageURL, &d.Brand, &cp, &canCat, &meta, &d.IsInStock, &lastScraped)
	if err != nil {
		return nil, err
	}
	d.CategoryPath = cp
	d.CanonicalCategory = canCat
	d.Metadata = json.RawMessage(meta)
	d.LastScraped = string(lastScraped)
	if d.OriginalPrice != nil && *d.OriginalPrice > 0 && *d.OriginalPrice > d.CurrentPrice {
		pct := (1 - d.CurrentPrice/(*d.OriginalPrice)) * 100
		if pct > 0 {
			d.DiscountPct = &pct
		}
	}
	return &d, nil
}

// PriceHistoryPoint is one recorded price for the price-history chart.
type PriceHistoryPoint struct {
	Price      float64 `json:"price"`
	RecordedAt string  `json:"recorded_at"`
}

// PriceHistoryResult is the response for GET /deals/:id/price-history.
type PriceHistoryResult struct {
	Points       []PriceHistoryPoint `json:"points"`
	LowestPrice  float64             `json:"lowest_price"`
	HighestPrice float64             `json:"highest_price"`
	AvgPrice     float64             `json:"avg_price"`
	PriceDropped bool                `json:"price_dropped"`
}

// GetPriceHistory returns price history for a listing (deal id = listing id) for charts and summary stats.
func (db *DB) GetPriceHistory(ctx context.Context, listingID int) (*PriceHistoryResult, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT price, recorded_at::text
		FROM price_history
		WHERE listing_id = $1
		ORDER BY recorded_at ASC
	`, listingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []PriceHistoryPoint
	var sum float64
	lowest, highest := 0.0, 0.0
	for rows.Next() {
		var p PriceHistoryPoint
		if err := rows.Scan(&p.Price, &p.RecordedAt); err != nil {
			return nil, err
		}
		points = append(points, p)
		sum += p.Price
		if lowest == 0 || p.Price < lowest {
			lowest = p.Price
		}
		if p.Price > highest {
			highest = p.Price
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	n := float64(len(points))
	avg := 0.0
	if n > 0 {
		avg = sum / n
	}
	priceDropped := false
	if len(points) >= 2 {
		last, prev := points[len(points)-1].Price, points[len(points)-2].Price
		priceDropped = last < prev
	}

	return &PriceHistoryResult{
		Points:       points,
		LowestPrice:  lowest,
		HighestPrice: highest,
		AvgPrice:     avg,
		PriceDropped: priceDropped,
	}, nil
}

// StoreWithCount includes deal count for API
type StoreWithCount struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	BaseURL     string `json:"base_url"`
	DealCount   int    `json:"deal_count"`
	LastScraped string `json:"last_scraped"`
}

// StoreWithCountAndHealth adds last_scrape_result_count for admin dashboard health.
type StoreWithCountAndHealth struct {
	ID                    int     `json:"id"`
	Name                  string  `json:"name"`
	StoreType             string  `json:"store_type"`
	DealCount             int     `json:"deal_count"`
	LastScraped           string  `json:"last_scraped"`
	LastScrapeResultCount *int    `json:"last_scrape_result_count,omitempty"`
}

// DashboardStats holds aggregate counts for the admin dashboard.
type DashboardStats struct {
	TotalStores      int `json:"total_stores"`
	TotalListings    int `json:"total_listings"`
	InStockListings  int `json:"in_stock_listings"`
	EnrichedListings int `json:"enriched_listings"` // canonical_category set
}

func (db *DB) GetStoresWithCounts(ctx context.Context) ([]StoreWithCount, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT s.id, s.name, s.base_url,
			COUNT(l.id) as deal_count,
			MAX(l.last_scraped)::text as last_scraped
		FROM stores s
		LEFT JOIN store_listings l ON l.store_id = s.id
		GROUP BY s.id, s.name, s.base_url
		ORDER BY s.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stores []StoreWithCount
	for rows.Next() {
		var s StoreWithCount
		var lastScraped *string
		if err := rows.Scan(&s.ID, &s.Name, &s.BaseURL, &s.DealCount, &lastScraped); err != nil {
			return nil, err
		}
		if lastScraped != nil {
			s.LastScraped = *lastScraped
		}
		stores = append(stores, s)
	}
	return stores, rows.Err()
}

// GetStoresWithCountsAndHealth returns stores with deal counts and last_scrape_result_count for admin dashboard.
func (db *DB) GetStoresWithCountsAndHealth(ctx context.Context) ([]StoreWithCountAndHealth, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT s.id, s.name, COALESCE(s.store_type, 'jensonusa'),
			COUNT(l.id)::int as deal_count,
			COALESCE(MAX(l.last_scraped)::text, ''),
			s.last_scrape_result_count
		FROM stores s
		LEFT JOIN store_listings l ON l.store_id = s.id
		GROUP BY s.id, s.name, s.store_type, s.last_scrape_result_count
		ORDER BY s.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stores []StoreWithCountAndHealth
	for rows.Next() {
		var s StoreWithCountAndHealth
		if err := rows.Scan(&s.ID, &s.Name, &s.StoreType, &s.DealCount, &s.LastScraped, &s.LastScrapeResultCount); err != nil {
			return nil, err
		}
		stores = append(stores, s)
	}
	return stores, rows.Err()
}

// GetDashboardStats returns aggregate counts for the admin dashboard, including enrichment coverage.
func (db *DB) GetDashboardStats(ctx context.Context) (DashboardStats, error) {
	var stats DashboardStats
	err := db.pool.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*)::int FROM stores),
			(SELECT COUNT(*)::int FROM store_listings),
			(SELECT COUNT(*)::int FROM store_listings WHERE is_in_stock),
			(SELECT COUNT(*)::int FROM store_listings WHERE canonical_category IS NOT NULL AND array_length(canonical_category, 1) > 0)
	`).Scan(&stats.TotalStores, &stats.TotalListings, &stats.InStockListings, &stats.EnrichedListings)
	if err != nil {
		return DashboardStats{}, err
	}
	return stats, nil
}

// ScrapeJob represents a single scrape run (one store).
type ScrapeJob struct {
	ID                int       `json:"id"`
	StoreID           *int      `json:"store_id,omitempty"`
	StoreName         string    `json:"store_name"`
	Status            string    `json:"status"` // running, completed, failed
	StartedAt         string    `json:"started_at"`
	CompletedAt       *string   `json:"completed_at,omitempty"`
	ListingsFound     *int      `json:"listings_found,omitempty"`
	ListingsUpserted  *int      `json:"listings_upserted,omitempty"`
	Errors            []string  `json:"errors,omitempty"`
	Warnings          []string  `json:"warnings,omitempty"`
	TriggeredBy       string    `json:"triggered_by"` // manual, cron
}

// CreateScrapeJob inserts a new scrape job (status=running) and returns its id.
func (db *DB) CreateScrapeJob(ctx context.Context, storeID *int, storeName, triggeredBy string) (int, error) {
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO scrape_jobs (store_id, store_name, status, triggered_by)
		VALUES ($1, $2, 'running', $3)
		RETURNING id
	`, storeID, storeName, triggeredBy).Scan(&id)
	return id, err
}

// UpdateScrapeJob sets status, completed_at, counts, and messages for a job.
func (db *DB) UpdateScrapeJob(ctx context.Context, id int, status string, listingsFound, listingsUpserted *int, errors, warnings []string) error {
	var errSlice, warnSlice interface{}
	if len(errors) > 0 {
		errSlice = pq.Array(errors)
	} else {
		errSlice = pq.Array([]string{})
	}
	if len(warnings) > 0 {
		warnSlice = pq.Array(warnings)
	} else {
		warnSlice = pq.Array([]string{})
	}
	_, err := db.pool.Exec(ctx, `
		UPDATE scrape_jobs SET
			status = $1,
			completed_at = NOW(),
			listings_found = $2,
			listings_upserted = $3,
			errors = $4,
			warnings = $5
		WHERE id = $6
	`, status, listingsFound, listingsUpserted, errSlice, warnSlice, id)
	return err
}

// GetScrapeJobs returns recent scrape jobs (newest first). storeID 0 means all stores.
func (db *DB) GetScrapeJobs(ctx context.Context, storeID int, limit, offset int) ([]ScrapeJob, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, store_id, store_name, status, started_at::text, completed_at::text,
			listings_found, listings_upserted, COALESCE(errors, '{}'), COALESCE(warnings, '{}'), triggered_by
		FROM scrape_jobs
		WHERE ($1 = 0 OR store_id = $1)
		ORDER BY started_at DESC LIMIT $2 OFFSET $3
	`, storeID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []ScrapeJob
	for rows.Next() {
		var j ScrapeJob
		var completedAt *string
		var errArr, warnArr pgtype.FlatArray[string]
		if err := rows.Scan(&j.ID, &j.StoreID, &j.StoreName, &j.Status, &j.StartedAt, &completedAt, &j.ListingsFound, &j.ListingsUpserted, &errArr, &warnArr, &j.TriggeredBy); err != nil {
			return nil, err
		}
		j.CompletedAt = completedAt
		j.Errors = []string(errArr)
		j.Warnings = []string(warnArr)
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}

// CancelScrapeJob sets status='cancelled' and completed_at=NOW() for a scrape job that is currently 'running'.
// Returns (true, nil) if the job was updated, (false, nil) if it was not running or not found.
func (db *DB) CancelScrapeJob(ctx context.Context, id int) (bool, error) {
	res, err := db.pool.Exec(ctx, `
		UPDATE scrape_jobs SET status = 'cancelled', completed_at = NOW()
		WHERE id = $1 AND status = 'running'
	`, id)
	if err != nil {
		return false, err
	}
	return res.RowsAffected() > 0, nil
}

// GetScrapeJobByID returns one scrape job by id, or nil if not found.
func (db *DB) GetScrapeJobByID(ctx context.Context, id int) (*ScrapeJob, error) {
	var j ScrapeJob
	var completedAt *string
	var errArr, warnArr pgtype.FlatArray[string]
	err := db.pool.QueryRow(ctx, `
		SELECT id, store_id, store_name, status, started_at::text, completed_at::text,
			listings_found, listings_upserted, COALESCE(errors, '{}'), COALESCE(warnings, '{}'), triggered_by
		FROM scrape_jobs WHERE id = $1
	`, id).Scan(&j.ID, &j.StoreID, &j.StoreName, &j.Status, &j.StartedAt, &completedAt, &j.ListingsFound, &j.ListingsUpserted, &errArr, &warnArr, &j.TriggeredBy)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	j.CompletedAt = completedAt
	j.Errors = []string(errArr)
	j.Warnings = []string(warnArr)
	return &j, nil
}

// EnrichJob represents a single enrichment run (optionally scoped by store_type).
type EnrichJob struct {
	ID                int      `json:"id"`
	StoreType         *string  `json:"store_type,omitempty"`
	Status            string   `json:"status"` // running, completed, failed
	StartedAt         string   `json:"started_at"`
	CompletedAt       *string  `json:"completed_at,omitempty"`
	ListingsProcessed *int     `json:"listings_processed,omitempty"`
	ListingsEnriched  *int     `json:"listings_enriched,omitempty"`
	Errors            []string `json:"errors,omitempty"`
	TriggeredBy       string   `json:"triggered_by"` // manual, cron
	ForceMode         bool     `json:"force_mode"`
}

// CreateEnrichJob inserts a new enrich job (status=running) and returns its id.
func (db *DB) CreateEnrichJob(ctx context.Context, storeType *string, triggeredBy string, forceMode bool) (int, error) {
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO enrich_jobs (store_type, status, triggered_by, force_mode)
		VALUES ($1, 'running', $2, $3)
		RETURNING id
	`, storeType, triggeredBy, forceMode).Scan(&id)
	return id, err
}

// UpdateEnrichJob sets status, completed_at, counts, and errors for a job.
func (db *DB) UpdateEnrichJob(ctx context.Context, id int, status string, processed, enriched *int, errors []string) error {
	var errSlice interface{}
	if len(errors) > 0 {
		errSlice = pq.Array(errors)
	} else {
		errSlice = pq.Array([]string{})
	}
	_, err := db.pool.Exec(ctx, `
		UPDATE enrich_jobs SET
			status = $1,
			completed_at = NOW(),
			listings_processed = $2,
			listings_enriched = $3,
			errors = $4
		WHERE id = $5
	`, status, processed, enriched, errSlice, id)
	return err
}

// MarkStaleJobs sets status='stale' and completed_at=NOW() for any scrape_jobs and enrich_jobs that are still 'running'.
// Call on API startup to clean up jobs orphaned by a process crash/restart.
func (db *DB) MarkStaleJobs(ctx context.Context) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE enrich_jobs
		SET status = 'stale', completed_at = NOW(),
			errors = array_append(COALESCE(errors, '{}'), 'marked stale: process restarted while job was running')
		WHERE status = 'running'
	`)
	if err != nil {
		return err
	}
	_, err = db.pool.Exec(ctx, `
		UPDATE scrape_jobs
		SET status = 'stale', completed_at = NOW(),
			errors = array_append(COALESCE(errors, '{}'), 'marked stale: process restarted while job was running')
		WHERE status = 'running'
	`)
	return err
}

// CancelEnrichJob sets status='cancelled' and completed_at=NOW() for an enrich job that is currently 'running'.
// Returns (true, nil) if the job was updated, (false, nil) if it was not running or not found.
func (db *DB) CancelEnrichJob(ctx context.Context, id int) (bool, error) {
	res, err := db.pool.Exec(ctx, `
		UPDATE enrich_jobs SET status = 'cancelled', completed_at = NOW()
		WHERE id = $1 AND status = 'running'
	`, id)
	if err != nil {
		return false, err
	}
	return res.RowsAffected() > 0, nil
}

// GetEnrichJobs returns recent enrich jobs (newest first), paginated.
func (db *DB) GetEnrichJobs(ctx context.Context, limit, offset int) ([]EnrichJob, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, store_type, status, started_at::text, completed_at::text,
			listings_processed, listings_enriched, COALESCE(errors, '{}'), triggered_by, force_mode
		FROM enrich_jobs
		ORDER BY started_at DESC LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []EnrichJob
	for rows.Next() {
		var j EnrichJob
		var completedAt *string
		var errArr pgtype.FlatArray[string]
		if err := rows.Scan(&j.ID, &j.StoreType, &j.Status, &j.StartedAt, &completedAt, &j.ListingsProcessed, &j.ListingsEnriched, &errArr, &j.TriggeredBy, &j.ForceMode); err != nil {
			return nil, err
		}
		j.CompletedAt = completedAt
		j.Errors = []string(errArr)
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}

// GetEnrichJobByID returns one enrich job by id, or nil if not found.
func (db *DB) GetEnrichJobByID(ctx context.Context, id int) (*EnrichJob, error) {
	var j EnrichJob
	var completedAt *string
	var errArr pgtype.FlatArray[string]
	err := db.pool.QueryRow(ctx, `
		SELECT id, store_type, status, started_at::text, completed_at::text,
			listings_processed, listings_enriched, COALESCE(errors, '{}'), triggered_by, force_mode
		FROM enrich_jobs WHERE id = $1
	`, id).Scan(&j.ID, &j.StoreType, &j.Status, &j.StartedAt, &completedAt, &j.ListingsProcessed, &j.ListingsEnriched, &errArr, &j.TriggeredBy, &j.ForceMode)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	j.CompletedAt = completedAt
	j.Errors = []string(errArr)
	return &j, nil
}

func (db *DB) GetBrands(ctx context.Context) ([]string, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT DISTINCT brand FROM store_listings
		WHERE brand IS NOT NULL AND brand != ''
		ORDER BY brand
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var brands []string
	for rows.Next() {
		var b string
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		brands = append(brands, b)
	}
	return brands, rows.Err()
}

func (db *DB) GetCategories(ctx context.Context) ([]string, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT DISTINCT c
		FROM store_listings, unnest(COALESCE(category_path, '{}')) AS c
		WHERE c IS NOT NULL AND c != ''
		ORDER BY c
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []string
	for rows.Next() {
		var cat string
		if err := rows.Scan(&cat); err != nil {
			return nil, err
		}
		categories = append(categories, cat)
	}
	return categories, rows.Err()
}

// GetCanonicalCategories returns distinct canonical_category paths as "Parent > Child" strings for faceted filter UI.
func (db *DB) GetCanonicalCategories(ctx context.Context) ([]string, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT DISTINCT array_to_string(canonical_category, ' > ')
		FROM store_listings
		WHERE canonical_category IS NOT NULL AND array_length(canonical_category, 1) > 0
		ORDER BY 1
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		list = append(list, s)
	}
	return list, rows.Err()
}

// StoreTypesWithEnrichers lists store_type values that have a scraper enricher (PDP enrichment).
// When adding an enricher for a new store, add its store_type here.
var StoreTypesWithEnrichers = []string{"jensonusa", "worldwidecyclery", "backcountry"}

// ListingForEnrichment is a listing that needs PDP enrichment
type ListingForEnrichment struct {
	ID         int
	StoreID    int
	StoreType  string
	ProductURL string
}

func (db *DB) GetListingsNeedingEnrichment(ctx context.Context, limit int, force bool) ([]ListingForEnrichment, error) {
	if limit <= 0 {
		limit = 50
	}
	if len(StoreTypesWithEnrichers) == 0 {
		return nil, nil
	}
	query := `
		SELECT l.id, l.store_id, COALESCE(s.store_type, 'jensonusa'), l.product_url
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE l.product_url IS NOT NULL AND l.product_url != ''
		  AND s.store_type = ANY($2)
	`
	if !force {
		query += ` AND (l.last_enriched_at IS NULL OR l.last_enriched_at < NOW() - INTERVAL '7 days')`
	}
	query += `
		ORDER BY l.last_enriched_at NULLS FIRST, l.last_scraped DESC
		LIMIT $1
	`
	rows, err := db.pool.Query(ctx, query, limit, pq.Array(StoreTypesWithEnrichers))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var listings []ListingForEnrichment
	for rows.Next() {
		var l ListingForEnrichment
		if err := rows.Scan(&l.ID, &l.StoreID, &l.StoreType, &l.ProductURL); err != nil {
			return nil, err
		}
		listings = append(listings, l)
	}
	return listings, rows.Err()
}

// GetListingsNeedingEnrichmentForStore returns listings that need enrichment for a single store (by store_type).
// Used to run enrichment for an entire store. Caller should ensure storeType is in StoreTypesWithEnrichers.
func (db *DB) GetListingsNeedingEnrichmentForStore(ctx context.Context, storeType string, limit int, force bool) ([]ListingForEnrichment, error) {
	if limit <= 0 {
		limit = 50
	}
	if storeType == "" {
		return nil, nil
	}
	query := `
		SELECT l.id, l.store_id, COALESCE(s.store_type, 'jensonusa'), l.product_url
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE l.product_url IS NOT NULL AND l.product_url != ''
		  AND s.store_type = $2
	`
	if !force {
		query += ` AND (l.last_enriched_at IS NULL OR l.last_enriched_at < NOW() - INTERVAL '7 days')`
	}
	query += `
		ORDER BY l.last_enriched_at NULLS FIRST, l.last_scraped DESC
		LIMIT $1
	`
	rows, err := db.pool.Query(ctx, query, limit, storeType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var listings []ListingForEnrichment
	for rows.Next() {
		var l ListingForEnrichment
		if err := rows.Scan(&l.ID, &l.StoreID, &l.StoreType, &l.ProductURL); err != nil {
			return nil, err
		}
		listings = append(listings, l)
	}
	return listings, rows.Err()
}

func (db *DB) UpdateListingEnrichment(ctx context.Context, id int, categoryPath []string, rawSpecs map[string]string, unavailable bool, description *string) error {
	if unavailable {
		_, err := db.pool.Exec(ctx, `
			UPDATE store_listings
			SET is_in_stock = false, last_enriched_at = NOW()
			WHERE id = $1
		`, id)
		return err
	}

	// Fetch existing metadata so we can merge PDP-derived specs into it.
	var existingMeta []byte
	if err := db.pool.QueryRow(ctx, `SELECT metadata FROM store_listings WHERE id = $1`, id).Scan(&existingMeta); err != nil {
		// If the row disappeared between selection and update, treat as non-fatal for the caller.
		if err.Error() == "no rows in result set" {
			return nil
		}
		return err
	}

	mergedMeta := metadata.MergeSpecs(existingMeta, rawSpecs)
	if description != nil && *description != "" {
		mergedMeta = metadata.MergeDescription(mergedMeta, *description)
	}

	// If we got a non-empty categoryPath, update category_path and canonical_category; otherwise leave them unchanged.
	if len(categoryPath) > 0 {
		canonicalCat := taxonomy.Map(categoryPath)
		_, err := db.pool.Exec(ctx, `
			UPDATE store_listings
			SET category_path = $1, canonical_category = $2, metadata = $3, last_enriched_at = NOW()
			WHERE id = $4
		`, pq.Array(categoryPath), pq.Array(canonicalCat), mergedMeta, id)
		return err
	}

	// Only specs (or just last_enriched_at) to update.
	if mergedMeta != nil {
		_, err := db.pool.Exec(ctx, `
			UPDATE store_listings
			SET metadata = $1, last_enriched_at = NOW()
			WHERE id = $2
		`, mergedMeta, id)
		return err
	}

	_, err := db.pool.Exec(ctx, `
		UPDATE store_listings
		SET last_enriched_at = NOW()
		WHERE id = $1
	`, id)
	return err
}

// GetListingEnrichmentInfo returns product_url and store_type for a listing by id. Used for single-listing enrichment.
func (db *DB) GetListingEnrichmentInfo(ctx context.Context, id int) (productURL, storeType string, err error) {
	err = db.pool.QueryRow(ctx, `
		SELECT l.product_url, COALESCE(s.store_type, 'jensonusa')
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE l.id = $1
	`, id).Scan(&productURL, &storeType)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return "", "", nil
		}
		return "", "", err
	}
	return productURL, storeType, nil
}

// ListingForLLM holds data needed to run LLM extraction (product name, metadata, canonical category).
// Used after enrichment to optionally run LLM spec extraction.
type ListingForLLM struct {
	ProductName       string
	Metadata          []byte
	CanonicalCategory []string
}

// GetListingForLLM returns listing data needed for LLM extraction. Call after UpdateListingEnrichment.
func (db *DB) GetListingForLLM(ctx context.Context, id int) (*ListingForLLM, error) {
	var productName string
	var meta []byte
	var cat pgtype.FlatArray[string]
	err := db.pool.QueryRow(ctx, `
		SELECT COALESCE(product_name, ''), COALESCE(metadata, '{}'), COALESCE(canonical_category, '{}'::text[])
		FROM store_listings
		WHERE id = $1
	`, id).Scan(&productName, &meta, &cat)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	return &ListingForLLM{
		ProductName:       productName,
		Metadata:          meta,
		CanonicalCategory: cat,
	}, nil
}

// UpdateListingLLMSpecs merges LLM extraction output into a listing's metadata and persists.
// Only fills spec gaps; does not overwrite existing spec-table data.
func (db *DB) UpdateListingLLMSpecs(ctx context.Context, id int, llmResult map[string]interface{}) error {
	var existing []byte
	if err := db.pool.QueryRow(ctx, `SELECT COALESCE(metadata, '{}') FROM store_listings WHERE id = $1`, id).Scan(&existing); err != nil {
		if err.Error() == "no rows in result set" {
			return nil
		}
		return err
	}
	merged := metadata.MergeLLMSpecs(existing, llmResult)
	_, err := db.pool.Exec(ctx, `UPDATE store_listings SET metadata = $1 WHERE id = $2`, merged, id)
	return err
}

// UpdateListingLLMOverrides merges manual overrides into a listing's metadata.llm_overrides.
func (db *DB) UpdateListingLLMOverrides(ctx context.Context, id int, overrides map[string]interface{}) error {
	var existing []byte
	if err := db.pool.QueryRow(ctx, `SELECT COALESCE(metadata, '{}') FROM store_listings WHERE id = $1`, id).Scan(&existing); err != nil {
		if err.Error() == "no rows in result set" {
			return nil
		}
		return err
	}
	merged := metadata.MergeLLMOverrides(existing, overrides)
	_, err := db.pool.Exec(ctx, `UPDATE store_listings SET metadata = $1 WHERE id = $2`, merged, id)
	return err
}

// ListListingIDsByCanonicalCategory returns listing IDs with the given canonical_category. Used for re-running LLM extraction.
func (db *DB) ListListingIDsByCanonicalCategory(ctx context.Context, canonicalCategory []string) ([]int, error) {
	if len(canonicalCategory) == 0 {
		return nil, nil
	}
	rows, err := db.pool.Query(ctx, `SELECT id FROM store_listings WHERE canonical_category = $1`, pq.Array(canonicalCategory))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// BackfillBrands updates store_listings.brand using the given normalizer (e.g. brand.Normalize).
// Returns the number of rows updated.
func (db *DB) BackfillBrands(ctx context.Context, normalize func(string) string) (int, error) {
	rows, err := db.pool.Query(ctx, `SELECT id, brand FROM store_listings WHERE brand IS NOT NULL AND brand != ''`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var id int
	var b string
	updated := 0
	for rows.Next() {
		if err := rows.Scan(&id, &b); err != nil {
			return updated, err
		}
		norm := normalize(b)
		if norm == b {
			continue
		}
		_, err := db.pool.Exec(ctx, `UPDATE store_listings SET brand = $1 WHERE id = $2`, norm, id)
		if err != nil {
			return updated, err
		}
		updated++
	}
	return updated, rows.Err()
}

// BackfillMetadata sets store_listings.metadata from product_name using the given extractor (e.g. metadata.Extract).
// Returns the number of rows updated. Run once to populate metadata for listings that were scraped before extraction existed.
func (db *DB) BackfillMetadata(ctx context.Context, extractFn func(productName string) []byte) (int, error) {
	rows, err := db.pool.Query(ctx, `SELECT id, COALESCE(product_name, '') FROM store_listings`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var id int
	var productName string
	updated := 0
	for rows.Next() {
		if err := rows.Scan(&id, &productName); err != nil {
			return updated, err
		}
		meta := extractFn(productName)
		_, err := db.pool.Exec(ctx, `UPDATE store_listings SET metadata = $1 WHERE id = $2`, meta, id)
		if err != nil {
			return updated, err
		}
		updated++
	}
	return updated, rows.Err()
}

// BackfillCanonicalCategories sets canonical_category from category_path using the given mapper (e.g. taxonomy.Map).
// Returns the number of rows updated.
func (db *DB) BackfillCanonicalCategories(ctx context.Context, mapFn func([]string) []string) (int, error) {
	rows, err := db.pool.Query(ctx, `SELECT id, COALESCE(category_path, '{}'), COALESCE(canonical_category, '{}') FROM store_listings`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var id int
	var cp, existing pgtype.FlatArray[string]
	updated := 0
	for rows.Next() {
		if err := rows.Scan(&id, &cp, &existing); err != nil {
			return updated, err
		}
		raw := []string(cp)
		canonical := mapFn(raw)
		if sliceEqual(canonical, []string(existing)) {
			continue
		}
		_, err := db.pool.Exec(ctx, `UPDATE store_listings SET canonical_category = $1 WHERE id = $2`, pq.Array(canonical), id)
		if err != nil {
			return updated, err
		}
		updated++
	}
	return updated, rows.Err()
}

// BackfillLLMSpecs populates metadata.llm_specs from metadata.specs for listings that were
// LLM-enriched before the llm_specs split. For each listing with llm_confidence but no llm_specs,
// copies profile-defined field values from specs into llm_specs. Returns the number of rows updated.
func (db *DB) BackfillLLMSpecs(ctx context.Context) (int, error) {
	profiles, err := db.ListLLMPromptProfiles(ctx)
	if err != nil {
		return 0, fmt.Errorf("list profiles: %w", err)
	}
	profileKeys := make(map[string]map[string]struct{}) // "Bikes>Mountain" -> set of keys
	for _, p := range profiles {
		if !p.Enabled {
			continue
		}
		keys := extractSchemaKeys(p.ExtractionSchema)
		if len(keys) > 0 {
			catKey := strings.Join(p.CanonicalCategory, ">")
			profileKeys[catKey] = keys
		}
	}
	if len(profileKeys) == 0 {
		return 0, nil
	}

	rows, err := db.pool.Query(ctx, `
		SELECT l.id, l.canonical_category, l.metadata
		FROM store_listings l
		WHERE l.metadata->'llm_confidence' IS NOT NULL
		  AND (l.metadata->'llm_specs' IS NULL OR jsonb_typeof(l.metadata->'llm_specs') != 'object')
		  AND l.metadata->'specs' IS NOT NULL
		  AND jsonb_typeof(l.metadata->'specs') = 'object'
	`)
	if err != nil {
		return 0, fmt.Errorf("query listings: %w", err)
	}
	defer rows.Close()

	updated := 0
	for rows.Next() {
		var id int
		var cat pgtype.FlatArray[string]
		var meta []byte
		if err := rows.Scan(&id, &cat, &meta); err != nil {
			return updated, err
		}
		catKey := strings.Join([]string(cat), ">")
		allowed, ok := profileKeys[catKey]
		if !ok {
			continue
		}
		var base map[string]interface{}
		if err := json.Unmarshal(meta, &base); err != nil {
			continue
		}
		specs, _ := base["specs"].(map[string]interface{})
		if specs == nil {
			continue
		}
		llmSpecs := make(map[string]interface{})
		for k, v := range specs {
			if _, ok := allowed[k]; ok && v != nil && fmt.Sprint(v) != "" {
				llmSpecs[k] = fmt.Sprint(v)
			}
		}
		if len(llmSpecs) == 0 {
			continue
		}
		base["llm_specs"] = llmSpecs
		newMeta, err := json.Marshal(base)
		if err != nil {
			continue
		}
		_, err = db.pool.Exec(ctx, `UPDATE store_listings SET metadata = $1 WHERE id = $2`, newMeta, id)
		if err != nil {
			return updated, err
		}
		updated++
	}
	return updated, rows.Err()
}

// extractSchemaKeys returns the set of extractable field keys from extraction_schema JSON,
// excluding "confidence".
func extractSchemaKeys(raw json.RawMessage) map[string]struct{} {
	var schema struct {
		Fields []struct {
			Key string `json:"key"`
		} `json:"fields"`
	}
	if err := json.Unmarshal(raw, &schema); err != nil {
		return nil
	}
	out := make(map[string]struct{})
	for _, f := range schema.Fields {
		if f.Key != "" && f.Key != "confidence" {
			out[f.Key] = struct{}{}
		}
	}
	return out
}

// mapsEqual performs deep equality for map[string]interface{} (e.g. metadata JSONB).
func mapsEqual(a, b map[string]interface{}) bool {
	return reflect.DeepEqual(a, b)
}

func sliceEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// CategoryMapping is one rule: raw_keywords (substring match) -> canonical path. Priority: higher = evaluated first.
type CategoryMapping struct {
	ID          int      `json:"id"`
	RawKeywords []string `json:"raw_keywords"`
	Canonical   []string `json:"canonical"`
	Priority    int      `json:"priority"`
	CreatedAt   string   `json:"created_at"`
	UpdatedAt   string   `json:"updated_at"`
}

// ListCategoryMappings returns all mappings ordered by priority DESC, then id (for stable ordering).
func (db *DB) ListCategoryMappings(ctx context.Context) ([]CategoryMapping, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, COALESCE(raw_keywords, '{}'), COALESCE(canonical, '{}'), priority, created_at::text, updated_at::text
		FROM category_mappings ORDER BY priority DESC, id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CategoryMapping
	for rows.Next() {
		var m CategoryMapping
		var raw, canon pgtype.FlatArray[string]
		if err := rows.Scan(&m.ID, &raw, &canon, &m.Priority, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		m.RawKeywords = []string(raw)
		m.Canonical = []string(canon)
		out = append(out, m)
	}
	return out, rows.Err()
}

// GetCategoryMapping returns one mapping by id, or nil if not found.
func (db *DB) GetCategoryMapping(ctx context.Context, id int) (*CategoryMapping, error) {
	var m CategoryMapping
	var raw, canon pgtype.FlatArray[string]
	err := db.pool.QueryRow(ctx, `
		SELECT id, COALESCE(raw_keywords, '{}'), COALESCE(canonical, '{}'), priority, created_at::text, updated_at::text
		FROM category_mappings WHERE id = $1
	`, id).Scan(&m.ID, &raw, &canon, &m.Priority, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	m.RawKeywords = []string(raw)
	m.Canonical = []string(canon)
	return &m, nil
}

// CreateCategoryMapping inserts a mapping and returns its id.
func (db *DB) CreateCategoryMapping(ctx context.Context, rawKeywords, canonical []string, priority int) (int, error) {
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO category_mappings (raw_keywords, canonical, priority) VALUES ($1, $2, $3) RETURNING id
	`, pq.Array(rawKeywords), pq.Array(canonical), priority).Scan(&id)
	return id, err
}

// UpdateCategoryMapping updates a mapping by id.
func (db *DB) UpdateCategoryMapping(ctx context.Context, id int, rawKeywords, canonical []string, priority int) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE category_mappings SET raw_keywords = $1, canonical = $2, priority = $3, updated_at = NOW() WHERE id = $4
	`, pq.Array(rawKeywords), pq.Array(canonical), priority, id)
	return err
}

// BatchUpdateCategoryMappingPriorities updates priority for multiple mappings in a single transaction.
func (db *DB) BatchUpdateCategoryMappingPriorities(ctx context.Context, updates []struct{ ID int; Priority int }) error {
	if len(updates) == 0 {
		return nil
	}
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, u := range updates {
		_, err := tx.Exec(ctx, `
			UPDATE category_mappings SET priority = $1, updated_at = NOW() WHERE id = $2
		`, u.Priority, u.ID)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// DeleteCategoryMapping deletes a mapping by id.
func (db *DB) DeleteCategoryMapping(ctx context.Context, id int) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM category_mappings WHERE id = $1`, id)
	return err
}

// SeedCategoryMappingsIfEmpty inserts mappings from the given slice only if category_mappings is empty. Returns true if seeded.
func (db *DB) SeedCategoryMappingsIfEmpty(ctx context.Context, mappings []struct{ Raw []string; Canonical []string }) (bool, error) {
	var n int
	if err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM category_mappings`).Scan(&n); err != nil {
		return false, err
	}
	if n > 0 {
		return false, nil
	}
	// Insert in order; priority = 1000 - i so first mapping has highest priority.
	for i, m := range mappings {
		priority := 1000 - i
		_, err := db.pool.Exec(ctx, `INSERT INTO category_mappings (raw_keywords, canonical, priority) VALUES ($1, $2, $3)`,
			pq.Array(m.Raw), pq.Array(m.Canonical), priority)
		if err != nil {
			return false, err
		}
	}
	return true, nil
}

// SpecFilterConfig is one row in spec_filter_config: visibility, merging, label, sort order per spec key.
type SpecFilterConfig struct {
	ID           int     `json:"id"`
	SpecKey      string  `json:"spec_key"`
	Visible      bool    `json:"visible"`
	MergeInto    *string `json:"merge_into,omitempty"`
	DisplayLabel *string `json:"display_label,omitempty"`
	SortOrder    int     `json:"sort_order"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
}

// ListSpecFilterConfigs returns all spec_filter_config rows ordered by sort_order DESC, then spec_key.
func (db *DB) ListSpecFilterConfigs(ctx context.Context) ([]SpecFilterConfig, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, spec_key, visible, merge_into, display_label, sort_order, created_at::text, updated_at::text
		FROM spec_filter_config ORDER BY sort_order DESC, spec_key
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SpecFilterConfig
	for rows.Next() {
		var c SpecFilterConfig
		if err := rows.Scan(&c.ID, &c.SpecKey, &c.Visible, &c.MergeInto, &c.DisplayLabel, &c.SortOrder, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetSpecFilterConfigByID returns one spec_filter_config by id, or nil if not found.
func (db *DB) GetSpecFilterConfigByID(ctx context.Context, id int) (*SpecFilterConfig, error) {
	var c SpecFilterConfig
	err := db.pool.QueryRow(ctx, `
		SELECT id, spec_key, visible, merge_into, display_label, sort_order, created_at::text, updated_at::text
		FROM spec_filter_config WHERE id = $1
	`, id).Scan(&c.ID, &c.SpecKey, &c.Visible, &c.MergeInto, &c.DisplayLabel, &c.SortOrder, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

// CreateSpecFilterConfig inserts a spec_filter_config row and returns its id.
func (db *DB) CreateSpecFilterConfig(ctx context.Context, specKey string, visible bool, mergeInto, displayLabel *string, sortOrder int) (int, error) {
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO spec_filter_config (spec_key, visible, merge_into, display_label, sort_order)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, specKey, visible, mergeInto, displayLabel, sortOrder).Scan(&id)
	return id, err
}

// UpdateSpecFilterConfig updates a spec_filter_config by id.
func (db *DB) UpdateSpecFilterConfig(ctx context.Context, id int, specKey string, visible bool, mergeInto, displayLabel *string, sortOrder int) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE spec_filter_config SET spec_key = $1, visible = $2, merge_into = $3, display_label = $4, sort_order = $5, updated_at = NOW() WHERE id = $6
	`, specKey, visible, mergeInto, displayLabel, sortOrder, id)
	return err
}

// DeleteSpecFilterConfig deletes a spec_filter_config by id.
func (db *DB) DeleteSpecFilterConfig(ctx context.Context, id int) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM spec_filter_config WHERE id = $1`, id)
	return err
}

// SpecValueAlias is one row in spec_value_aliases: raw_value -> display_value for a spec key.
type SpecValueAlias struct {
	ID           int    `json:"id"`
	SpecKey      string `json:"spec_key"`
	RawValue     string `json:"raw_value"`
	DisplayValue string `json:"display_value"`
	CreatedAt    string `json:"created_at"`
}

// ListSpecValueAliases returns spec_value_aliases rows, optionally filtered by spec_key.
func (db *DB) ListSpecValueAliases(ctx context.Context, specKey string) ([]SpecValueAlias, error) {
	query := `
		SELECT id, spec_key, raw_value, display_value, created_at::text
		FROM spec_value_aliases
	`
	var rows pgx.Rows
	var err error
	if specKey != "" {
		query += ` WHERE spec_key = $1`
		query += ` ORDER BY spec_key, raw_value`
		rows, err = db.pool.Query(ctx, query, specKey)
	} else {
		query += ` ORDER BY spec_key, raw_value`
		rows, err = db.pool.Query(ctx, query)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SpecValueAlias
	for rows.Next() {
		var a SpecValueAlias
		if err := rows.Scan(&a.ID, &a.SpecKey, &a.RawValue, &a.DisplayValue, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// GetSpecValueAliasByID returns one spec_value_aliases row by id, or nil if not found.
func (db *DB) GetSpecValueAliasByID(ctx context.Context, id int) (*SpecValueAlias, error) {
	var a SpecValueAlias
	err := db.pool.QueryRow(ctx, `
		SELECT id, spec_key, raw_value, display_value, created_at::text
		FROM spec_value_aliases WHERE id = $1
	`, id).Scan(&a.ID, &a.SpecKey, &a.RawValue, &a.DisplayValue, &a.CreatedAt)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	return &a, nil
}

// CreateSpecValueAlias inserts a spec_value_aliases row and returns its id.
func (db *DB) CreateSpecValueAlias(ctx context.Context, specKey, rawValue, displayValue string) (int, error) {
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO spec_value_aliases (spec_key, raw_value, display_value)
		VALUES ($1, $2, $3)
		RETURNING id
	`, specKey, rawValue, displayValue).Scan(&id)
	return id, err
}

// UpdateSpecValueAlias updates a spec_value_aliases row by id.
func (db *DB) UpdateSpecValueAlias(ctx context.Context, id int, specKey, rawValue, displayValue string) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE spec_value_aliases SET spec_key = $1, raw_value = $2, display_value = $3 WHERE id = $4
	`, specKey, rawValue, displayValue, id)
	return err
}

// DeleteSpecValueAlias deletes a spec_value_aliases row by id.
func (db *DB) DeleteSpecValueAlias(ctx context.Context, id int) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM spec_value_aliases WHERE id = $1`, id)
	return err
}

// DiscoveredSpecKey is a spec key found in listings with its product count.
type DiscoveredSpecKey struct {
	SpecKey      string `json:"spec_key"`
	ProductCount int    `json:"product_count"`
}

// GetDiscoveredSpecKeys returns all spec keys present in store_listings.metadata->specs with product counts.
func (db *DB) GetDiscoveredSpecKeys(ctx context.Context) ([]DiscoveredSpecKey, error) {
	rows, err := db.pool.Query(ctx, `
		WITH with_specs AS (
			SELECT l.id, l.metadata
			FROM store_listings l
			WHERE l.metadata->'specs' IS NOT NULL AND jsonb_typeof(l.metadata->'specs') = 'object' AND l.is_in_stock = true
		)
		SELECT spec.key, COUNT(DISTINCT w.id)::int as cnt
		FROM with_specs w
		CROSS JOIN LATERAL jsonb_each_text(w.metadata->'specs') AS spec(key, value)
		WHERE spec.value IS NOT NULL AND trim(spec.value) <> ''
		GROUP BY spec.key
		ORDER BY cnt DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DiscoveredSpecKey
	for rows.Next() {
		var d DiscoveredSpecKey
		if err := rows.Scan(&d.SpecKey, &d.ProductCount); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// RenormalizeSpecs re-applies key aliases and value normalization rules to metadata.specs on all listings.
// Returns the number of rows updated.
func (db *DB) RenormalizeSpecs(ctx context.Context) (int, error) {
	rows, err := db.pool.Query(ctx, `SELECT id, metadata FROM store_listings WHERE metadata->'specs' IS NOT NULL AND jsonb_typeof(metadata->'specs') = 'object'`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	updated := 0
	for rows.Next() {
		var id int
		var meta []byte
		if err := rows.Scan(&id, &meta); err != nil {
			return updated, err
		}
		var base map[string]interface{}
		if err := json.Unmarshal(meta, &base); err != nil {
			continue
		}
		specsRaw, ok := base["specs"]
		if !ok {
			continue
		}
		specsMap, ok := specsRaw.(map[string]interface{})
		if !ok {
			continue
		}
		rawSpecs := make(map[string]string)
		for k, v := range specsMap {
			if s, ok := v.(string); ok {
				rawSpecs[k] = s
			}
		}
		aliased := metadata.AliasSpecKeys(rawSpecs)
		normalized := metadata.NormalizeSpecValues(aliased)
		specsObj := make(map[string]interface{})
		for k, v := range normalized {
			specsObj[k] = v
		}
		base["specs"] = specsObj
		newMeta, err := json.Marshal(base)
		if err != nil {
			continue
		}
		// Only update if the normalized metadata differs from the stored value.
		// Use semantic comparison (unmarshal both) because JSON key ordering can vary.
		var origMeta map[string]interface{}
		if err := json.Unmarshal(meta, &origMeta); err != nil {
			continue
		}
		if mapsEqual(origMeta, base) {
			continue
		}
		_, err = db.pool.Exec(ctx, `UPDATE store_listings SET metadata = $1 WHERE id = $2`, newMeta, id)
		if err != nil {
			return updated, err
		}
		updated++
	}
	return updated, rows.Err()
}

// --- Spec key aliases ---

// SpecKeyAlias maps raw key substring to canonical key. Used for key normalization.
type SpecKeyAlias struct {
	ID           int    `json:"id"`
	RawSubstr    string `json:"raw_substr"`
	CanonicalKey string `json:"canonical_key"`
	Priority     int    `json:"priority"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

// ListSpecKeyAliases returns all spec_key_aliases ordered by priority DESC, then id.
func (db *DB) ListSpecKeyAliases(ctx context.Context) ([]SpecKeyAlias, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, raw_substr, canonical_key, priority, created_at::text, updated_at::text
		FROM spec_key_aliases ORDER BY priority DESC, id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SpecKeyAlias
	for rows.Next() {
		var a SpecKeyAlias
		if err := rows.Scan(&a.ID, &a.RawSubstr, &a.CanonicalKey, &a.Priority, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// SeedSpecKeyAliasesIfEmpty inserts aliases from the given slice only if spec_key_aliases is empty. Returns true if seeded.
func (db *DB) SeedSpecKeyAliasesIfEmpty(ctx context.Context, aliases []struct{ RawSubstr, CanonicalKey string }) (bool, error) {
	var n int
	if err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM spec_key_aliases`).Scan(&n); err != nil {
		return false, err
	}
	if n > 0 {
		return false, nil
	}
	for i, a := range aliases {
		priority := 1000 - i
		_, err := db.pool.Exec(ctx, `INSERT INTO spec_key_aliases (raw_substr, canonical_key, priority) VALUES ($1, $2, $3)`,
			a.RawSubstr, a.CanonicalKey, priority)
		if err != nil {
			return false, err
		}
	}
	return true, nil
}

// --- Spec normalization rules ---

// SpecNormalizationRule is one value normalization rule: spec_key, rule_type, config.
type SpecNormalizationRule struct {
	ID        int                    `json:"id"`
	SpecKey   string                 `json:"spec_key"`
	RuleType  string                 `json:"rule_type"`
	Config    map[string]interface{} `json:"config"`
	Priority  int                    `json:"priority"`
	CreatedAt string                 `json:"created_at"`
	UpdatedAt string                 `json:"updated_at"`
}

// ListSpecNormalizationRules returns all rules ordered by priority DESC, then spec_key, id.
func (db *DB) ListSpecNormalizationRules(ctx context.Context) ([]SpecNormalizationRule, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, spec_key, rule_type, COALESCE(config, '{}'), priority, created_at::text, updated_at::text
		FROM spec_normalization_rules ORDER BY priority DESC, spec_key, id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SpecNormalizationRule
	for rows.Next() {
		var r SpecNormalizationRule
		var configBytes []byte
		if err := rows.Scan(&r.ID, &r.SpecKey, &r.RuleType, &configBytes, &r.Priority, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		if len(configBytes) > 0 {
			_ = json.Unmarshal(configBytes, &r.Config)
		}
		if r.Config == nil {
			r.Config = make(map[string]interface{})
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// CreateSpecNormalizationRule inserts a rule and returns its id.
func (db *DB) CreateSpecNormalizationRule(ctx context.Context, specKey, ruleType string, config map[string]interface{}, priority int) (int, error) {
	configJSON, _ := json.Marshal(config)
	if configJSON == nil {
		configJSON = []byte("{}")
	}
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO spec_normalization_rules (spec_key, rule_type, config, priority)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, specKey, ruleType, configJSON, priority).Scan(&id)
	return id, err
}

// UpdateSpecNormalizationRule updates a rule by id.
func (db *DB) UpdateSpecNormalizationRule(ctx context.Context, id int, specKey, ruleType string, config map[string]interface{}, priority int) error {
	configJSON, _ := json.Marshal(config)
	if configJSON == nil {
		configJSON = []byte("{}")
	}
	_, err := db.pool.Exec(ctx, `
		UPDATE spec_normalization_rules SET spec_key = $1, rule_type = $2, config = $3, priority = $4, updated_at = NOW() WHERE id = $5
	`, specKey, ruleType, configJSON, priority, id)
	return err
}

// DeleteSpecNormalizationRule deletes a rule by id.
func (db *DB) DeleteSpecNormalizationRule(ctx context.Context, id int) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM spec_normalization_rules WHERE id = $1`, id)
	return err
}

// CreateSpecKeyAlias inserts a spec_key_alias and returns its id.
func (db *DB) CreateSpecKeyAlias(ctx context.Context, rawSubstr, canonicalKey string, priority int) (int, error) {
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO spec_key_aliases (raw_substr, canonical_key, priority) VALUES ($1, $2, $3) RETURNING id
	`, rawSubstr, canonicalKey, priority).Scan(&id)
	return id, err
}

// UpdateSpecKeyAlias updates a spec_key_alias by id.
func (db *DB) UpdateSpecKeyAlias(ctx context.Context, id int, rawSubstr, canonicalKey string, priority int) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE spec_key_aliases SET raw_substr = $1, canonical_key = $2, priority = $3, updated_at = NOW() WHERE id = $4
	`, rawSubstr, canonicalKey, priority, id)
	return err
}

// DeleteSpecKeyAlias deletes a spec_key_alias by id.
func (db *DB) DeleteSpecKeyAlias(ctx context.Context, id int) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM spec_key_aliases WHERE id = $1`, id)
	return err
}

// UnmappedCategoryPath is a raw category_path value with count of listings that have no canonical_category.
type UnmappedCategoryPath struct {
	CategoryPath string `json:"category_path"`
	Count        int    `json:"count"`
}

// GetUnmappedCategoryPaths returns distinct category_path values (joined as string) for listings
// where canonical_category IS NULL, with counts. Used for the unmapped items dashboard.
func (db *DB) GetUnmappedCategoryPaths(ctx context.Context, limit int) ([]UnmappedCategoryPath, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := db.pool.Query(ctx, `
		SELECT COALESCE(array_to_string(category_path, ' > '), '(empty)') AS path, COUNT(*)::int
		FROM store_listings
		WHERE (canonical_category IS NULL OR array_length(canonical_category, 1) IS NULL)
		GROUP BY COALESCE(array_to_string(category_path, ' > '), '(empty)')
		ORDER BY COUNT(*) DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []UnmappedCategoryPath
	for rows.Next() {
		var u UnmappedCategoryPath
		if err := rows.Scan(&u.CategoryPath, &u.Count); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// GetUncategorizedCount returns the count of in-stock listings with no canonical_category.
func (db *DB) GetUncategorizedCount(ctx context.Context) (int, error) {
	var n int
	err := db.pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM store_listings
		WHERE (canonical_category IS NULL OR array_length(canonical_category, 1) IS NULL) AND is_in_stock = true
	`).Scan(&n)
	return n, err
}
