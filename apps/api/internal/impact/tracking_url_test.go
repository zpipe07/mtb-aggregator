package impact

import (
	"net/url"
	"testing"
)

func TestUnwrapImpactTrackedProductURL_singleHop(t *testing.T) {
	in := `https://competitivecyclist.g39l.net/c/7267030/1965080/5416?prodsku=RPT000A-MARBLU-S95&u=https%3A%2F%2Fwww.competitivecyclist.com%2Fride-concepts-powerline-cycling-shoe-mens&intsrc=APIG_15956`
	want := `https://www.competitivecyclist.com/ride-concepts-powerline-cycling-shoe-mens`
	if got := unwrapImpactTrackedProductURL(in); got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestUnwrapImpactTrackedProductURL_nestedU(t *testing.T) {
	inner := `https://competitivecyclist.g39l.net/c/7267030/1965080/5416?prodsku=X&u=https%3A%2F%2Fwww.competitivecyclist.com%2Fp%2Freal-path`
	outer := `https://competitivecyclist.g39l.net/c/7267030/368279/5416?u=` + url.QueryEscape(inner)
	want := `https://www.competitivecyclist.com/p/real-path`
	if got := unwrapImpactTrackedProductURL(outer); got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestUnwrapImpactTrackedProductURL_alreadyCanonical(t *testing.T) {
	in := `https://www.competitivecyclist.com/foo/bar`
	if got := unwrapImpactTrackedProductURL(in); got != in {
		t.Fatalf("got %q", got)
	}
}

func TestTrackingCatalogOutboundURL_wrapVsCanonical(t *testing.T) {
	raw := `https://competitivecyclist.g39l.net/c/7267030/1965080/5416?u=https%3A%2F%2Fwww.competitivecyclist.com%2Fp%2Ffoo`
	pdp := `https://www.competitivecyclist.com/p/foo`
	got := trackingCatalogOutboundURL(raw, pdp)
	if got == nil || *got != raw {
		t.Fatalf("got %+v", got)
	}
}

func TestTrackingCatalogOutboundURL_plainPDP_nil(t *testing.T) {
	u := `https://www.competitivecyclist.com/p/foo`
	if got := trackingCatalogOutboundURL(u, u); got != nil {
		t.Fatalf("got %+v", got)
	}
}

func TestTrackingCatalogOutboundURL_offSiteRedirect(t *testing.T) {
	raw := `https://tracker.example.com/r/foo`
	if got := trackingCatalogOutboundURL(raw, raw); got == nil || *got != raw {
		t.Fatalf("got %+v", got)
	}
}
