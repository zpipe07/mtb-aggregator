package db

import "testing"

func TestNormalizeProductURL(t *testing.T) {
	in := "https://www.competitivecyclist.com/ion-rascal-amp-cycling-shoe-mens?clickid=abc&irgwc=1"
	want := "https://www.competitivecyclist.com/ion-rascal-amp-cycling-shoe-mens"
	if got := NormalizeProductURL(in); got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestProductSlugFromURL(t *testing.T) {
	u := "https://www.competitivecyclist.com/ion-rascal-amp-cycling-shoe-mens"
	if got := productSlugFromURL(u); got != "ion-rascal-amp-cycling-shoe-mens" {
		t.Fatalf("got %q", got)
	}
}
