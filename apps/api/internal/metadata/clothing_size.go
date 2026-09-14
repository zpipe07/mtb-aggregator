package metadata

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
)

var (
	reWaistSize     = regexp.MustCompile(`(?i)^\s*(\d{2,3})\s*(?:in|"|''|cms?)?\s*$`)
	reKidsHint      = regexp.MustCompile(`(?i)\b(youth|junior|kids?)\b`)
	reOneSizeHint   = regexp.MustCompile(`(?i)\b(one\s*size|osfa|uni-?size)\b|^os$`)
	reSKUJunk       = regexp.MustCompile(`(?i)^(UY|UA|UC|UW|T)$`)
	reSizeCombo     = regexp.MustCompile(`(?i)([xsml]{1,3})\s*[/\\-]\s*([xsml]{1,3})`)
	reLeadingLetter = regexp.MustCompile(`(?i)^\s*#?\s*([XSML]{1,3})\b`)
	reUSEUSize      = regexp.MustCompile(`(?i)^\s*US\s+(.+?)\s*/\s*EU\s+(.+)\s*$`)
	reTrailingParen = regexp.MustCompile(`\(([^)]+)\)\s*$`)
)

// VariantSizeFromOptions reads Size/size from variant_options JSON.
func VariantSizeFromOptions(variantOpts []byte) string {
	if len(variantOpts) == 0 {
		return ""
	}
	var m map[string]string
	if err := json.Unmarshal(variantOpts, &m); err != nil {
		return ""
	}
	if v := strings.TrimSpace(m["Size"]); v != "" {
		return v
	}
	if v := strings.TrimSpace(m["size"]); v != "" {
		return v
	}
	return ""
}

// NormalizeClothingSize canonicalizes a single-size label for llm_specs.clothing_size.
// Size-runs (comma lists or 3+ slash-separated sizes) return empty; use NormalizeClothingSizes.
func NormalizeClothingSize(raw string) string {
	sizes := NormalizeClothingSizes(raw)
	if len(sizes) == 1 {
		return sizes[0]
	}
	return ""
}

// NormalizeClothingSizes splits size charts into canonical sizes.
// "S, M, L, XL" and "Small, Medium, Large" become individual letter sizes;
// "S/M" stays a two-size combo; US/EU dual labels keep the US size.
func NormalizeClothingSizes(raw string) []string {
	s := strings.TrimSpace(raw)
	if s == "" || strings.EqualFold(s, "null") {
		return nil
	}
	if reSKUJunk.MatchString(s) {
		return nil
	}
	if m := reUSEUSize.FindStringSubmatch(s); len(m) == 3 {
		if n := normalizeClothingSizeToken(strings.TrimSpace(m[1])); n != "" {
			return []string{n}
		}
	}
	if parts := splitClothingSizeList(s); len(parts) > 0 {
		out := dedupeClothingSizes(parts)
		if len(out) == 0 {
			return nil
		}
		return out
	}
	if n := normalizeClothingSizeToken(s); n != "" {
		return []string{n}
	}
	return nil
}

func splitClothingSizeList(s string) []string {
	if strings.Contains(s, ",") || strings.Contains(s, ";") {
		raw := strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == ';' })
		return trimNonEmpty(raw)
	}
	if strings.ContainsAny(s, "/\\") {
		raw := strings.FieldsFunc(s, func(r rune) bool { return r == '/' || r == '\\' })
		parts := trimNonEmpty(raw)
		if len(parts) >= 3 {
			return parts
		}
	}
	return nil
}

func trimNonEmpty(raw []string) []string {
	out := make([]string, 0, len(raw))
	for _, p := range raw {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func dedupeClothingSizes(parts []string) []string {
	out := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, p := range parts {
		n := normalizeClothingSizeToken(p)
		if n == "" {
			continue
		}
		if _, ok := seen[n]; ok {
			continue
		}
		seen[n] = struct{}{}
		out = append(out, n)
	}
	return out
}

func normalizeClothingSizeToken(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" || strings.EqualFold(s, "null") {
		return ""
	}
	if reSKUJunk.MatchString(s) {
		return ""
	}
	lower := strings.ToLower(s)
	if reOneSizeHint.MatchString(lower) || strings.EqualFold(s, "OS") {
		return "One Size"
	}
	if reKidsHint.MatchString(lower) {
		return "Kids"
	}
	if m := reWaistSize.FindStringSubmatch(s); len(m) == 2 {
		return m[1]
	}
	if n, err := strconv.Atoi(s); err == nil && n >= 0 && n <= 16 {
		return strconv.Itoa(n)
	}

	if m := reTrailingParen.FindStringSubmatch(s); len(m) == 2 {
		if inner := normalizeSingleLetterSize(strings.TrimSpace(m[1])); inner != "" {
			return inner
		}
	}

	if strings.ContainsAny(s, "/\\") {
		if combo := normalizeSizeCombo(s); combo != "" {
			return combo
		}
		return ""
	}

	if letter := normalizeSingleLetterSize(s); letter != "" {
		return letter
	}

	if strings.Contains(s, "-") && !strings.Contains(strings.ToLower(s), "cm") {
		if combo := normalizeSizeCombo(strings.ReplaceAll(s, "-", "/")); combo != "" {
			return combo
		}
	}

	return ""
}

func normalizeSizeCombo(s string) string {
	parts := splitSizeParts(s)
	if len(parts) == 0 {
		return ""
	}
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		n := normalizeSingleLetterSize(strings.TrimSpace(p))
		if n == "" {
			return ""
		}
		out = append(out, n)
	}
	return strings.Join(out, "/")
}

func splitSizeParts(s string) []string {
	s = strings.ReplaceAll(s, " and ", "/")
	s = strings.ReplaceAll(s, ",", "/")
	s = strings.ReplaceAll(s, ";", "/")
	raw := strings.FieldsFunc(s, func(r rune) bool { return r == '/' || r == '\\' })
	if len(raw) <= 1 {
		return nil
	}
	return raw
}

func normalizeSingleLetterSize(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	// Strip cm suffix parenthetical: S (51-55cm)
	if idx := strings.Index(s, "("); idx > 0 {
		s = strings.TrimSpace(s[:idx])
	}
	if m := reLeadingLetter.FindStringSubmatch(s); len(m) == 2 {
		if tok := canonicalLetterToken(m[1]); tok != "" {
			return tok
		}
	}
	if m := reSizeCombo.FindStringSubmatch(s); len(m) == 3 {
		a := canonicalLetterToken(m[1])
		b := canonicalLetterToken(m[2])
		if a != "" && b != "" {
			return a + "/" + b
		}
	}
	if letter := letterSizeFromWords(s); letter != "" {
		return letter
	}
	if token := canonicalLetterToken(s); token != "" {
		return token
	}
	return ""
}

func letterSizeFromWords(s string) string {
	folded := strings.ToLower(strings.ReplaceAll(s, "-", " "))
	folded = strings.Join(strings.Fields(folded), " ")
	compact := strings.ReplaceAll(folded, " ", "")
	switch folded {
	case "xx small", "extra extra small", "xxs":
		return "XXS"
	case "extra small", "x small", "xsmall", "xs":
		return "XS"
	case "small", "s":
		return "S"
	case "medium", "m":
		return "M"
	case "large", "l":
		return "L"
	case "extra large", "x large", "xlarge", "xl", "x-large":
		return "XL"
	case "xx large", "2x large", "2x", "2xl", "xxl", "2x-large", "xx-large":
		return "XXL"
	case "xxx large", "3x large", "3x", "3xl", "xxxl", "3x-large", "xxx-large":
		return "3XL"
	}
	switch compact {
	case "xxsmall", "xxs":
		return "XXS"
	case "xsmall", "extrasmall", "xs":
		return "XS"
	case "xlarge", "extralarge", "xl":
		return "XL"
	case "xxlarge", "2xlarge", "2x", "2xl", "xxl":
		return "XXL"
	case "xxxlarge", "3xlarge", "3x", "3xl", "xxxl":
		return "3XL"
	}
	return ""
}

func canonicalLetterToken(tok string) string {
	t := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(tok), " ", ""))
	t = strings.ReplaceAll(t, "-", "")
	switch t {
	case "XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL":
		return t
	case "2X", "2XL", "XXXL":
		if t == "XXXL" {
			return "3XL"
		}
		return "XXL"
	case "3X":
		return "3XL"
	case "SM":
		return "S/M"
	case "ML":
		return "M/L"
	case "LG":
		return "L"
	case "MD":
		return "M"
	}
	if len(t) >= 2 && len(t) <= 5 && strings.ContainsAny(t, "XSML") {
		// Already abbreviated like S/M from split
		if strings.Contains(t, "/") {
			return t
		}
	}
	return ""
}

func clothingSizesFromStored(v interface{}) []string {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case string:
		return NormalizeClothingSizes(val)
	case []string:
		return dedupeClothingSizes(val)
	case []interface{}:
		parts := make([]string, 0, len(val))
		for _, elem := range val {
			if elem == nil {
				continue
			}
			if s, ok := elem.(string); ok {
				parts = append(parts, s)
				continue
			}
			parts = append(parts, stringifyClothingSizeElem(elem))
		}
		out := make([]string, 0, len(parts))
		seen := make(map[string]struct{}, len(parts))
		for _, p := range parts {
			for _, n := range NormalizeClothingSizes(p) {
				if _, ok := seen[n]; ok {
					continue
				}
				seen[n] = struct{}{}
				out = append(out, n)
			}
		}
		return out
	default:
		return NormalizeClothingSizes(stringifyClothingSizeElem(val))
	}
}

func stringifyClothingSizeElem(v interface{}) string {
	switch t := v.(type) {
	case string:
		return t
	case json.Number:
		return t.String()
	case float64:
		if t == float64(int(t)) {
			return strconv.Itoa(int(t))
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return ""
		}
		return strings.Trim(string(b), `"`)
	}
}

func storedClothingSizeValue(sizes []string) interface{} {
	if len(sizes) == 0 {
		return nil
	}
	if len(sizes) == 1 {
		return sizes[0]
	}
	out := make([]string, len(sizes))
	copy(out, sizes)
	return out
}

func clothingSizeJSONEqual(a, b interface{}) bool {
	if a == nil && b == nil {
		return true
	}
	ab, errA := json.Marshal(a)
	bb, errB := json.Marshal(b)
	if errA != nil || errB != nil {
		return false
	}
	return string(ab) == string(bb)
}

// ApplyClothingSizeFromVariant merges normalized clothing_size into metadata.llm_specs.
// Variant Size wins when it normalizes; otherwise existing llm_specs.clothing_size is
// re-normalized (size charts split into arrays). Respects llm_overrides.clothing_size.
func ApplyClothingSizeFromVariant(existing []byte, variantOpts []byte) []byte {
	var base map[string]interface{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &base)
	}
	if base == nil {
		base = make(map[string]interface{})
	}
	if overrides, _ := base["llm_overrides"].(map[string]interface{}); overrides != nil {
		if _, ok := overrides["clothing_size"]; ok {
			return existing
		}
	}

	llmSpecs, _ := base["llm_specs"].(map[string]interface{})
	createdSpecs := false
	if llmSpecs == nil {
		llmSpecs = make(map[string]interface{})
		createdSpecs = true
	}
	prev := llmSpecs["clothing_size"]

	sizes := NormalizeClothingSizes(VariantSizeFromOptions(variantOpts))
	if len(sizes) == 0 {
		sizes = clothingSizesFromStored(prev)
	}

	next := storedClothingSizeValue(sizes)
	if clothingSizeJSONEqual(prev, next) {
		return existing
	}
	if createdSpecs {
		base["llm_specs"] = llmSpecs
	}
	if next == nil {
		delete(llmSpecs, "clothing_size")
	} else {
		llmSpecs["clothing_size"] = next
	}

	b, err := json.Marshal(base)
	if err != nil {
		return existing
	}
	return b
}
