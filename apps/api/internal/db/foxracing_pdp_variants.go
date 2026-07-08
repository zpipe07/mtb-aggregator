package db

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

var foxBaseStyleRe = regexp.MustCompile(`^(VG-\d+)-\d{3}$`)

func foxBaseStyleFromSKU(storeSKU string) string {
	if m := foxBaseStyleRe.FindStringSubmatch(strings.TrimSpace(storeSKU)); len(m) == 2 {
		return m[1]
	}
	return ""
}

// ApplyFoxRacingPDPVariantFanout updates variant_options and is_in_stock for color sibling
// listings sharing the same base style (product_group_key = "{store_id}:VG-#####").
func (db *DB) ApplyFoxRacingPDPVariantFanout(ctx context.Context, storeID int, storeType, storeSKU string, variants []JensonPDPVariant, seen map[string]bool) error {
	if len(variants) == 0 || !strings.EqualFold(strings.TrimSpace(storeType), "foxracing") {
		return nil
	}
	baseStyle := foxBaseStyleFromSKU(storeSKU)
	if baseStyle == "" {
		return nil
	}
	groupKey := fmt.Sprintf("%d:%s", storeID, baseStyle)
	if seen != nil {
		if seen[groupKey] {
			return nil
		}
		seen[groupKey] = true
	}

	siblings, err := db.ListingsInGroup(ctx, storeID, groupKey)
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
		v, ok := byCode[strings.TrimSpace(sib.StoreSKU)]
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
