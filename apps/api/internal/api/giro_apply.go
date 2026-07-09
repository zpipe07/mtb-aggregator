package api

import (
	"context"

	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/scraper"
)

// applyGiroPDPAfterEnrich fans out color labels and stock to sibling listings.
func applyGiroPDPAfterEnrich(ctx context.Context, database *db.DB, storeID int, storeType, productURL string, variants []scraper.EnrichVariant, seen map[string]bool) error {
	if len(variants) == 0 {
		return nil
	}
	vv := make([]db.JensonPDPVariant, len(variants))
	for i, v := range variants {
		vv[i] = db.JensonPDPVariant{
			Code:        v.Code,
			Dimensions:  v.Dimensions,
			IsOrderable: v.IsOrderable,
		}
	}
	return database.ApplyGiroPDPVariantFanout(ctx, storeID, storeType, productURL, vv, seen)
}
