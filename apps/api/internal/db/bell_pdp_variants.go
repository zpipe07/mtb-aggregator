package db

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

var bellMasterIDRe = regexp.MustCompile(`/(\d{10,})\.html`)

func bellMasterIDFromProductURL(productURL string) string {
	u := strings.TrimSpace(productURL)
	if u == "" {
		return ""
	}
	if m := bellMasterIDRe.FindStringSubmatch(u); len(m) == 2 {
		return m[1]
	}
	return ""
}

func bellColorCodeFromProductURL(productURL string) string {
	parsed, err := url.Parse(strings.TrimSpace(productURL))
	if err != nil {
		return ""
	}
	for key, values := range parsed.Query() {
		if strings.HasPrefix(strings.ToLower(key), "dwvar_") && strings.HasSuffix(strings.ToLower(key), "_color") {
			if len(values) > 0 && strings.TrimSpace(values[0]) != "" {
				return strings.TrimSpace(values[0])
			}
		}
	}
	return ""
}

func bellColorCodeFromVariantOptions(opts json.RawMessage) string {
	if len(opts) == 0 {
		return ""
	}
	var m map[string]string
	if err := json.Unmarshal(opts, &m); err != nil {
		return ""
	}
	color := strings.TrimSpace(m["Color"])
	if color == "" {
		return ""
	}
	// Scrape stores numeric color ids; after fan-out labels are human-readable.
	if regexp.MustCompile(`^\d+$`).MatchString(color) {
		return color
	}
	return ""
}

type bellGroupSibling struct {
	ID             int
	StoreSKU       string
	ProductURL     string
	VariantOptions json.RawMessage
}

func (db *DB) listingsInGroupForBell(ctx context.Context, storeID int, productGroupKey string) ([]bellGroupSibling, error) {
	if strings.TrimSpace(productGroupKey) == "" {
		return nil, nil
	}
	rows, err := db.pool.Query(ctx, `
		SELECT id, COALESCE(store_sku, ''), COALESCE(product_url, ''), variant_options
		FROM store_listings
		WHERE store_id = $1 AND product_group_key = $2 AND hidden = false
		ORDER BY id
	`, storeID, productGroupKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []bellGroupSibling
	for rows.Next() {
		var s bellGroupSibling
		if err := rows.Scan(&s.ID, &s.StoreSKU, &s.ProductURL, &s.VariantOptions); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func bellSiblingColorCode(sib bellGroupSibling) string {
	if code := bellColorCodeFromVariantOptions(sib.VariantOptions); code != "" {
		return code
	}
	return bellColorCodeFromProductURL(sib.ProductURL)
}

// ApplyBellPDPVariantFanout updates variant_options and is_in_stock for color sibling
// listings sharing the same master product id (product_group_key = "{store_id}:{masterId}").
func (db *DB) ApplyBellPDPVariantFanout(ctx context.Context, storeID int, storeType, productURL string, variants []JensonPDPVariant, seen map[string]bool) error {
	if len(variants) == 0 || !strings.EqualFold(strings.TrimSpace(storeType), "bell") {
		return nil
	}
	masterID := bellMasterIDFromProductURL(productURL)
	if masterID == "" {
		return nil
	}
	groupKey := fmt.Sprintf("%d:%s", storeID, masterID)
	if seen != nil {
		if seen[groupKey] {
			return nil
		}
		seen[groupKey] = true
	}

	siblings, err := db.listingsInGroupForBell(ctx, storeID, groupKey)
	if err != nil {
		return err
	}
	byCode := make(map[string]JensonPDPVariant, len(variants))
	for _, v := range variants {
		c := strings.TrimSpace(v.Code)
		if c != "" {
			byCode[c] = v
		}
	}

	for _, sib := range siblings {
		colorCode := bellSiblingColorCode(sib)
		v, ok := byCode[colorCode]
		if ok {
			optsJSON, err := sortedVariantOptionsJSON(v.Dimensions)
			if err != nil {
				return fmt.Errorf("marshal variant_options for listing %d: %w", sib.ID, err)
			}
			var optsPtr *json.RawMessage
			if len(optsJSON) > 0 {
				optsPtr = &optsJSON
			}
			if err := db.UpdateListingVariantInfo(ctx, sib.ID, optsPtr, v.IsOrderable, groupKey); err != nil {
				return err
			}
			continue
		}
		if err := db.UpdateListingVariantInfo(ctx, sib.ID, nil, false, groupKey); err != nil {
			return err
		}
	}
	return nil
}
