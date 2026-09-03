package db

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCategoryJSONIncludesHideFromNav(t *testing.T) {
	c := Category{
		ID:          1,
		Slug:        "gear-helmet-parts",
		Name:        "Helmet parts",
		HideFromNav: true,
	}
	b, err := json.Marshal(c)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `"hide_from_nav":true`) {
		t.Fatalf("expected hide_from_nav in JSON, got %s", b)
	}
}
