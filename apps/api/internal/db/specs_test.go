package db

import (
	"strings"
	"testing"
)

func TestFacetsListingGate(t *testing.T) {
	t.Run("empty suffix", func(t *testing.T) {
		got := facetsListingGate("")
		if !strings.Contains(got, "l.is_in_stock = true") {
			t.Fatalf("expected is_in_stock in %q", got)
		}
		if !strings.Contains(got, "l.hidden = false") {
			t.Fatalf("expected hidden = false in %q", got)
		}
	})
	t.Run("appends buildFacetsWhereClause suffix", func(t *testing.T) {
		suffix := " AND l.brand ILIKE $1"
		got := facetsListingGate(suffix)
		if !strings.HasPrefix(strings.TrimSpace(got), "AND l.is_in_stock") {
			t.Fatalf("expected gate first segment: %q", got)
		}
		if !strings.Contains(got, suffix) {
			t.Fatalf("expected suffix appended: %q", got)
		}
		idxStock := strings.Index(got, "is_in_stock")
		idxSuffix := strings.Index(got, suffix)
		if idxSuffix < idxStock {
			t.Fatalf("gate should precede suffix: %q", got)
		}
	})
}
