package normalization

import (
	"encoding/json"
	"regexp"
	"strings"
	"sync"
)

// KeyAlias maps a raw key substring (e.g. "hub spacing") to a canonical key (e.g. "hub_spacing").
// Longer/more specific substrings should have higher priority (checked first).
type KeyAlias struct {
	RawSubstr   string
	CanonicalKey string
}

// ValueRule defines a transform to apply to spec values. Rules are applied in priority order.
type ValueRule struct {
	SpecKey   string
	RuleType  string // unit_normalize, value_map, regex_replace, case_normalize
	Config    map[string]interface{}
	Priority  int
}

var (
	keyAliases []KeyAlias
	valueRules []ValueRule
	rulesMu    sync.RWMutex
)

// SetKeyAliases replaces the in-memory spec key alias list. Call after loading from DB.
func SetKeyAliases(aliases []KeyAlias) {
	rulesMu.Lock()
	defer rulesMu.Unlock()
	keyAliases = aliases
}

// SetValueRules replaces the in-memory value normalization rules. Call after loading from DB.
func SetValueRules(rules []ValueRule) {
	rulesMu.Lock()
	defer rulesMu.Unlock()
	valueRules = rules
}

// AliasSpecKeys normalizes raw spec key names to canonical keys using DB-loaded aliases.
// Falls back to toSnakeCase for unknown keys. Values pass through unchanged.
func AliasSpecKeys(raw map[string]string) map[string]string {
	out := make(map[string]string)
	if len(raw) == 0 {
		return out
	}
	rulesMu.RLock()
	aliases := keyAliases
	rulesMu.RUnlock()

	for k, v := range raw {
		key := strings.TrimSpace(k)
		value := strings.TrimSpace(v)
		if key == "" || value == "" {
			continue
		}
		keyLower := strings.ToLower(key)
		// Normalize for matching: treat underscores and spaces as equivalent so "defined color"
		// matches both "Defined Color" and "defined_color" (from prior toSnakeCase).
		keyNormalized := strings.ReplaceAll(keyLower, "_", " ")
		canon := ""
		for _, a := range aliases {
			substrNorm := strings.ReplaceAll(strings.ToLower(a.RawSubstr), "_", " ")
			if strings.Contains(keyNormalized, substrNorm) {
				canon = a.CanonicalKey
				break
			}
		}
		if canon == "" {
			canon = toSnakeCase(key)
		}
		out[canon] = value
	}
	return out
}

// NormalizeSpecValues applies value rules to a map of spec key -> value.
// Rules are applied per-key in priority order (higher priority first).
func NormalizeSpecValues(specs map[string]string) map[string]string {
	if len(specs) == 0 {
		return specs
	}
	rulesMu.RLock()
	rules := valueRules
	rulesMu.RUnlock()

	out := make(map[string]string)
	for k, v := range specs {
		out[k] = applyValueRules(k, v, rules)
	}
	return out
}

func applyValueRules(specKey, value string, rules []ValueRule) string {
	// Gather rules for this spec key, ordered by priority DESC
	var keyRules []ValueRule
	for _, r := range rules {
		if r.SpecKey == specKey {
			keyRules = append(keyRules, r)
		}
	}
	if len(keyRules) == 0 {
		return value
	}
	// Sort by priority desc (higher first)
	for i := 0; i < len(keyRules)-1; i++ {
		for j := i + 1; j < len(keyRules); j++ {
			if keyRules[j].Priority > keyRules[i].Priority {
				keyRules[i], keyRules[j] = keyRules[j], keyRules[i]
			}
		}
	}
	result := value
	for _, r := range keyRules {
		result = applyRule(result, r)
	}
	return result
}

func applyRule(value string, rule ValueRule) string {
	switch rule.RuleType {
	case "unit_normalize":
		return applyUnitNormalize(value, rule.Config)
	case "value_map":
		return applyValueMap(value, rule.Config)
	case "regex_replace":
		return applyRegexReplace(value, rule.Config)
	case "case_normalize":
		return applyCaseNormalize(value, rule.Config)
	default:
		return value
	}
}

func applyUnitNormalize(value string, config map[string]interface{}) string {
	result := value
	// Strip common trademark/copyright symbols
	if strip, _ := config["strip_trademark"].(bool); strip {
		result = regexp.MustCompile(`(?i)\s*[™®©]\s*`).ReplaceAllString(result, " ")
		result = regexp.MustCompile(`(?i)\s*\(tm\)\s*`).ReplaceAllString(result, " ")
		result = regexp.MustCompile(`(?i)\s*\(r\)\s*`).ReplaceAllString(result, " ")
	}
	// Normalize whitespace around units (e.g. "148 mm" -> "148mm", "150 mm" -> "150mm")
	unit, _ := config["unit"].(string)
	if unit != "" {
		re := regexp.MustCompile(`(\d+)\s*` + regexp.QuoteMeta(unit) + `\s*`)
		result = re.ReplaceAllString(result, "$1"+unit)
	}
	return strings.TrimSpace(result)
}

func applyValueMap(value string, config map[string]interface{}) string {
	mappings, ok := config["mappings"].(map[string]interface{})
	if !ok {
		return value
	}
	// Case-insensitive lookup first
	valLower := strings.ToLower(strings.TrimSpace(value))
	for raw, canon := range mappings {
		if strings.ToLower(strings.TrimSpace(raw)) == valLower {
			if s, ok := canon.(string); ok {
				return s
			}
		}
	}
	// Exact match
	if v, ok := mappings[value]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return value
}

func applyRegexReplace(value string, config map[string]interface{}) string {
	pattern, _ := config["pattern"].(string)
	replacement, _ := config["replace"].(string)
	if pattern == "" {
		return value
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return value
	}
	return re.ReplaceAllString(value, replacement)
}

func applyCaseNormalize(value string, config map[string]interface{}) string {
	mode, _ := config["mode"].(string)
	switch mode {
	case "lower":
		return strings.ToLower(value)
	case "upper":
		return strings.ToUpper(value)
	case "title":
		return toTitleCase(value)
	default:
		return value
	}
}

var snakeRe = regexp.MustCompile(`[^a-zA-Z0-9]+`)

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

// DefaultKeyAliases returns the built-in key aliases (used when DB is empty).
func DefaultKeyAliases() []KeyAlias {
	return []KeyAlias{
		{"rear hub spacing", "hub_spacing"},
		{"hub spacing", "hub_spacing"},
		{"wheel size", "wheel_size"},
		{"suspension travel", "travel"},
		{"fork travel", "travel"},
		{"rear travel", "travel"},
		{"travel", "travel"},
		{"rear axle", "axle"},
		{"axle width", "axle"},
		{"axle type", "axle"},
		{"axle", "axle"},
		{"frame material", "material"},
		{"material", "material"},
		{"claimed weight", "weight"},
		{"weight", "weight"},
		{"fork offset", "offset"},
		{"rake", "offset"},
		{"offset", "offset"},
		{"steerer tube", "steerer"},
		{"steerer", "steerer"},
		{"drivetrain speeds", "speeds"},
		{"speeds", "speeds"},
		{"piston count", "brake_type"},
		{"pistons", "brake_type"},
		{"brake type", "brake_type"},
		{"number of teeth", "tooth_count"},
		{"tooth count", "tooth_count"},
		{"teeth", "tooth_count"},
		{"available diameters", "diameter"},
		{"available diameter", "diameter"},
		{"seatpost diameter", "diameter"},
		{"diameter", "diameter"},
		{"intended use", "intended_use"},
		{"useful links", "useful_links"},
		{"stanchion", "stanchion"},
		{"damper", "damper"},
		{"spring", "spring"},
	}
}

// ParseRuleConfig unmarshals JSONB config into a map for ValueRule.
func ParseRuleConfig(configJSON []byte) (map[string]interface{}, error) {
	if len(configJSON) == 0 {
		return make(map[string]interface{}), nil
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(configJSON, &cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}
