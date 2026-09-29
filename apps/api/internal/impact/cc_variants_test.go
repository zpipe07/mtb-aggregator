package impact

import (
	"encoding/json"
	"testing"

	"github.com/mtb-aggregator/api/internal/scraper"
)

func TestApplyCCVariantGroups_YetiSizesAndColors(t *testing.T) {
	url := "https://www.competitivecyclist.com/yeti-cycles-160e-c3-gx-transmission-carbon-wheel-ebike"
	results := []scraper.ScrapeResult{
		{StoreSKU: "YTIR1QX-BLA-XL", ProductName: "Yeti Cycles 160E C3 GX Transmission Carbon Wheel Ebike Black, XL", ProductURL: url},
		{StoreSKU: "YTIR1QX-BLA-L", ProductName: "Yeti Cycles 160E C3 GX Transmission Carbon Wheel Ebike Black, L", ProductURL: url},
		{StoreSKU: "YTIR1QX-RHI-L", ProductName: "Yeti Cycles 160E C3 GX Transmission Carbon Wheel Ebike Rhino, L", ProductURL: url + "?clickid=1"},
	}
	applyCCVariantGroups(results)

	wantSlug := "yeti-cycles-160e-c3-gx-transmission-carbon-wheel-ebike"
	want := []map[string]string{
		{"Color": "Black", "Size": "XL"},
		{"Color": "Black", "Size": "L"},
		{"Color": "Rhino", "Size": "L"},
	}
	for i, r := range results {
		if r.ProductGroupKey == nil || *r.ProductGroupKey != wantSlug {
			t.Fatalf("row %d group key = %v", i, r.ProductGroupKey)
		}
		got := map[string]string{}
		if err := json.Unmarshal(r.VariantOptions, &got); err != nil {
			t.Fatal(err)
		}
		if got["Color"] != want[i]["Color"] || got["Size"] != want[i]["Size"] {
			t.Fatalf("row %d options = %v want %v", i, got, want[i])
		}
	}
}

func TestApplyCCVariantGroups_SameColorUsesSlug(t *testing.T) {
	url := "https://www.competitivecyclist.com/santa-cruz-bicycles-bronson-cc-x0-axs-transmission-mountain-bike"
	results := []scraper.ScrapeResult{
		{ProductName: "Santa Cruz Bicycles Bronson CC X0 AXS Transmission Mountain Bike Root Beer, S", ProductURL: url},
		{ProductName: "Santa Cruz Bicycles Bronson CC X0 AXS Transmission Mountain Bike Root Beer, L", ProductURL: url},
	}
	applyCCVariantGroups(results)
	for i, r := range results {
		got := map[string]string{}
		if err := json.Unmarshal(r.VariantOptions, &got); err != nil {
			t.Fatal(err)
		}
		if got["Color"] != "Root Beer" {
			t.Fatalf("row %d color = %q", i, got["Color"])
		}
		if i == 0 && got["Size"] != "S" || i == 1 && got["Size"] != "L" {
			t.Fatalf("row %d size = %q", i, got["Size"])
		}
	}
}

func TestApplyCCVariantGroups_PositionNotSize(t *testing.T) {
	url := "https://www.competitivecyclist.com/shimano-br-m4100-disc-brake"
	results := []scraper.ScrapeResult{
		{ProductName: "Shimano BR-M4100 Disc Brake Black, Front", ProductURL: url},
		{ProductName: "Shimano BR-M4100 Disc Brake Black, Rear", ProductURL: url},
	}
	applyCCVariantGroups(results)
	for _, r := range results {
		got := map[string]string{}
		if err := json.Unmarshal(r.VariantOptions, &got); err != nil {
			t.Fatal(err)
		}
		if got["Color"] != "Black" {
			t.Fatalf("color = %q", got["Color"])
		}
		if _, ok := got["Size"]; ok {
			t.Fatalf("position stored as Size: %v", got)
		}
	}
	front := map[string]string{}
	_ = json.Unmarshal(results[0].VariantOptions, &front)
	if front["Position"] != "Front" {
		t.Fatalf("position = %q", front["Position"])
	}
}

func TestApplyCCVariantGroups_GenderSlug(t *testing.T) {
	url := "https://www.competitivecyclist.com/gorewear-c5-gore-tex-glove-mens"
	results := []scraper.ScrapeResult{
		{ProductName: "GOREWEAR C5 GORE-TEX Glove - Men's Black, 3XL", ProductURL: url},
		{ProductName: "GOREWEAR C5 GORE-TEX Glove - Men's Black, M", ProductURL: url},
	}
	applyCCVariantGroups(results)
	got := map[string]string{}
	if err := json.Unmarshal(results[0].VariantOptions, &got); err != nil {
		t.Fatal(err)
	}
	if got["Color"] != "Black" || got["Size"] != "3XL" {
		t.Fatalf("options = %v", got)
	}
	if results[0].ProductGroupKey == nil || *results[0].ProductGroupKey != "gorewear-c5-gore-tex-glove-mens" {
		t.Fatalf("group = %v", results[0].ProductGroupKey)
	}
}
