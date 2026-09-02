package brand

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode"
)

var (
	aliases   map[string]string // lowercase key -> canonical name
	aliasesMu sync.RWMutex
)

// Product/legal suffixes stripped when looking up aliases (longest first).
// Intentionally omits words that distinguish brands (racing, designs, concepts).
var brandSuffixes = []string{
	" incorporated",
	" corporation",
	" bicycles",
	" bicycle",
	" company",
	" cycling",
	" cycles",
	" bikes",
	" bike",
	" corp.",
	" corp",
	" ltd.",
	" ltd",
	" llc.",
	" llc",
	" inc.",
	" inc",
	" co.",
	" mtb",
	" co",
}

// Load reads the brand alias config from path (JSON: { "sram": "SRAM", ... }).
// If path is empty, uses BRAND_ALIASES_PATH or searches known locations including
// packages/shared/brand_aliases.json (repo root, Docker /app, walk-up from cwd).
// Safe to call multiple times; reloads from file each time.
func Load(path string) error {
	candidates := aliasPathCandidates(path)
	var lastErr error
	for _, p := range candidates {
		data, err := os.ReadFile(p)
		if err != nil {
			lastErr = err
			continue
		}
		if err := loadBytes(data); err != nil {
			return fmt.Errorf("parse brand aliases %s: %w", p, err)
		}
		return nil
	}
	if lastErr == nil {
		return fmt.Errorf("brand aliases not found (tried %d paths)", len(candidates))
	}
	return lastErr
}

// LoadMap replaces the in-memory alias map (tests). Nil or empty clears aliases.
func LoadMap(raw map[string]string) {
	aliasesMu.Lock()
	defer aliasesMu.Unlock()
	if len(raw) == 0 {
		aliases = nil
		return
	}
	aliases = buildAliasIndex(raw)
}

func loadBytes(data []byte) error {
	var raw map[string]string
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	m := buildAliasIndex(raw)
	aliasesMu.Lock()
	aliases = m
	aliasesMu.Unlock()
	return nil
}

func buildAliasIndex(raw map[string]string) map[string]string {
	m := make(map[string]string, len(raw)*2)
	for k, v := range raw {
		canonical := strings.TrimSpace(v)
		if canonical == "" {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(k))
		if key != "" {
			m[key] = canonical
		}
		// Index the canonical name so case-only variants (Sram vs SRAM) match.
		m[strings.ToLower(canonical)] = canonical
	}
	return m
}

func aliasPathCandidates(explicit string) []string {
	seen := make(map[string]struct{})
	var out []string
	add := func(p string) {
		if p == "" {
			return
		}
		if !filepath.IsAbs(p) {
			if abs, err := filepath.Abs(p); err == nil {
				p = abs
			}
		}
		if _, ok := seen[p]; ok {
			return
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	add(explicit)
	add(os.Getenv("BRAND_ALIASES_PATH"))
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		add(filepath.Join(dir, "packages", "shared", "brand_aliases.json"))
		add(filepath.Join(dir, "brand_aliases.json"))
	}
	wd, err := os.Getwd()
	if err == nil {
		dir := wd
		for i := 0; i < 8; i++ {
			add(filepath.Join(dir, "packages", "shared", "brand_aliases.json"))
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}
	add("/app/packages/shared/brand_aliases.json")
	return out
}

// Normalize returns the canonical brand name for s.
// Lookup is case-insensitive against alias keys and canonical names, and retries
// after stripping common suffixes (Bicycles, Cycles, Inc, …).
// Trademarks and extra whitespace are always cleaned. Empty input returns "".
func Normalize(s string) string {
	s = cleanBrand(s)
	if s == "" {
		return ""
	}
	aliasesMu.RLock()
	defer aliasesMu.RUnlock()
	if aliases == nil {
		return s
	}
	for _, candidate := range lookupCandidates(s) {
		if canonical, ok := aliases[strings.ToLower(candidate)]; ok {
			return canonical
		}
	}
	return s
}

func cleanBrand(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	replacer := strings.NewReplacer(
		"\u00ae", "", // ®
		"\u2122", "", // ™
		"\u00a9", "", // ©
		"(TM)", "",
		"(tm)", "",
		"(R)", "",
		"(r)", "",
	)
	s = replacer.Replace(s)
	s = strings.Join(strings.Fields(s), " ")
	s = strings.TrimRightFunc(s, func(r rune) bool {
		return unicode.IsPunct(r) && r != '%'
	})
	return strings.TrimSpace(s)
}

func lookupCandidates(s string) []string {
	out := []string{s}
	seen := map[string]struct{}{strings.ToLower(s): {}}
	cur := s
	for i := 0; i < 4; i++ {
		next := stripOneSuffix(cur)
		if next == cur {
			break
		}
		key := strings.ToLower(next)
		if _, ok := seen[key]; ok {
			break
		}
		seen[key] = struct{}{}
		out = append(out, next)
		cur = next
	}
	return out
}

func stripOneSuffix(s string) string {
	lower := strings.ToLower(s)
	for _, suf := range brandSuffixes {
		if !strings.HasSuffix(lower, suf) {
			continue
		}
		trimmed := strings.TrimSpace(s[:len(s)-len(suf)])
		trimmed = strings.TrimRight(trimmed, ",.-")
		trimmed = strings.TrimSpace(trimmed)
		if trimmed == "" {
			continue
		}
		return trimmed
	}
	return s
}
