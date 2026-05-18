package impact

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mtb-aggregator/api/internal/scraper"
)

func TestParseCatalogsWrapped(t *testing.T) {
	body := []byte(`{"Catalogs":[{"Id":"c1","Name":"Competitive Cyclist US","AdvertiserName":"Competitive Cyclist"}]}`)
	list, err := parseCatalogInfos(body)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != "c1" {
		t.Fatalf("got %+v", list)
	}
	id := pickCompetitiveCyclistCatalog(list)
	if id != "c1" {
		t.Fatalf("pick: %q", id)
	}
}

func TestMapCatalogItem_TrackingOutboundURL(t *testing.T) {
	raw := map[string]interface{}{
		"CatalogItemId": "sku-trk",
		"Name":          "Tracked Shoe",
		"Url":           "https://competitivecyclist.g39l.net/c/7267030/1965080/5416?u=https%3A%2F%2Fwww.competitivecyclist.com%2Fp%2Fshoe",
		"CurrentPrice":  99.0,
		"OriginalPrice": 199.0,
	}
	got, ok := mapCatalogItemToScrapeResult(raw, Config{})
	if !ok {
		t.Fatal("expected ok")
	}
	wantPDP := "https://www.competitivecyclist.com/p/shoe"
	if got.ProductURL != wantPDP {
		t.Fatalf("ProductURL got %q want %q", got.ProductURL, wantPDP)
	}
	if got.ImpactCatalogOutboundURL == nil || *got.ImpactCatalogOutboundURL != raw["Url"].(string) {
		t.Fatalf("ImpactCatalogOutboundURL %+v", got.ImpactCatalogOutboundURL)
	}
}

func TestMapCatalogItem_SaleAndDescription(t *testing.T) {
	raw := map[string]interface{}{
		"CatalogItemId":     "sku-1",
		"Name":              "Test Bike Frame",
		"Url":               "https://www.competitivecyclist.com/p/foo",
		"CurrentPrice":      99.0,
		"OriginalPrice":     199.0,
		"Description":       "Carbon frame",
		"StockAvailability": "In Stock",
	}
	cfg := Config{CCCategoryContains: "bike"}
	got, ok := mapCatalogItemToScrapeResult(raw, cfg)
	if !ok {
		t.Fatal("expected ok")
	}
	if got.StoreSKU != "sku-1" || got.CurrentPrice != 99 || got.OriginalPrice == nil || *got.OriginalPrice != 199 {
		t.Fatalf("%+v", got)
	}
	if got.FeedDescription == nil || *got.FeedDescription != "Carbon frame" {
		t.Fatalf("desc %+v", got.FeedDescription)
	}
}

func TestFetchCompetitiveCyclist_HTTPServer(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/Mediapartners/sid/Catalogs" {
			_, _ = w.Write([]byte(`{"Catalogs":[{"Id":"cat-cc","Name":"Competitive Cyclist","AdvertiserName":"CC"}]}`))
			return
		}
		if r.URL.Path == "/Mediapartners/sid/Catalogs/cat-cc/Items" {
			items := []map[string]interface{}{
				{
					"CatalogItemId":     "x1",
					"Name":              "Mountain Downhill bike",
					"Url":               "https://www.competitivecyclist.com/p/x1",
					"CurrentPrice":      10.0,
					"OriginalPrice":     20.0,
					"Category":          "bikes > mountain",
					"StockAvailability": "In Stock",
				},
			}
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"CatalogItems": items})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	cfg := Config{
		AccountSID:         "sid",
		AuthToken:          "tok",
		APIBaseURL:         srv.URL,
		CCItemSearchQuery:  "StockAvailability!=OutOfStock",
		CCCategoryContains: "",
		PageSize:           50,
	}
	out, err := FetchCompetitiveCyclistScrapeResults(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 {
		t.Fatalf("got %d results", len(out))
	}
	if out[0].StoreSKU != "x1" {
		t.Fatalf("%+v", out[0])
	}
}

func TestValidateMappedResult(t *testing.T) {
	raw := map[string]interface{}{
		"CatalogItemId": "sku-1",
		"Name":          "Test",
		"Url":           "https://www.competitivecyclist.com/p/foo",
		"CurrentPrice":  10.0,
		"OriginalPrice": 20.0,
	}
	r, ok := mapCatalogItemToScrapeResult(raw, Config{CCCategoryContains: ""})
	if !ok {
		t.Fatal("map failed")
	}
	if errs := scraper.ValidateResult(r, 0); len(errs) > 0 {
		t.Fatalf("%v", errs)
	}
}

func TestMaxImpactItemsPage(t *testing.T) {
	if maxImpactItemsPage(100) != 200 {
		t.Fatalf("pageSize 100: got %d want 200", maxImpactItemsPage(100))
	}
	if maxImpactItemsPage(25) != 800 {
		t.Fatalf("pageSize 25: got %d", maxImpactItemsPage(25))
	}
}
