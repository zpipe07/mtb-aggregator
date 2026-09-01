package scheduler

import "testing"

func TestShouldHideStaleAfterScrape(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name       string
		validCount int
		truncated  bool
		want       bool
	}{
		{name: "full scrape", validCount: 2329, truncated: false, want: true},
		{name: "truncated Jenson page cap", validCount: 2329, truncated: true, want: false},
		{name: "too few results", validCount: 3, truncated: false, want: false},
		{name: "too few and truncated", validCount: 3, truncated: true, want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := shouldHideStaleAfterScrape(tc.validCount, tc.truncated); got != tc.want {
				t.Fatalf("shouldHideStaleAfterScrape(%d, %v) = %v, want %v", tc.validCount, tc.truncated, got, tc.want)
			}
		})
	}
}
