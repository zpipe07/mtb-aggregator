package scheduler

import (
	"context"
	"strings"

	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/scraper"
)

func applyUniversalCyclesVariantFanout(ctx context.Context, database *db.DB, listingID int, storeType string, variants []scraper.EnrichVariant, seen map[string]bool) error {
	if !strings.EqualFold(strings.TrimSpace(storeType), "universalcycles") {
		return nil
	}
	if len(variants) == 0 {
		return nil
	}
	vv := make([]db.UCVariant, len(variants))
	for i, v := range variants {
		vv[i] = db.UCVariant{
			Code:          v.Code,
			Dimensions:    v.Dimensions,
			IsOrderable:   v.IsOrderable,
			CurrentPrice:  v.CurrentPrice,
			OriginalPrice: v.OriginalPrice,
		}
	}
	return database.ApplyUniversalCyclesVariantFanout(ctx, listingID, vv, seen)
}
