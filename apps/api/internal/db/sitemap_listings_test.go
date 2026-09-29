package db

import (
	"strings"
	"testing"
)

func TestListSitemapListingsSQLIndexableOnly(t *testing.T) {
	t.Parallel()
	sql := listSitemapListingsSQL
	for _, want := range []string{
		listingVisibilityGate,
		storeVisibleProductGroupKey,
		"ROW_NUMBER() OVER (PARTITION BY gk",
		"WHERE rn = 1",
		"LIMIT $1",
		"l.is_in_stock = true",
		"l.hidden = false",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("listSitemapListingsSQL missing %q in:\n%s", want, sql)
		}
	}
	for _, notWant := range []string{
		"price_history",
		"price-history",
		"hidden = true",
	} {
		if strings.Contains(sql, notWant) {
			t.Fatalf("listSitemapListingsSQL must not include %q in:\n%s", notWant, sql)
		}
	}
}

func TestClampSitemapListingsLimit(t *testing.T) {
	t.Parallel()
	tests := []struct {
		in   int
		want int
	}{
		{0, MaxSitemapListings},
		{-1, MaxSitemapListings},
		{MaxSitemapListings + 1, MaxSitemapListings},
		{100, 100},
		{MaxSitemapListings, MaxSitemapListings},
	}
	for _, tt := range tests {
		if got := ClampSitemapListingsLimit(tt.in); got != tt.want {
			t.Fatalf("ClampSitemapListingsLimit(%d) = %d, want %d", tt.in, got, tt.want)
		}
	}
}
