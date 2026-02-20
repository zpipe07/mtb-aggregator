package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lib/pq"
)

type Store struct {
	ID         int
	Name       string
	BaseURL    string
	ScrapeURL  string
	StoreType  string
}

type Listing struct {
	StoreID       int
	StoreSKU      string
	ProductName   string
	CurrentPrice  float64
	OriginalPrice *float64
	ProductURL    string
	ImageURL      *string
	Brand         *string
	CategoryPath  []string
	IsInStock     bool
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
	rows, err := db.pool.Query(ctx, `
		SELECT id, name, base_url, scrape_url, COALESCE(store_type, 'jensonusa') FROM stores
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stores []Store
	for rows.Next() {
		var s Store
		if err := rows.Scan(&s.ID, &s.Name, &s.BaseURL, &s.ScrapeURL, &s.StoreType); err != nil {
			return nil, err
		}
		stores = append(stores, s)
	}
	return stores, rows.Err()
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
		INSERT INTO store_listings (store_id, store_sku, product_name, current_price, original_price, product_url, image_url, brand, category_path, is_in_stock, last_scraped)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
		ON CONFLICT (store_id, store_sku) DO UPDATE SET
			product_name = EXCLUDED.product_name,
			current_price = EXCLUDED.current_price,
			original_price = EXCLUDED.original_price,
			product_url = EXCLUDED.product_url,
			image_url = EXCLUDED.image_url,
			brand = EXCLUDED.brand,
			is_in_stock = EXCLUDED.is_in_stock,
			last_scraped = NOW()
		RETURNING id
	`, listing.StoreID, listing.StoreSKU, listing.ProductName, listing.CurrentPrice, listing.OriginalPrice,
		listing.ProductURL, listing.ImageURL, listing.Brand, pq.Array(listing.CategoryPath), listing.IsInStock).Scan(&id)
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
	CategoryPath  []string  `json:"category_path,omitempty"`
	IsInStock     bool      `json:"is_in_stock"`
	DiscountPct   *float64 `json:"discount_pct,omitempty"`
	LastScraped   string   `json:"last_scraped"`
}

// GetDealsParams for filtering
type GetDealsParams struct {
	StoreID     *int
	StoreName   string
	Brand       string
	MinDiscount *float64
	Limit       int
	Offset      int
}

func (db *DB) GetDeals(ctx context.Context, params GetDealsParams) ([]Deal, error) {
	if params.Limit <= 0 {
		params.Limit = 50
	}

	query := `
		SELECT l.id, l.store_id, s.name, l.store_sku, l.product_name, l.current_price, l.original_price,
			l.product_url, l.affiliate_url, l.image_url, l.brand, COALESCE(l.category_path, '{}'), l.is_in_stock, l.last_scraped::text
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE 1=1
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
	if params.MinDiscount != nil && *params.MinDiscount > 0 {
		query += fmt.Sprintf(" AND l.original_price IS NOT NULL AND l.original_price > 0 AND l.current_price < l.original_price AND (1 - l.current_price / l.original_price) * 100 >= $%d", argNum)
		args = append(args, *params.MinDiscount)
		argNum++
	}

	query += fmt.Sprintf(" ORDER BY l.last_scraped DESC LIMIT $%d OFFSET $%d", argNum, argNum+1)
	args = append(args, params.Limit, params.Offset)

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deals []Deal
	for rows.Next() {
		var d Deal
		var lastScraped []byte
		var cp pgtype.FlatArray[string]
		if err := rows.Scan(&d.ID, &d.StoreID, &d.StoreName, &d.StoreSKU, &d.ProductName, &d.CurrentPrice, &d.OriginalPrice,
			&d.ProductURL, &d.AffiliateURL, &d.ImageURL, &d.Brand, &cp, &d.IsInStock, &lastScraped); err != nil {
			return nil, err
		}
		d.CategoryPath = cp
		d.LastScraped = string(lastScraped)
		if d.OriginalPrice != nil && *d.OriginalPrice > 0 {
			pct := (1 - d.CurrentPrice/(*d.OriginalPrice)) * 100
			d.DiscountPct = &pct
		}
		deals = append(deals, d)
	}
	return deals, rows.Err()
}

func (db *DB) GetDealByID(ctx context.Context, id int) (*Deal, error) {
	var d Deal
	var lastScraped []byte
	var cp pgtype.FlatArray[string]
	err := db.pool.QueryRow(ctx, `
		SELECT l.id, l.store_id, s.name, l.store_sku, l.product_name, l.current_price, l.original_price,
			l.product_url, l.affiliate_url, l.image_url, l.brand, COALESCE(l.category_path, '{}'), l.is_in_stock, l.last_scraped::text
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE l.id = $1
	`, id).Scan(&d.ID, &d.StoreID, &d.StoreName, &d.StoreSKU, &d.ProductName, &d.CurrentPrice, &d.OriginalPrice,
		&d.ProductURL, &d.AffiliateURL, &d.ImageURL, &d.Brand, &cp, &d.IsInStock, &lastScraped)
	if err != nil {
		return nil, err
	}
	d.CategoryPath = cp
	d.LastScraped = string(lastScraped)
	if d.OriginalPrice != nil && *d.OriginalPrice > 0 {
		pct := (1 - d.CurrentPrice/(*d.OriginalPrice)) * 100
		d.DiscountPct = &pct
	}
	return &d, nil
}

// StoreWithCount includes deal count for API
type StoreWithCount struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	BaseURL   string `json:"base_url"`
	DealCount int    `json:"deal_count"`
	LastScraped string `json:"last_scraped"`
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
	query := `
		SELECT l.id, l.store_id, COALESCE(s.store_type, 'jensonusa'), l.product_url
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE l.product_url IS NOT NULL AND l.product_url != ''
		  AND s.store_type = 'jensonusa'
	`
	if !force {
		query += ` AND (l.last_enriched_at IS NULL OR l.last_enriched_at < NOW() - INTERVAL '7 days')`
	}
	query += `
		ORDER BY l.last_enriched_at NULLS FIRST, l.last_scraped DESC
		LIMIT $1
	`
	rows, err := db.pool.Query(ctx, query, limit)
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

func (db *DB) UpdateListingEnrichment(ctx context.Context, id int, categoryPath []string) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE store_listings
		SET category_path = $1, last_enriched_at = NOW()
		WHERE id = $2
	`, pq.Array(categoryPath), id)
	return err
}
