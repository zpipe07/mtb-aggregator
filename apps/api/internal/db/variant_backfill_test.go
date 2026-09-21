package db

import (
	"net/http"
	"testing"
	"time"
)

func TestParseRetryAfterHeader(t *testing.T) {
	t.Parallel()
	h := make(http.Header)
	d, ok := parseRetryAfterHeader(h)
	if ok || d != 0 {
		t.Fatalf("empty: got %v %v", d, ok)
	}

	h.Set("Retry-After", "3")
	d, ok = parseRetryAfterHeader(h)
	if !ok || d != 3*time.Second {
		t.Fatalf("seconds: got %v %v", d, ok)
	}

	h.Set("Retry-After", "0")
	d, ok = parseRetryAfterHeader(h)
	if !ok || d != 0 {
		t.Fatalf("zero seconds: got %v %v", d, ok)
	}
}

func TestWaitBeforeHTTPRetry_Exponential(t *testing.T) {
	t.Parallel()
	resp := &http.Response{StatusCode: 429, Header: make(http.Header)}
	d := waitBeforeHTTPRetry(resp, 1)
	if d != 2*time.Second {
		t.Fatalf("attempt 1: want 2s got %v", d)
	}
	d = waitBeforeHTTPRetry(resp, 2)
	if d != 4*time.Second {
		t.Fatalf("attempt 2: want 4s got %v", d)
	}
}

func TestCollectionPathForJSON(t *testing.T) {
	t.Parallel()
	origin, path, err := collectionPathForJSON("https://worldwidecyclery.com/collections/deals?foo=1")
	if err != nil {
		t.Fatal(err)
	}
	if origin != "https://worldwidecyclery.com" || path != "/collections/deals" {
		t.Fatalf("got origin=%q path=%q", origin, path)
	}
}

func TestBuildVariantOptionMap_OmitsPlaceholders(t *testing.T) {
	t.Parallel()
	def := "Default Title"
	inStock := "https://schema.org/InStock"
	black := "Black"
	medium := "Medium"

	titleOnly := shopifyProductJSON{}
	titleOnly.Product.Options = []struct {
		Name string `json:"name"`
	}{{Name: "Title"}}
	titleOnly.Product.Variants = []shopifyVariantJSON{{
		ID:      1,
		Option1: &def,
		Title:   &def,
	}}
	if got := buildVariantOptionMap(&titleOnly, &titleOnly.Product.Variants[0]); len(got) != 0 {
		t.Fatalf("Title/Default Title: got %v, want empty", got)
	}

	mixed := shopifyProductJSON{}
	mixed.Product.Options = []struct {
		Name string `json:"name"`
	}{{Name: "Schema Stock Status"}, {Name: "Color"}, {Name: "Size"}}
	mixed.Product.Variants = []shopifyVariantJSON{{
		ID:      2,
		Option1: &inStock,
		Option2: &black,
		Option3: &medium,
	}}
	got := buildVariantOptionMap(&mixed, &mixed.Product.Variants[0])
	if got["Color"] != "Black" || got["Size"] != "Medium" || len(got) != 2 {
		t.Fatalf("mixed: got %v", got)
	}
}

func TestWaitBeforeHTTPRetry_RetryAfterHeader(t *testing.T) {
	t.Parallel()
	h := make(http.Header)
	h.Set("Retry-After", "12")
	resp := &http.Response{StatusCode: 429, Header: h}
	d := waitBeforeHTTPRetry(resp, 99)
	if d != 12*time.Second {
		t.Fatalf("Retry-After: want 12s got %v", d)
	}
}
