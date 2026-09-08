package db

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
)

// UCVariant is one attribute row from Universal Cycles PDP enrich.
type UCVariant struct {
	Code          string
	Dimensions    map[string]string
	IsOrderable   bool
	CurrentPrice  *float64
	OriginalPrice *float64
}

// UCListingTemplate is parent listing data used to upsert attribute siblings.
type UCListingTemplate struct {
	ID                int
	StoreID           int
	ProductName       string
	ProductURL        string
	Brand             *string
	CategoryPath      []string
	CanonicalCategory []string
	ImageURL          *string
	Metadata          []byte
	CurrentPrice      float64
	OriginalPrice     *float64
	StoreSKU          string
}

func (db *DB) GetListingTemplateForUCFanout(ctx context.Context, listingID int) (*UCListingTemplate, error) {
	var t UCListingTemplate
	var brand, imageURL pgtype.Text
	var catPath, canonCat pgtype.FlatArray[string]
	var origPrice pgtype.Float8
	err := db.pool.QueryRow(ctx, `
		SELECT l.id, l.store_id, COALESCE(l.product_name, ''), l.product_url,
			l.brand, COALESCE(l.category_path, '{}'), COALESCE(l.canonical_category, '{}'::text[]),
			l.image_url, COALESCE(l.metadata, '{}'), l.current_price, l.original_price,
			COALESCE(l.store_sku, '')
		FROM store_listings l
		WHERE l.id = $1
	`, listingID).Scan(
		&t.ID, &t.StoreID, &t.ProductName, &t.ProductURL,
		&brand, &catPath, &canonCat, &imageURL, &t.Metadata, &t.CurrentPrice, &origPrice, &t.StoreSKU,
	)
	if err != nil {
		return nil, err
	}
	if brand.Valid {
		s := brand.String
		t.Brand = &s
	}
	if imageURL.Valid {
		s := imageURL.String
		t.ImageURL = &s
	}
	t.CategoryPath = []string(catPath)
	t.CanonicalCategory = []string(canonCat)
	if origPrice.Valid {
		v := origPrice.Float64
		t.OriginalPrice = &v
	}
	return &t, nil
}

// ApplyUniversalCyclesVariantFanout upserts one listing row per attribute SKU and hides the parent product-id row.
func (db *DB) ApplyUniversalCyclesVariantFanout(ctx context.Context, parentListingID int, variants []UCVariant, seen map[string]bool) error {
	if len(variants) == 0 {
		return nil
	}
	parent, err := db.GetListingTemplateForUCFanout(ctx, parentListingID)
	if err != nil {
		return err
	}
	productID := strings.TrimSpace(parent.StoreSKU)
	if productID == "" {
		return nil
	}
	groupKey := fmt.Sprintf("%d:%s", parent.StoreID, productID)
	if seen != nil {
		if seen[groupKey] {
			return nil
		}
		seen[groupKey] = true
	}

	groupHandle := productID
	for _, v := range variants {
		code := strings.TrimSpace(v.Code)
		if code == "" {
			continue
		}
		currentPrice := parent.CurrentPrice
		if v.CurrentPrice != nil && *v.CurrentPrice > 0 {
			currentPrice = *v.CurrentPrice
		}
		var originalPrice *float64
		if v.OriginalPrice != nil && *v.OriginalPrice > 0 {
			originalPrice = v.OriginalPrice
		} else {
			originalPrice = parent.OriginalPrice
		}
		var variantOpts []byte
		if len(v.Dimensions) > 0 {
			variantOpts, err = json.Marshal(v.Dimensions)
			if err != nil {
				return fmt.Errorf("marshal variant_options for %s: %w", code, err)
			}
		}
		listing := Listing{
			StoreID:            parent.StoreID,
			StoreSKU:           code,
			ProductName:        parent.ProductName,
			CurrentPrice:       currentPrice,
			OriginalPrice:      originalPrice,
			ProductURL:         parent.ProductURL,
			ImageURL:           parent.ImageURL,
			Brand:              parent.Brand,
			CategoryPath:       parent.CategoryPath,
			CanonicalCategory:  parent.CanonicalCategory,
			Metadata:           parent.Metadata,
			IsInStock:          v.IsOrderable,
			ProductGroupHandle: &groupHandle,
			VariantOptions:     variantOpts,
		}
		if id, err := db.UpsertListing(ctx, listing); err != nil {
			return fmt.Errorf("upsert UC variant %s: %w", code, err)
		} else if err := db.InsertPriceHistory(ctx, id, currentPrice); err != nil {
			return fmt.Errorf("price history for UC variant %s: %w", code, err)
		}
	}

	_, err = db.pool.Exec(ctx, `
		UPDATE store_listings
		SET hidden = true
		WHERE id = $1
		  AND store_sku NOT LIKE '%-%'
	`, parentListingID)
	return err
}

// hideUniversalCyclesSupersededParentsSQL matches migration 026: hide parent product-id
// rows when attribute SKU siblings ({productId}-{attributeId}) exist on the same URL.
const hideUniversalCyclesSupersededParentsSQL = `
		UPDATE store_listings sl
		SET hidden = true
		FROM stores s
		WHERE sl.store_id = s.id
		  AND s.store_type = 'universalcycles'
		  AND sl.hidden = false
		  AND sl.store_sku NOT LIKE '%-%'
		  AND EXISTS (
		    SELECT 1
		    FROM store_listings sl2
		    WHERE sl2.store_id = sl.store_id
		      AND sl2.product_url = sl.product_url
		      AND sl2.hidden = false
		      AND sl2.store_sku LIKE sl.store_sku || '-%'
		  )
	`

// HideUniversalCyclesSupersededParents hides parent product-id rows when attribute SKU siblings exist.
func (db *DB) HideUniversalCyclesSupersededParents(ctx context.Context) (int64, error) {
	tag, err := db.pool.Exec(ctx, hideUniversalCyclesSupersededParentsSQL)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
