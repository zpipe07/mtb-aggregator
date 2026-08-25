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
	reSKUJunk      = regexp.MustCompile(`(?i)^(UY|UA|UC|UW|T)$`)
	reSizeCombo     = regexp.MustCompile(`(?i)([xsml]{1,3})\s*[/\\-]\s*([xsml]{1,3})`)
	reLeadingLetter = regexp.MustCompile(`(?i)^\s*#?\s*([XSML]{1,3})\b`)
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

// NormalizeClothingSize canonicalizes a raw variant Size label for llm_specs.clothing_size.
func NormalizeClothingSize(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	if reSKUJunk.MatchString(s) {
		return ""
	}
	// Size charts listing many options (not this variant's size).
	if strings.Contains(s, ",") {
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

	if strings.Contains(s, "/") || strings.Contains(s, "\\") {
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

	lower := strings.ToLower(s)
	switch {
	case lower == "x-small" || lower == "xsmall" || lower == "xs":
		return "XS"
	case lower == "small" || lower == "s":
		return "S"
	case lower == "medium" || lower == "m":
		return "M"
	case lower == "large" || lower == "l":
		return "L"
	case lower == "x-large" || lower == "xlarge" || lower == "xl":
		return "XL"
	case lower == "2x-large" || lower == "2xlarge" || lower == "xxl":
		return "XXL"
	case lower == "3x-large" || lower == "3xlarge" || lower == "xxxl" || lower == "3xl":
		return "3XL"
	}
	if token := canonicalLetterToken(s); token != "" {
		return token
	}
	return ""
}

func canonicalLetterToken(tok string) string {
	t := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(tok), " ", ""))
	switch t {
	case "XS", "S", "M", "L", "XL", "XXL", "3XL":
		return t
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

// ApplyClothingSizeFromVariant merges normalized clothing_size into metadata.llm_specs.
// Respects llm_overrides.clothing_size. Returns existing unchanged when variant has no Size.
func ApplyClothingSizeFromVariant(existing []byte, variantOpts []byte) []byte {
	raw := VariantSizeFromOptions(variantOpts)
	if raw == "" {
		return existing
	}
	normalized := NormalizeClothingSize(raw)
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
		if _, ok := overrides["clothing_size"]; ok {
			return existing
		}
	}
	llmSpecs, _ := base["llm_specs"].(map[string]interface{})
	if llmSpecs == nil {
		llmSpecs = make(map[string]interface{})
		base["llm_specs"] = llmSpecs
	}
	llmSpecs["clothing_size"] = normalized
	b, _ := json.Marshal(base)
	return b
}
