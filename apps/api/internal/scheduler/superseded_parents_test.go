package scheduler

import (
	"os"
	"strings"
	"testing"
)

func TestHideSupersededParentsAfterScrapeWired(t *testing.T) {
	src, err := os.ReadFile("scheduler.go")
	if err != nil {
		t.Fatalf("read scheduler.go: %v", err)
	}
	s := string(src)
	if !strings.Contains(s, "s.hideSupersededParentsAfterScrape(cleanupCtx, store)") {
		t.Fatal("HideStaleListings path must re-hide Jenson/UC superseded parents after scrape upsert unhides them")
	}
	if !strings.Contains(s, "HideJensonSupersededParents") {
		t.Fatal("scheduler must call HideJensonSupersededParents for jensonusa")
	}
	if !strings.Contains(s, "HideUniversalCyclesSupersededParents") {
		t.Fatal("scheduler must call HideUniversalCyclesSupersededParents for universalcycles")
	}
	if !strings.Contains(s, "MaxRecentCompletedScrapeUpserted") {
		t.Fatal("scheduler must compare scrape size to recent max before HideStaleListings (ZAC-270)")
	}
	if !strings.Contains(s, "isThinScrape") {
		t.Fatal("scheduler must skip stale-hide on thin scrapes (ZAC-270)")
	}
}
