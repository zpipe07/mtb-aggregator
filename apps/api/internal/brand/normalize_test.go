package brand

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeTicketExamples(t *testing.T) {
	LoadMap(map[string]string{
		"sram":          "SRAM",
		"santa cruz":    "Santa Cruz",
		"yeti":          "Yeti",
		"chromag bikes": "Chromag",
		"chromag":       "Chromag",
		"revel bikes":   "Revel Bikes",
		"revel":         "Revel Bikes",
		"fox racing":    "FOX",
		"fox":           "FOX",
	})
	t.Cleanup(func() { LoadMap(nil) })

	cases := []struct {
		in, want string
	}{
		{"Santa Cruz Bicycles", "Santa Cruz"},
		{"Santa Cruz", "Santa Cruz"},
		{"santa cruz bicycles", "Santa Cruz"},
		{"Sram", "SRAM"},
		{"SRAM", "SRAM"},
		{"sram", "SRAM"},
		{"SRAM®", "SRAM"},
		{"Yeti Cycles", "Yeti"},
		{"Chromag Bikes", "Chromag"},
		{"Revel Bikes", "Revel Bikes"},
		{"FOX", "FOX"},
		{"Fox Racing", "FOX"},
		{"  Santa Cruz  ", "Santa Cruz"},
		{"", ""},
		{"   ", ""},
	}
	for _, tc := range cases {
		if got := Normalize(tc.in); got != tc.want {
			t.Errorf("Normalize(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestNormalizeUnknownBrandKeepsIdentity(t *testing.T) {
	LoadMap(map[string]string{"sram": "SRAM"})
	t.Cleanup(func() { LoadMap(nil) })

	if got := Normalize("Hope"); got != "Hope" {
		t.Errorf("unknown brand changed: got %q", got)
	}
	if got := Normalize("Ride Concepts"); got != "Ride Concepts" {
		t.Errorf("must not strip Concepts suffix: got %q", got)
	}
}

func TestNormalizeCleansTrademarksWithoutAlias(t *testing.T) {
	LoadMap(nil)
	if got := Normalize("Hope®"); got != "Hope" {
		t.Errorf("trademark strip: got %q", got)
	}
	if got := Normalize("Acme  Bikes"); got != "Acme Bikes" {
		t.Errorf("whitespace collapse: got %q", got)
	}
}

func TestLoadSharedAliasesFile(t *testing.T) {
	if err := Load(""); err != nil {
		t.Fatalf("Load shared aliases: %v", err)
	}
	if got := Normalize("Sram"); got != "SRAM" {
		t.Errorf("shared aliases Sram -> SRAM, got %q", got)
	}
	if got := Normalize("Santa Cruz Bicycles"); got != "Santa Cruz" {
		t.Errorf("shared aliases Santa Cruz Bicycles -> Santa Cruz, got %q", got)
	}
	if got := Normalize("100%"); got != "100%" {
		t.Errorf("shared aliases 100%%, got %q", got)
	}
}

func TestLoadExplicitPath(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "aliases.json")
	if err := os.WriteFile(path, []byte(`{"foo":"FOO"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Load(path); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { LoadMap(nil) })
	if got := Normalize("foo"); got != "FOO" {
		t.Errorf("got %q", got)
	}
}
