package metadata

import (
	"encoding/json"
	"testing"
)

func TestIsEmptyMetadata(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   []byte
		want bool
	}{
		{nil, true},
		{[]byte{}, true},
		{[]byte("{}"), true},
		{[]byte("  {}  "), true},
		{[]byte(`{"description":"x"}`), false},
	}
	for _, tc := range cases {
		if got := IsEmptyMetadata(tc.in); got != tc.want {
			t.Fatalf("IsEmptyMetadata(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}

func TestMergeScrapeMetadata_emptyIncomingPreservesEnriched(t *testing.T) {
	t.Parallel()
	existing := []byte(`{"specs":{"material":"carbon"},"llm_specs":{"wheel_size":"29"},"llm_category":{"confidence":0.9}}`)
	got := MergeScrapeMetadata(existing, nil)
	if string(got) != string(existing) {
		t.Fatalf("got %s, want existing preserved", got)
	}
}

func TestMergeScrapeMetadata_incomingOnEmpty(t *testing.T) {
	t.Parallel()
	incoming := []byte(`{"description":"feed text","specs":{"wheel_size":"29"}}`)
	got := MergeScrapeMetadata(nil, incoming)
	if string(got) != string(incoming) {
		t.Fatalf("got %s", got)
	}
}

func TestMergeScrapeMetadata_mergesDescriptionAndSpecsKeys(t *testing.T) {
	t.Parallel()
	existing := []byte(`{"specs":{"material":"carbon","travel":"150mm"},"llm_specs":{"intended_use":"trail"}}`)
	incoming := []byte(`{"description":"new desc","specs":{"wheel_size":"29"}}`)
	got := MergeScrapeMetadata(existing, incoming)

	var m map[string]interface{}
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatal(err)
	}
	if m["description"] != "new desc" {
		t.Fatalf("description: %v", m["description"])
	}
	specs, _ := m["specs"].(map[string]interface{})
	if specs["material"] != "carbon" || specs["travel"] != "150mm" || specs["wheel_size"] != "29" {
		t.Fatalf("specs merge: %v", specs)
	}
	if _, ok := m["llm_specs"]; !ok {
		t.Fatal("llm_specs wiped")
	}
}
