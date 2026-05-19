package impact

import (
	"strings"

	"github.com/mtb-aggregator/api/internal/scraper"
)

func mapCatalogItemToScrapeResult(m map[string]interface{}, cfg Config) (scraper.ScrapeResult, bool) {
	sku := firstStringFromMap(m,
		"CatalogItemId", "CatalogItemID", "catalog_item_id", "Id", "ID", "Sku", "SKU", "ProductId", "productId")
	name := firstStringFromMap(m, "Name", "Title", "ProductName", "name")
	rawLink := firstStringFromMap(m, "Url", "URL", "ProductUrl", "ProductURL", "Link", "DeepLink", "TrackingLink", "uri")
	if sku == "" || name == "" || rawLink == "" {
		return scraper.ScrapeResult{}, false
	}
	normalizedRaw := strings.TrimSpace(rawLink)
	// Normalize relative URLs (uncommon in catalog feeds)
	if strings.HasPrefix(normalizedRaw, "/") {
		normalizedRaw = "https://www.competitivecyclist.com" + normalizedRaw
	}
	canonicalPDP := unwrapImpactTrackedProductURL(normalizedRaw)
	current := firstFloatFromMap(m, "CurrentPrice", "SalePrice", "Price", "current_price")
	if current <= 0 {
		return scraper.ScrapeResult{}, false
	}
	original := firstFloatPtrFromMap(m, "OriginalPrice", "RetailPrice", "ListPrice", "MSRP", "CompareAtPrice", "original_price")
	if original != nil && *original > 0 {
		if current >= *original {
			return scraper.ScrapeResult{}, false // not on sale
		}
	} else {
		// MVP: bikes-on-sale alignment — require a list price to prove a discount
		return scraper.ScrapeResult{}, false
	}

	img := firstStringPtrFromMap(m, "ImageUrl", "ImageUrlLarge", "PrimaryImageUrl", "LargeImageUrl", "Image", "image_url")
	brand := firstStringPtrFromMap(m, "Manufacturer", "Brand", "BrandName", "manufacturer")

	catStr := firstStringFromMap(m, "Category", "ProductCategory", "CategoryName", "GoogleProductCategory", "category")
	if needle := strings.TrimSpace(cfg.CCCategoryContains); needle != "" {
		hay := strings.ToLower(catStr + " " + name)
		if !strings.Contains(hay, strings.ToLower(needle)) {
			return scraper.ScrapeResult{}, false
		}
	}
	catPath := splitCategoryPath(catStr)

	desc := firstStringFromMap(m, "Description", "LongDescription", "ShortDescription", "Long_Description", "description")
	var feedDesc *string
	if strings.TrimSpace(desc) != "" {
		feedDesc = &desc
	}

	outbound := trackingCatalogOutboundURL(normalizedRaw, canonicalPDP)

	return scraper.ScrapeResult{
		StoreSKU:                 sku,
		ProductName:              name,
		CurrentPrice:             current,
		OriginalPrice:            original,
		ProductURL:               canonicalPDP,
		ImageURL:                 img,
		Brand:                    brand,
		CategoryPath:             catPath,
		IsInStock:                inferInStock(m),
		FeedDescription:          feedDesc,
		ProductGroupKey:          nil,
		VariantOptions:           nil,
		ImpactCatalogOutboundURL: outbound,
	}, true
}

func splitCategoryPath(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	parts := strings.FieldsFunc(s, func(r rune) bool {
		return r == '>' || r == '/' || r == '|'
	})
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func inferInStock(m map[string]interface{}) bool {
	v := firstStringFromMap(m, "StockAvailability", "Availability", "StockStatus", "InventoryAvailability", "stock_availability")
	vl := strings.ToLower(v)
	if vl == "" {
		return true
	}
	if strings.Contains(vl, "out") || strings.Contains(vl, "sold out") || strings.Contains(vl, "unavailable") {
		return false
	}
	return true
}

func firstFloatPtrFromMap(m map[string]interface{}, keys ...string) *float64 {
	for _, k := range keys {
		if f, ok := floatFromAny(m[k]); ok && f > 0 {
			return &f
		}
	}
	return nil
}

func firstStringPtrFromMap(m map[string]interface{}, keys ...string) *string {
	s := firstStringFromMap(m, keys...)
	if s == "" {
		return nil
	}
	return &s
}
