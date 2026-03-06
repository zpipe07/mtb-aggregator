package metadata

import (
	"encoding/json"
	"regexp"
	"strings"

	"github.com/mtb-aggregator/api/internal/normalization"
)

// AliasSpecKeys normalizes raw spec key names to canonical keys using DB-loaded aliases.
// Unknown keys are stored with a snake_cased version of the original key.
func AliasSpecKeys(raw map[string]string) map[string]string {
	return normalization.AliasSpecKeys(raw)
}

// NormalizeSpecValues applies value normalization rules to spec values (unit formatting, value maps, etc.).
func NormalizeSpecValues(specs map[string]string) map[string]string {
	return normalization.NormalizeSpecValues(specs)
}

// MergeSpecs merges raw PDP specs into existing metadata by aliasing keys, normalizing values,
// and storing under metadata.specs.
func MergeSpecs(existing []byte, rawSpecs map[string]string) []byte {
	if len(rawSpecs) == 0 {
		return existing
	}
	aliased := AliasSpecKeys(rawSpecs)
	if len(aliased) == 0 {
		return existing
	}
	normalized := NormalizeSpecValues(aliased)

	var base map[string]interface{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &base)
	}
	if base == nil {
		base = make(map[string]interface{})
	}

	specsObj := make(map[string]interface{})
	for k, v := range normalized {
		specsObj[k] = v
	}
	base["specs"] = specsObj

	b, _ := json.Marshal(base)
	return b
}

var snakeRe = regexp.MustCompile(`[^a-zA-Z0-9]+`)

// specKeyLabels maps canonical spec keys to human-readable display labels.
// Unknown keys get auto-generated labels from snake_case via toTitleCase.
var specKeyLabels = map[string]string{
	"axle":         "Axle",
	"diameter":     "Diameter",
	"material":     "Material",
	"hub_spacing": "Hub Spacing",
	"wheel_size":  "Wheel Size",
	"travel":      "Travel",
	"tooth_count": "Tooth Count",
	"weight":      "Weight",
	"offset":      "Offset",
	"steerer":     "Steerer",
	"speeds":      "Drivetrain Speeds",
	"brake_type":  "Brake Type",
	"stanchion":   "Stanchion",
	"damper":      "Damper",
	"spring":      "Spring",
	"intended_use": "Intended Use",
}

// SpecKeyToLabel returns a human-readable label for a canonical spec key.
// Unknown keys are converted from snake_case to Title Case (e.g. "hub_spacing" -> "Hub Spacing").
func SpecKeyToLabel(key string) string {
	if key == "" {
		return ""
	}
	if label, ok := specKeyLabels[key]; ok {
		return label
	}
	return toTitleCase(key)
}

// toTitleCase converts snake_case to Title Case: "hub_spacing" -> "Hub Spacing".
func toTitleCase(s string) string {
	words := snakeRe.Split(s, -1)
	for i, w := range words {
		if len(w) == 0 {
			continue
		}
		words[i] = strings.ToUpper(w[:1]) + strings.ToLower(w[1:])
	}
	return strings.Join(words, " ")
}

// toSnakeCase converts "Frame Material" -> "frame_material", "Hub Spacing (mm)" -> "hub_spacing_mm".
func toSnakeCase(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = snakeRe.ReplaceAllString(s, "_")
	s = strings.Trim(strings.ToLower(s), "_")
	for strings.Contains(s, "__") {
		s = strings.ReplaceAll(s, "__", "_")
	}
	return s
}
