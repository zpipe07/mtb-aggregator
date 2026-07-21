package db

import "testing"

func TestWantsPriceDropFilter(t *testing.T) {
	yes := true
	no := false
	cases := []struct {
		name   string
		params GetDealsParams
		want   bool
	}{
		{"sort price_drop", GetDealsParams{Sort: "price_drop"}, true},
		{"price_dropped true", GetDealsParams{PriceDropped: &yes}, true},
		{"price_dropped false", GetDealsParams{PriceDropped: &no}, false},
		{"default", GetDealsParams{Sort: "discount"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := wantsPriceDropFilter(tc.params); got != tc.want {
				t.Fatalf("wantsPriceDropFilter() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestPriceDropWithinDaysDefault(t *testing.T) {
	if got := priceDropWithinDays(GetDealsParams{}); got != defaultPriceDropWithinDays {
		t.Fatalf("default days = %d, want %d", got, defaultPriceDropWithinDays)
	}
	if got := priceDropWithinDays(GetDealsParams{PriceDropWithinDays: 3}); got != 3 {
		t.Fatalf("custom days = %d, want 3", got)
	}
}
