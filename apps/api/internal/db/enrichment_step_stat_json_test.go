package db

import (
	"encoding/json"
	"testing"
)

func TestEnrichmentStepStatJSONIncludesBacklogAlias(t *testing.T) {
	t.Parallel()
	s := EnrichmentStepStat{Step: "pdp", Due: 12, InFlight: 3, Dead: 1}
	b, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	if m["due"] != float64(12) {
		t.Errorf("due=%v want 12", m["due"])
	}
	if m["backlog"] != float64(12) {
		t.Errorf("backlog=%v want 12 (alias of due for older admin Insights)", m["backlog"])
	}
	if m["in_flight"] != float64(3) {
		t.Errorf("in_flight=%v want 3", m["in_flight"])
	}
}
