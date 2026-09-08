package scheduler

import "testing"

func TestShouldHideStaleAfterScrape(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name       string
		validCount int
		truncated  bool
		recentMax  int
		want       bool
	}{
		{name: "full scrape", validCount: 2329, truncated: false, recentMax: 2329, want: true},
		{name: "truncated Jenson page cap", validCount: 2329, truncated: true, recentMax: 13120, want: false},
		{name: "too few results", validCount: 3, truncated: false, recentMax: 13120, want: false},
		{name: "too few and truncated", validCount: 3, truncated: true, recentMax: 13120, want: false},
		// ZAC-270: job 2608 upserted 149 in 46s after job 2548 upserted 13120.
		{name: "thin Jenson scrape vs recent full", validCount: 149, truncated: false, recentMax: 13120, want: false},
		{name: "no prior scrape history", validCount: 149, truncated: false, recentMax: 0, want: true},
		{name: "at half of recent max", validCount: 6560, truncated: false, recentMax: 13120, want: true},
		{name: "just under half of recent max", validCount: 6559, truncated: false, recentMax: 13120, want: false},
		{name: "modest drop still full enough", validCount: 11973, truncated: false, recentMax: 13120, want: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := shouldHideStaleAfterScrape(tc.validCount, tc.truncated, tc.recentMax); got != tc.want {
				t.Fatalf("shouldHideStaleAfterScrape(%d, %v, %d) = %v, want %v", tc.validCount, tc.truncated, tc.recentMax, got, tc.want)
			}
		})
	}
}

func TestIsThinScrape(t *testing.T) {
	t.Parallel()
	if !isThinScrape(149, 13120) {
		t.Fatal("149 vs 13120 should be a thin scrape (ZAC-270)")
	}
	if isThinScrape(13120, 13120) {
		t.Fatal("equal to recent max is not thin")
	}
	if isThinScrape(149, 0) {
		t.Fatal("no recent max is not thin")
	}
}
