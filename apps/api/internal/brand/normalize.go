package brand

import (
	"encoding/json"
	"os"
	"strings"
	"sync"
)

var (
	aliases   map[string]string // lowercase key -> canonical name
	aliasesMu sync.RWMutex
)

// Load reads the brand alias config from path (JSON: { "sram": "SRAM", ... }).
// If path is empty, uses BRAND_ALIASES_PATH env or default "../../packages/shared/brand_aliases.json".
// Safe to call multiple times; reloads from file each time.
func Load(path string) error {
	if path == "" {
		path = os.Getenv("BRAND_ALIASES_PATH")
	}
	if path == "" {
		path = "../../packages/shared/brand_aliases.json"
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var raw map[string]string
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	// Normalize keys to lowercase for lookup
	m := make(map[string]string, len(raw))
	for k, v := range raw {
		m[strings.ToLower(strings.TrimSpace(k))] = strings.TrimSpace(v)
	}
	aliasesMu.Lock()
	aliases = m
	aliasesMu.Unlock()
	return nil
}

// Normalize returns the canonical brand name for s if it exists in the alias map (case-insensitive), otherwise returns s trimmed.
// If s is empty, returns "".
func Normalize(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	aliasesMu.RLock()
	defer aliasesMu.RUnlock()
	if aliases == nil {
		return s
	}
	if canonical, ok := aliases[strings.ToLower(s)]; ok {
		return canonical
	}
	return s
}
