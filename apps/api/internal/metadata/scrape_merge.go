package metadata

import (
	"encoding/json"
	"strings"
)

// IsEmptyMetadata reports whether JSON metadata is nil, empty, or an empty object.
func IsEmptyMetadata(b []byte) bool {
	if len(b) == 0 {
		return true
	}
	s := strings.TrimSpace(string(b))
	return s == "" || s == "null" || s == "{}"
}

// MergeScrapeMetadata merges scrape-time metadata (name extraction, feed description) into
// existing listing metadata without wiping enrichment fields (PDP specs, llm_specs, llm_category, etc.).
// When incoming scrape metadata is empty, existing is returned unchanged.
func MergeScrapeMetadata(existing, incoming []byte) []byte {
	if IsEmptyMetadata(incoming) {
		return existing
	}
	if IsEmptyMetadata(existing) {
		return incoming
	}

	var base, scrape map[string]interface{}
	if err := json.Unmarshal(existing, &base); err != nil || base == nil {
		base = make(map[string]interface{})
	}
	if err := json.Unmarshal(incoming, &scrape); err != nil || scrape == nil {
		return existing
	}

	if desc, ok := scrape["description"].(string); ok && strings.TrimSpace(desc) != "" {
		base["description"] = desc
	}

	if scrapeSpecs, ok := scrape["specs"].(map[string]interface{}); ok && len(scrapeSpecs) > 0 {
		existingSpecs, _ := base["specs"].(map[string]interface{})
		if existingSpecs == nil {
			existingSpecs = make(map[string]interface{})
		}
		for k, v := range scrapeSpecs {
			if v != nil {
				existingSpecs[k] = v
			}
		}
		base["specs"] = existingSpecs
	}

	out, err := json.Marshal(base)
	if err != nil {
		return existing
	}
	return out
}
