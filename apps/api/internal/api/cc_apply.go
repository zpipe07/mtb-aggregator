package api

import (
	"context"
	"strings"

	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/scraper"
)

func applyCompetitiveCyclistPDPAfterEnrich(ctx context.Context, database *db.DB, listingID, storeID int, storeType, storeSKU, productURL string, variants []scraper.EnrichVariant, seen map[string]bool) error {
	if !strings.EqualFold(strings.TrimSpace(storeType), "competitivecyclist") {
		return nil
	}
	db.LogCCVariantFanoutInput(listingID, storeSKU, productURL, len(variants))
	if len(variants) == 0 {
		return nil
	}
	vv := make([]db.CCVariant, len(variants))
	for i, v := range variants {
		vv[i] = db.CCVariant{
			Code:        v.Code,
			Dimensions:  v.Dimensions,
			IsOrderable: v.IsOrderable,
		}
	}
	return database.ApplyCompetitiveCyclistVariantFanout(ctx, storeID, productURL, vv, seen)
}
