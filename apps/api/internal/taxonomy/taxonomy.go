package taxonomy

import (
	"encoding/json"
	"os"
	"strings"
	"sync"
)

type mappingRule struct {
	Raw      []string `json:"raw"`
	Canonical []string `json:"canonical"`
}

type config struct {
	Mappings []mappingRule `json:"mappings"`
}

var (
	cfg   *config
	cfgMu sync.RWMutex
)

// Load reads the category taxonomy config from path (JSON with "mappings": [{ "raw": [...], "canonical": [...] }]).
// If path is empty, uses CATEGORY_TAXONOMY_PATH env or default "../../packages/shared/category_taxonomy.json".
func Load(path string) error {
	if path == "" {
		path = os.Getenv("CATEGORY_TAXONOMY_PATH")
	}
	if path == "" {
		path = "../../packages/shared/category_taxonomy.json"
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var c config
	if err := json.Unmarshal(data, &c); err != nil {
		return err
	}
	cfgMu.Lock()
	cfg = &c
	cfgMu.Unlock()
	return nil
}

// Map returns the canonical category path for the given raw category_path from a store (e.g. ["Disc Brake Pad"]).
// Matching is case-insensitive and uses substring: the raw path is joined and lowercased; the first mapping
// whose "raw" list contains a substring match wins. Returns nil if no mapping matches.
func Map(raw []string) []string {
	if len(raw) == 0 {
		return nil
	}
	cfgMu.RLock()
	defer cfgMu.RUnlock()
	if cfg == nil {
		return nil
	}
	normalized := strings.ToLower(strings.TrimSpace(strings.Join(raw, " ")))
	for _, rule := range cfg.Mappings {
		for _, r := range rule.Raw {
			if strings.Contains(normalized, strings.ToLower(strings.TrimSpace(r))) {
				return rule.Canonical
			}
		}
	}
	return nil
}
