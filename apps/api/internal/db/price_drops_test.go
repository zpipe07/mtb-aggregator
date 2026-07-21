package db

import (
	"strings"
	"testing"
	"time"
)

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

// Regression: omitting WITH when price-drop filtering is off caused production
// 500s: syntax error at or near "filtered" (SQLSTATE 42601).
func TestGroupedFilteredCTEPrefix(t *testing.T) {
	got := groupedFilteredCTEPrefix(false)
	if got != `WITH ` {
		t.Fatalf("no price-drop filter: got %q, want %q", got, `WITH `)
	}
	got = groupedFilteredCTEPrefix(true)
	if len(got) < 4 || got[:4] != "WITH" {
		t.Fatalf("price-drop filter: must start with WITH, got %q", got)
	}
	if got[len(got)-1] != ',' {
		t.Fatalf("price-drop filter: must end with comma before filtered CTE, got %q", got)
	}
}

func TestRecentPriceDropsCTEUsesWindowWithinWindow(t *testing.T) {
	cte := recentPriceDropsCTE(1)
	for _, substr := range []string{"LAG(price)", "DISTINCT ON (listing_id)", "price_deltas"} {
		if !strings.Contains(cte, substr) {
			t.Fatalf("recentPriceDropsCTE missing %q:\n%s", substr, cte)
		}
	}
}

func TestHasPriceDropWithinDays(t *testing.T) {
	now := time.Now().UTC().Format(time.RFC3339)
	dayAgo := time.Now().Add(-24 * time.Hour).UTC().Format(time.RFC3339)
	weekAgo := time.Now().Add(-8 * 24 * time.Hour).UTC().Format(time.RFC3339)

	cases := []struct {
		name   string
		points []PriceHistoryPoint
		days   int
		want   bool
	}{
		{
			name: "drop on latest scrape within week",
			points: []PriceHistoryPoint{
				{Price: 100, RecordedAt: dayAgo},
				{Price: 90, RecordedAt: now},
			},
			days: 7,
			want: true,
		},
		{
			name: "drop earlier in week still counts after flat scrapes",
			points: []PriceHistoryPoint{
				{Price: 100, RecordedAt: weekAgo},
				{Price: 90, RecordedAt: dayAgo},
				{Price: 90, RecordedAt: now},
			},
			days: 7,
			want: true,
		},
		{
			name: "only latest two points compared misses mid-week drop",
			points: []PriceHistoryPoint{
				{Price: 100, RecordedAt: weekAgo},
				{Price: 90, RecordedAt: dayAgo},
				{Price: 95, RecordedAt: now},
			},
			days: 7,
			want: true,
		},
		{
			name: "drop outside window ignored",
			points: []PriceHistoryPoint{
				{Price: 100, RecordedAt: weekAgo},
				{Price: 90, RecordedAt: weekAgo},
				{Price: 90, RecordedAt: now},
			},
			days: 7,
			want: false,
		},
		{
			name: "no drop",
			points: []PriceHistoryPoint{
				{Price: 100, RecordedAt: dayAgo},
				{Price: 100, RecordedAt: now},
			},
			days: 7,
			want: false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := hasPriceDropWithinDays(tc.points, tc.days); got != tc.want {
				t.Fatalf("hasPriceDropWithinDays() = %v, want %v", got, tc.want)
			}
		})
	}
}
