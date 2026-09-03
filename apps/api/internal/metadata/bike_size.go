package metadata

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
)

var (
	reBikeInch       = regexp.MustCompile(`(?i)^\s*(\d{2}(?:\.\d)?)\s*(?:in(?:ch(?:es)?)?|"|'')?\s*$`)
	reSpecializedS   = regexp.MustCompile(`(?i)^\s*s\s*([1-6])\s*$`)
	reWheelSizeToken = regexp.MustCompile(`(?i)^(29|27\.5|27,5|650b|700c|mx)$`)
	reOptionIndexKey = regexp.MustCompile(`(?i)^option\s*\d+$`)
)

// VariantBikeSizeFromOptions reads Size / Bike Size / Frame Size from variant_options JSON.
func VariantBikeSizeFromOptions(variantOpts []byte) string {
	if len(variantOpts) == 0 {
		return ""
	}
	var m map[string]string
	if err := json.Unmarshal(variantOpts, &m); err != nil {
		var anyMap map[string]interface{}
		if err2 := json.Unmarshal(variantOpts, &anyMap); err2 != nil {
			return ""
		}
		m = make(map[string]string, len(anyMap))
		for k, v := range anyMap {
			if s, ok := v.(string); ok {
				m[k] = s
			}
		}
	}
	for k, v := range m {
		if optionKeyIsSize(k) {
			if t := strings.TrimSpace(v); t != "" {
				return t
			}
		}
	}
	return ""
}

func optionKeyIsSize(key string) bool {
	k := strings.ToLower(strings.TrimSpace(key))
	if k == "" || reOptionIndexKey.MatchString(k) {
		return false
	}
	return strings.Contains(k, "size")
}

// NormalizeBikeSize canonicalizes a raw size label for llm_specs.bike_size.
func NormalizeBikeSize(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	if strings.Contains(s, ",") {
		return ""
	}
	lower := strings.ToLower(s)
	if reWheelSizeToken.MatchString(lower) {
		return ""
	}
	if reOneSizeHint.MatchString(lower) {
		return ""
	}
	if m := reSpecializedS.FindStringSubmatch(s); len(m) == 2 {
		return "S" + m[1]
	}
	if letter := normalizeSingleLetterSize(s); letter != "" {
		return letter
	}
	if strings.Contains(s, "/") || strings.Contains(s, "\\") {
		if combo := normalizeSizeCombo(s); combo != "" {
			return combo
		}
	}
	if m := reBikeInch.FindStringSubmatch(s); len(m) == 2 {
		n, err := strconv.ParseFloat(m[1], 64)
		if err == nil && n >= 13 && n <= 23 {
			if n == float64(int(n)) {
				return strconv.Itoa(int(n))
			}
			return strings.TrimRight(strings.TrimRight(strconv.FormatFloat(n, 'f', 1, 64), "0"), ".")
		}
	}
	return ""
}

// ApplyBikeSizeFromVariant merges normalized bike_size into metadata.llm_specs.
// Respects llm_overrides.bike_size. Returns existing unchanged when variant has no size.
func ApplyBikeSizeFromVariant(existing []byte, variantOpts []byte) []byte {
	raw := VariantBikeSizeFromOptions(variantOpts)
	if raw == "" {
		return existing
	}
	normalized := NormalizeBikeSize(raw)
	if normalized == "" {
		return existing
	}

	var base map[string]interface{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &base)
	}
	if base == nil {
		base = make(map[string]interface{})
	}
	if overrides, _ := base["llm_overrides"].(map[string]interface{}); overrides != nil {
		if _, ok := overrides["bike_size"]; ok {
			return existing
		}
	}
	llmSpecs, _ := base["llm_specs"].(map[string]interface{})
	if llmSpecs == nil {
		llmSpecs = make(map[string]interface{})
		base["llm_specs"] = llmSpecs
	}
	llmSpecs["bike_size"] = normalized
	b, err := json.Marshal(base)
	if err != nil {
		return existing
	}
	return b
}
