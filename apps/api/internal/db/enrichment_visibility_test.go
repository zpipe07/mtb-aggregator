package db

import (
	"strings"
	"testing"
)

func TestListingVisibilityGate(t *testing.T) {
	t.Parallel()
	if !strings.Contains(listingVisibilityGate, "l.is_in_stock = true") {
		t.Fatalf("expected is_in_stock in %q", listingVisibilityGate)
	}
	if !strings.Contains(listingVisibilityGate, "l.hidden = false") {
		t.Fatalf("expected hidden = false in %q", listingVisibilityGate)
	}
}

func TestEnrichmentQueriesIncludeVisibilityGate(t *testing.T) {
	t.Parallel()
	// Spot-check that enrichment selection SQL fragments include the shared gate.
	fragments := []string{
		`WHERE l.product_url IS NOT NULL AND l.product_url != ''` + listingVisibilityGate,
	}
	for _, frag := range fragments {
		if !strings.Contains(frag, listingVisibilityGate) {
			t.Fatalf("missing gate in %q", frag)
		}
	}
}
