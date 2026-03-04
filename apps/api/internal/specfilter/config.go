package specfilter

import (
	"context"
	"sort"
	"strings"
)

// Config holds loaded spec_filter_config and spec_value_aliases for query-time application.
type Config struct {
	KeyConfigs   map[string]KeyConfig            // spec_key -> config
	ValueAliases map[string]map[string]string    // spec_key -> raw_value -> display_value
	// displayToRaw: spec_key -> display_value -> []raw_values to match (includes display_value itself)
	displayToRaw map[string]map[string][]string
}

// KeyConfig is the effective config for a spec key (visibility, merge target, label, sort order).
type KeyConfig struct {
	Visible   bool
	MergeInto string
	Label     string
	SortOrder int
}

// SpecFacetValue is one value option for a spec facet with its count (mirrors db.SpecFacetValue).
type SpecFacetValue struct {
	Value string
	Count int
}

// KvInput is a raw (key, value, count) from the facets query.
type KvInput struct {
	Key   string
	Value string
	Count int
}

// ConfigLoader loads spec filter config from storage. Implemented by db.DB via adapter.
type ConfigLoader interface {
	ListSpecFilterConfigs(ctx context.Context) ([]SpecFilterConfigRow, error)
	ListSpecValueAliases(ctx context.Context, specKey string) ([]SpecValueAliasRow, error)
}

// SpecFilterConfigRow is one row from spec_filter_config (avoids db package import).
type SpecFilterConfigRow struct {
	SpecKey      string
	Visible      bool
	MergeInto    *string
	DisplayLabel *string
	SortOrder    int
}

// SpecValueAliasRow is one row from spec_value_aliases (avoids db package import).
type SpecValueAliasRow struct {
	SpecKey      string
	RawValue     string
	DisplayValue string
}

// LoadConfig loads spec_filter_config and spec_value_aliases via the ConfigLoader.
// Returns nil config and nil error if tables don't exist (migration not run yet).
func LoadConfig(ctx context.Context, loader ConfigLoader) (*Config, error) {
	cfgs, err := loader.ListSpecFilterConfigs(ctx)
	if err != nil {
		if strings.Contains(err.Error(), "does not exist") {
			return nil, nil
		}
		return nil, err
	}
	aliases, err := loader.ListSpecValueAliases(ctx, "")
	if err != nil {
		if strings.Contains(err.Error(), "does not exist") {
			return nil, nil
		}
		return nil, err
	}

	keyConfigs := make(map[string]KeyConfig)
	for _, c := range cfgs {
		label := ""
		if c.DisplayLabel != nil && *c.DisplayLabel != "" {
			label = *c.DisplayLabel
		}
		mergeInto := ""
		if c.MergeInto != nil && *c.MergeInto != "" {
			mergeInto = *c.MergeInto
		}
		keyConfigs[c.SpecKey] = KeyConfig{
			Visible:   c.Visible,
			MergeInto: mergeInto,
			Label:     label,
			SortOrder: c.SortOrder,
		}
	}

	valueAliases := make(map[string]map[string]string)
	displayToRaw := make(map[string]map[string][]string)
	for _, a := range aliases {
		if valueAliases[a.SpecKey] == nil {
			valueAliases[a.SpecKey] = make(map[string]string)
		}
		valueAliases[a.SpecKey][a.RawValue] = a.DisplayValue

		if displayToRaw[a.SpecKey] == nil {
			displayToRaw[a.SpecKey] = make(map[string][]string)
		}
		disp := a.DisplayValue
		raws := displayToRaw[a.SpecKey][disp]
		found := false
		for _, r := range raws {
			if r == a.RawValue {
				found = true
				break
			}
		}
		if !found {
			displayToRaw[a.SpecKey][disp] = append(displayToRaw[a.SpecKey][disp], a.RawValue)
		}
	}
	for specKey, dispMap := range displayToRaw {
		for disp := range dispMap {
			found := false
			for _, r := range dispMap[disp] {
				if r == disp {
					found = true
					break
				}
			}
			if !found {
				displayToRaw[specKey][disp] = append([]string{disp}, dispMap[disp]...)
			}
		}
	}

	return &Config{
		KeyConfigs:   keyConfigs,
		ValueAliases: valueAliases,
		displayToRaw: displayToRaw,
	}, nil
}

// ApplyToFacets applies key merging, visibility filtering, and value normalization to raw facet data.
// Returns keyProductCount, keyValues (grouped by final key), and keyOrder for building SpecFacets.
func ApplyToFacets(kvs []KvInput, config *Config) (keyProductCount map[string]int, keyValues map[string][]SpecFacetValue, keyOrder []string) {
	keyProductCount = make(map[string]int)
	keyValues = make(map[string][]SpecFacetValue)

	for _, r := range kvs {
		key := r.Key
		value := r.Value
		count := r.Count

		// Key merge: if config says merge this key into another, use the target key
		if config != nil {
			if cfg, ok := config.KeyConfigs[key]; ok && cfg.MergeInto != "" {
				key = cfg.MergeInto
			}
		}

		// Visibility: skip keys explicitly hidden
		if config != nil {
			if cfg, ok := config.KeyConfigs[key]; ok && !cfg.Visible {
				continue
			}
		}

		// Value normalization: replace with display_value if we have an alias
		if config != nil && config.ValueAliases[key] != nil {
			if display, ok := config.ValueAliases[key][value]; ok {
				value = display
			} else {
				valLower := strings.ToLower(value)
				for raw, disp := range config.ValueAliases[key] {
					if strings.ToLower(raw) == valLower {
						value = disp
						break
					}
				}
			}
		}

		keyProductCount[key] += count
		if len(keyValues[key]) < 50 {
			// Coalesce duplicate values (after normalization)
			found := false
			for i := range keyValues[key] {
				if keyValues[key][i].Value == value {
					keyValues[key][i].Count += count
					found = true
					break
				}
			}
			if !found {
				keyValues[key] = append(keyValues[key], SpecFacetValue{Value: value, Count: count})
			}
		}
	}

	return keyProductCount, keyValues, buildKeyOrder(keyProductCount, config)
}

func buildKeyOrder(keyProductCount map[string]int, config *Config) []string {
	keyOrder := make([]string, 0, len(keyProductCount))
	for k := range keyProductCount {
		if keyProductCount[k] >= 0 {
			keyOrder = append(keyOrder, k)
		}
	}
	sortOrderOf := func(k string) int {
		if config != nil {
			if cfg, ok := config.KeyConfigs[k]; ok {
				return cfg.SortOrder
			}
		}
		return 0
	}
	sort.Slice(keyOrder, func(i, j int) bool {
		ki, kj := keyOrder[i], keyOrder[j]
		soi, soj := sortOrderOf(ki), sortOrderOf(kj)
		if soi != soj {
			return soi > soj
		}
		return keyProductCount[ki] > keyProductCount[kj]
	})
	if len(keyOrder) > 20 {
		keyOrder = keyOrder[:20]
	}
	return keyOrder
}

// GetLabel returns the display label for a spec key. Uses config override if set, else empty (caller uses metadata.SpecKeyToLabel).
func (c *Config) GetLabel(specKey string) string {
	if c != nil && c.KeyConfigs[specKey].Label != "" {
		return c.KeyConfigs[specKey].Label
	}
	return ""
}

// ExpandFilterValues expands spec filter values for deal queries. When a display value has aliases,
// returns all raw values to match (including the display value itself). Otherwise returns the single value.
// Result: map[specKey][]valuesForILIKE
func ExpandFilterValues(specFilters map[string]string, config *Config) map[string][]string {
	out := make(map[string][]string)
	for key, val := range specFilters {
		if key == "" || val == "" {
			continue
		}
		if config != nil && config.displayToRaw[key] != nil {
			if raws := config.displayToRaw[key][val]; len(raws) > 0 {
				out[key] = raws
				continue
			}
		}
		out[key] = []string{val}
	}
	return out
}
