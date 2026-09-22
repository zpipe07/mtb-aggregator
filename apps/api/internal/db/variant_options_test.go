package db

import (
	"encoding/json"
	"testing"
)

func TestIsPlaceholderVariantOption(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name, key, value string
		want             bool
	}{
		{name: "shopify title key", key: "Title", value: "Default Title", want: true},
		{name: "title key any value", key: "title", value: "Maven Ultimate", want: true},
		{name: "default title any key", key: "Option 1", value: "default title", want: true},
		{name: "underscored title", key: "TITLE", value: "Default  Title", want: true},
		{name: "schema stock status", key: "Schema Stock Status", value: "https://schema.org/InStock", want: true},
		{name: "schemaStockStatus compact", key: "schemaStockStatus", value: "InStock", want: true},
		{name: "schema.org url", key: "Availability", value: "https://schema.org/OutOfStock", want: true},
		{name: "empty value", key: "Size", value: "  ", want: true},
		{name: "real size", key: "Size", value: "XL", want: false},
		{name: "real color", key: "Color", value: "Red/Black", want: false},
		{name: "wheel size", key: "Wheel Size", value: "29", want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := isPlaceholderVariantOption(tc.key, tc.value); got != tc.want {
				t.Fatalf("isPlaceholderVariantOption(%q, %q) = %v, want %v", tc.key, tc.value, got, tc.want)
			}
		})
	}
}

func TestStripPlaceholderVariantOptionsJSON(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "title only", in: `{"Title":"Default Title"}`, want: ""},
		{name: "empty object", in: `{}`, want: ""},
		{name: "null", in: `null`, want: ""},
		{name: "mixed keeps size color", in: `{"Title":"Default Title","Size":"XL","Color":"Black","Schema Stock Status":"https://schema.org/InStock"}`, want: `{"Color":"Black","Size":"XL"}`},
		{name: "real options only", in: `{"Size":"M","Color":"Green"}`, want: `{"Color":"Green","Size":"M"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := StripPlaceholderVariantOptionsJSON([]byte(tc.in))
			if tc.want == "" {
				if len(got) != 0 {
					t.Fatalf("got %s, want empty", got)
				}
				return
			}
			var gotMap, wantMap map[string]string
			if err := json.Unmarshal(got, &gotMap); err != nil {
				t.Fatalf("unmarshal got %s: %v", got, err)
			}
			if err := json.Unmarshal([]byte(tc.want), &wantMap); err != nil {
				t.Fatalf("unmarshal want: %v", err)
			}
			if len(gotMap) != len(wantMap) {
				t.Fatalf("got %v, want %v", gotMap, wantMap)
			}
			for k, v := range wantMap {
				if gotMap[k] != v {
					t.Fatalf("got %v, want %v", gotMap, wantMap)
				}
			}
		})
	}
}

func TestSortedVariantOptionsJSON_omitsPlaceholders(t *testing.T) {
	t.Parallel()
	got, err := sortedVariantOptionsJSON(map[string]string{
		"Title":               "Default Title",
		"Size":                "XL",
		"Schema Stock Status": "https://schema.org/InStock",
	})
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]string
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatalf("unmarshal %s: %v", got, err)
	}
	if m["Size"] != "XL" || len(m) != 1 {
		t.Fatalf("got %v, want Size only", m)
	}

	empty, err := sortedVariantOptionsJSON(map[string]string{"Title": "Default Title"})
	if err != nil {
		t.Fatal(err)
	}
	if empty != nil {
		t.Fatalf("title-only: got %s, want nil", empty)
	}
}
