package enrichstate

import (
	"testing"
)

func TestNormalizePayload_stableAcrossKeyOrder(t *testing.T) {
	t.Parallel()
	a := SnapshotPayload{
		CategoryPath: []string{"Components", "Brakes"},
		RawSpecs:     map[string]string{"Rotor Diameter": "203mm", "Brand": "SRAM"},
	}
	b := SnapshotPayload{
		CategoryPath: []string{"Components", "Brakes"},
		RawSpecs:     map[string]string{"Brand": "SRAM", "Rotor Diameter": "203mm"},
	}
	na, err := NormalizePayload(a)
	if err != nil {
		t.Fatal(err)
	}
	nb, err := NormalizePayload(b)
	if err != nil {
		t.Fatal(err)
	}
	if string(na) != string(nb) {
		t.Fatalf("normalized bytes differ:\n%s\n%s", na, nb)
	}
	ha := HashPayload(na)
	hb := HashPayload(nb)
	if ha != hb {
		t.Fatalf("hash mismatch %s vs %s", ha, hb)
	}
}

func TestNormalizePayload_distinctPayloadsDistinctHash(t *testing.T) {
	t.Parallel()
	p1 := SnapshotPayload{RawSpecs: map[string]string{"a": "1"}}
	p2 := SnapshotPayload{RawSpecs: map[string]string{"a": "2"}}
	h1, _, err := HashSnapshotPayload(p1)
	if err != nil {
		t.Fatal(err)
	}
	h2, _, err := HashSnapshotPayload(p2)
	if err != nil {
		t.Fatal(err)
	}
	if h1 == h2 {
		t.Fatal("expected different hashes")
	}
}

func TestNormalizePayload_omitsEmptyVariants(t *testing.T) {
	t.Parallel()
	withEmpty := SnapshotPayload{Unavailable: false}
	without := SnapshotPayload{Unavailable: false, Variants: nil}
	n1, _ := NormalizePayload(withEmpty)
	n2, _ := NormalizePayload(without)
	if string(n1) != string(n2) {
		t.Fatalf("empty variants should not affect normalization")
	}
}

func TestHashSnapshotPayload_deterministic(t *testing.T) {
	t.Parallel()
	p := SnapshotPayload{
		CategoryPath: []string{"Bikes"},
		Description:  strPtr("A trail bike"),
	}
	h1, _, err := HashSnapshotPayload(p)
	if err != nil {
		t.Fatal(err)
	}
	h2, _, err := HashSnapshotPayload(p)
	if err != nil {
		t.Fatal(err)
	}
	if h1 != h2 || len(h1) != 64 {
		t.Fatalf("expected stable 64-char hex hash, got %q", h1)
	}
}

func strPtr(s string) *string { return &s }
