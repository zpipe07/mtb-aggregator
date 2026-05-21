package metadata

import (
	"encoding/json"
	"fmt"
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

// MergeDescription merges a PDP description into existing metadata JSONB.
// Used for LLM spec extraction; description is stored at metadata.description.
func MergeDescription(existing []byte, description string) []byte {
	if description == "" {
		return existing
	}
	var base map[string]interface{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &base)
	}
	if base == nil {
		base = make(map[string]interface{})
	}
	base["description"] = description
	b, _ := json.Marshal(base)
	return b
}

// MergeLLMSpecs merges LLM extraction output into metadata.llm_specs (separate from PDP specs in metadata.specs).
// Keys in llm_overrides are manual corrections; we do not overwrite them with LLM result.
// confidence is stored at metadata.llm_confidence.
func MergeLLMSpecs(existing []byte, llmResult map[string]interface{}) []byte {
	if len(llmResult) == 0 {
		return existing
	}
	var base map[string]interface{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &base)
	}
	if base == nil {
		base = make(map[string]interface{})
	}
	llmSpecsObj, _ := base["llm_specs"].(map[string]interface{})
	if llmSpecsObj == nil {
		llmSpecsObj = make(map[string]interface{})
		base["llm_specs"] = llmSpecsObj
	}
	// Keys in llm_overrides are manual corrections; don't overwrite with LLM result.
	overrides, _ := base["llm_overrides"].(map[string]interface{})
	for k, v := range llmResult {
		if k == "confidence" {
			base["llm_confidence"] = v
			continue
		}
		if v == nil {
			continue
		}
		if overrides != nil && overrides[k] != nil {
			continue // respect manual override
		}
		switch val := v.(type) {
		case []interface{}:
			arr := make([]string, 0, len(val))
			for _, elem := range val {
				if elem == nil {
					continue
				}
				s := fmt.Sprint(elem)
				if s != "" && s != "<nil>" {
					arr = append(arr, s)
				}
			}
			if len(arr) > 0 {
				llmSpecsObj[k] = arr
			}
		default:
			llmSpecsObj[k] = fmt.Sprint(v)
		}
	}
	b, _ := json.Marshal(base)
	return b
}

// MergeManualCategoryOverride sets metadata.manual_category_override=true for admin manual category edits.
func MergeManualCategoryOverride(existing []byte) []byte {
	var base map[string]interface{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &base)
	}
	if base == nil {
		base = make(map[string]interface{})
	}
	base["manual_category_override"] = true
	b, _ := json.Marshal(base)
	return b
}

// MergeLLMCategory stores LLM category classification result in metadata.llm_category for admin review.
// Format: { "canonical_category": [...], "confidence": 0.95, "reasoning": "..." }
func MergeLLMCategory(existing []byte, llmCategory map[string]interface{}) []byte {
	if len(llmCategory) == 0 {
		return existing
	}
	var base map[string]interface{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &base)
	}
	if base == nil {
		base = make(map[string]interface{})
	}
	base["llm_category"] = llmCategory
	b, _ := json.Marshal(base)
	return b
}

// MergeLLMOverrides merges manual overrides into metadata.llm_overrides.
// Override values take precedence over specs when displaying. Pass nil to clear a key.
func MergeLLMOverrides(existing []byte, overrides map[string]interface{}) []byte {
	if len(overrides) == 0 {
		return existing
	}
	var base map[string]interface{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &base)
	}
	if base == nil {
		base = make(map[string]interface{})
	}
	ov, _ := base["llm_overrides"].(map[string]interface{})
	if ov == nil {
		ov = make(map[string]interface{})
		base["llm_overrides"] = ov
	}
	for k, v := range overrides {
		if v == nil {
			delete(ov, k)
		} else {
			ov[k] = fmt.Sprint(v)
		}
	}
	b, _ := json.Marshal(base)
	return b
}

var snakeRe = regexp.MustCompile(`[^a-zA-Z0-9]+`)

// specKeyLabels maps canonical spec keys to human-readable display labels.
// Unknown keys get auto-generated labels from snake_case via toTitleCase.
var specKeyLabels = map[string]string{
	"axle":              "Axle",
	"diameter":          "Diameter",
	"material":          "Material",
	"hub_spacing":       "Hub Spacing",
	"wheel_size":        "Wheel Size",
	"travel":            "Travel",
	"tooth_count":       "Tooth Count",
	"weight":            "Weight",
	"offset":            "Offset",
	"steerer":           "Steerer",
	"speeds":            "Drivetrain Speeds",
	"brake_type":        "Brake Type",
	"stanchion":         "Stanchion",
	"damper":            "Damper",
	"spring":            "Spring",
	"intended_use":      "Intended Use",
	"mtb_class":         "MTB Class",
	"front_travel_mm":   "Front Travel (mm)",
	"rear_travel_mm":    "Rear Travel (mm)",
	"frame_material":    "Frame Material",
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
