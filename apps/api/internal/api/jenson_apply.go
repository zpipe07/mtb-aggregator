package api

import (
	"context"

	"github.com/mtb-aggregator/api/internal/db"
	"github.com/mtb-aggregator/api/internal/scraper"
)

// applyJensonPDPAfterEnrich runs PDP variant fan-out for JensonUSA after scraper enrich.
func applyJensonPDPAfterEnrich(ctx context.Context, database *db.DB, storeID int, storeType, storeSKU string, variants []scraper.EnrichVariant, seen map[string]bool) error {
	if len(variants) == 0 {
		return nil
	}
	vj := make([]db.JensonPDPVariant, len(variants))
	for i, v := range variants {
		vj[i] = db.JensonPDPVariant{
			Code:        v.Code,
			Dimensions:  v.Dimensions,
			IsOrderable: v.IsOrderable,
		}
	}
	return database.ApplyJensonPDPVariantFanout(ctx, storeID, storeType, storeSKU, vj, seen)
}
