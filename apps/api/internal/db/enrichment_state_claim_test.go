package db

import (
	"strings"
	"testing"
	"time"

	"github.com/mtb-aggregator/api/internal/enrichstate"
)

func TestStepClaimEligibility_laterScrapeOverridesUnavailableSnapshot(t *testing.T) {
	t.Parallel()
	argNum := 4
	args := []any{}
	where, _, err := stepClaimEligibility(enrichstate.StepClassify, false, time.Now(), time.Hour, &argNum, &args)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(where, "l.last_scraped > ps.fetched_at") {
		t.Fatalf("classify claim must allow a later in-stock scrape to override an unavailable PDP:\n%s", where)
	}
	extractWhere, _, err := stepClaimEligibility(enrichstate.StepExtract, false, time.Now(), time.Hour, &argNum, &args)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(extractWhere, "l.last_scraped > ps.fetched_at") {
		t.Fatalf("extract claim must use the same unavailable override:\n%s", extractWhere)
	}
}
