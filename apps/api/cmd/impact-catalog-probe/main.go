// impact-catalog-probe lists Impact catalogs and a sample Catalog Items page for Competitive Cyclist tuning.
// Requires IMPACT_ACCOUNT_SID, IMPACT_AUTH_TOKEN (see apps/api/README.md).
package main

import (
	"context"
	"encoding/json"
	"log"

	"github.com/joho/godotenv"
	"github.com/mtb-aggregator/api/internal/impact"
)

func main() {
	_ = godotenv.Load()
	_ = godotenv.Load("../../.env")

	cfg := impact.ConfigFromEnv()
	if !cfg.CatalogConfigured() {
		log.Fatalf("set %s and %s in .env", impact.EnvAccountSID, impact.EnvAuthToken)
	}

	ctx := context.Background()
	cl := impact.NewClient(cfg)

	cats, err := cl.ListCatalogs(ctx)
	if err != nil {
		log.Fatalf("ListCatalogs: %v", err)
	}
	log.Printf("catalogs: %d", len(cats))
	for _, c := range cats {
		log.Printf("  id=%q name=%q advertiser=%q", c.ID, c.Name, c.AdvertiserName)
	}

	catID, err := impact.ResolveCCCatalogID(ctx, cl, cfg)
	if err != nil {
		log.Fatalf("resolve CC catalog: %v", err)
	}
	log.Printf("using catalog id %q (override with %s)", catID, impact.EnvCCCatalogID)

	pageSize := cfg.PageSize
	if pageSize > 25 {
		pageSize = 25
	}
	items, more, err := cl.SearchCatalogItemsPage(ctx, catID, cfg.CCItemSearchQuery, 1, pageSize)
	if err != nil {
		log.Fatalf("Catalog Items: %v", err)
	}
	log.Printf("first page items=%d more=%v (query=%q)", len(items), more, cfg.CCItemSearchQuery)

	if len(items) > 0 {
		out, _ := json.MarshalIndent(items[0], "", "  ")
		log.Printf("first item keys sample; full object:\n%s", string(out))
	} else {
		log.Printf("no items — widen %s or set %s explicitly", impact.EnvCCItemSearchQuery, impact.EnvCCCatalogID)
	}
}
