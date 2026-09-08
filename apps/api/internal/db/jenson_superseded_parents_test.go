package db

import (
	"strings"
	"testing"
)

func TestHideJensonSupersededParentsSQL(t *testing.T) {
	t.Parallel()
	sql := hideJensonSupersededParentsSQL
	for _, want := range []string{
		"SET hidden = true",
		"s.store_type = 'jensonusa'",
		"sl.hidden = false",
		"sl2.product_url = sl.product_url",
		"starts_with(sl2.store_sku, sl.store_sku)",
		"char_length(sl2.store_sku) > char_length(sl.store_sku)",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("hideJensonSupersededParentsSQL missing %q in:\n%s", want, sql)
		}
	}
}

func TestHideUniversalCyclesSupersededParentsSQL(t *testing.T) {
	t.Parallel()
	sql := hideUniversalCyclesSupersededParentsSQL
	for _, want := range []string{
		"SET hidden = true",
		"s.store_type = 'universalcycles'",
		"sl.store_sku NOT LIKE '%-%'",
		"sl2.store_sku LIKE sl.store_sku || '-%'",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("hideUniversalCyclesSupersededParentsSQL missing %q in:\n%s", want, sql)
		}
	}
}
