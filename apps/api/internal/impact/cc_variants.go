package impact

import (
	"encoding/json"
	"net/url"
	"strings"
	"unicode"

	"github.com/mtb-aggregator/api/internal/scraper"
)

// applyCCVariantGroups sets product_group_key (PDP slug) and Size/Color
// variant_options on Impact rows that share a canonical product URL.
// The upsert layer prefixes store_id, matching ApplyCompetitiveCyclistVariantFanout.
func applyCCVariantGroups(results []scraper.ScrapeResult) {
	groups := map[string][]int{}
	var order []string
	for i := range results {
		slug := ccProductSlug(results[i].ProductURL)
		if slug == "" {
			continue
		}
		if _, ok := groups[slug]; !ok {
			order = append(order, slug)
		}
		groups[slug] = append(groups[slug], i)
		s := slug
		results[i].ProductGroupKey = &s
	}
	for _, slug := range order {
		idxs := groups[slug]
		colors := ccColorsForGroup(results, idxs, slug)
		for n, i := range idxs {
			opts := ccOptionsForName(results[i].ProductName)
			if colors[n] != "" {
				opts["Color"] = colors[n]
			}
			raw := marshalVariantOptions(opts)
			if len(raw) > 0 {
				results[i].VariantOptions = raw
			}
		}
	}
}

func ccProductSlug(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	u, err := url.Parse(s)
	if err != nil {
		return ""
	}
	u.RawQuery = ""
	u.Fragment = ""
	path := strings.Trim(u.Path, "/")
	if path == "" {
		return ""
	}
	if i := strings.LastIndex(path, "/"); i >= 0 {
		path = path[i+1:]
	}
	return strings.TrimSpace(path)
}

func ccOptionsForName(name string) map[string]string {
	out := map[string]string{}
	parts := splitCCNameParts(name)
	if len(parts) < 2 {
		return out
	}
	tail := parts[len(parts)-1]
	switch {
	case isCCPosition(tail):
		out["Position"] = tail
	case len(parts) == 2 || looksLikeCCSize(tail):
		out["Size"] = tail
	}
	return out
}

func splitCCNameParts(name string) []string {
	raw := strings.Split(name, ",")
	var parts []string
	for _, p := range raw {
		p = strings.TrimSpace(p)
		if p != "" {
			parts = append(parts, p)
		}
	}
	return parts
}

func isCCPosition(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "front", "rear", "left", "right":
		return true
	default:
		return false
	}
}

func looksLikeCCSize(s string) bool {
	t := strings.TrimSpace(s)
	if t == "" || isCCPosition(t) {
		return false
	}
	lower := strings.ToLower(t)
	if lower == "one size" || lower == "os" {
		return true
	}
	// Letter, numeric, and chart sizes: XL, 40.0, 56cm, US M/EU L, S/M, XS/0-2, S - Men's.
	hasDigit := false
	hasLetter := false
	for _, r := range t {
		switch {
		case unicode.IsDigit(r):
			hasDigit = true
		case unicode.IsLetter(r):
			hasLetter = true
		}
	}
	if !hasLetter && !hasDigit {
		return false
	}
	// Spec tails like "Microspline" or "44mm Offset" are not a single size token
	// when the name already has several comma-separated axes. Callers only use
	// this for the last segment of multi-comma names.
	if strings.Contains(t, " ") && !strings.Contains(strings.ToLower(t), "size") && !strings.Contains(t, "/") && !strings.Contains(t, "-") {
		return hasDigit
	}
	return true
}

func ccColorsForGroup(results []scraper.ScrapeResult, idxs []int, slug string) []string {
	colors := make([]string, len(idxs))
	heads := make([]string, len(idxs))
	for n, i := range idxs {
		heads[n] = ccColorHead(results[i].ProductName)
	}
	if lcpColors, ok := colorsFromCommonPrefix(heads); ok {
		return lcpColors
	}
	for n, head := range heads {
		colors[n] = colorPeeledFromSlug(head, slug)
	}
	return colors
}

// ccColorHead is the product title plus color, before variant axes.
// One comma: everything before it. Several commas: before the first comma,
// which is where CC puts the color on component names.
func ccColorHead(name string) string {
	parts := splitCCNameParts(name)
	if len(parts) == 0 {
		return strings.TrimSpace(name)
	}
	if len(parts) == 2 {
		return parts[0]
	}
	return parts[0]
}

func colorsFromCommonPrefix(heads []string) ([]string, bool) {
	if len(heads) == 0 {
		return nil, false
	}
	for _, h := range heads {
		if h == "" {
			return nil, false
		}
	}
	prefix := heads[0]
	for _, h := range heads[1:] {
		prefix = commonPrefix(prefix, h)
	}
	shorter := false
	for _, h := range heads {
		if len(prefix) < len(h) {
			shorter = true
			break
		}
	}
	if !shorter {
		return nil, false
	}
	prefix = trimToTokenBoundary(prefix)
	if strings.TrimSpace(prefix) == "" {
		return nil, false
	}
	colors := make([]string, len(heads))
	for i, h := range heads {
		if !strings.HasPrefix(h, prefix) {
			return nil, false
		}
		color := strings.TrimSpace(strings.TrimPrefix(h, prefix))
		if color == "" {
			return nil, false
		}
		colors[i] = color
	}
	return colors, true
}

func commonPrefix(a, b string) string {
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	i := 0
	for i < n && a[i] == b[i] {
		i++
	}
	return a[:i]
}

func trimToTokenBoundary(prefix string) string {
	if prefix == "" {
		return ""
	}
	// Shared prefix already ended on whitespace ("… Ebike ").
	if prefix[len(prefix)-1] == ' ' || prefix[len(prefix)-1] == '\t' {
		return strings.TrimRightFunc(prefix, unicode.IsSpace)
	}
	// Drop a partial token ("Gloss Bl" from Gloss Black / Gloss Blue).
	if i := strings.LastIndexAny(prefix, " \t"); i >= 0 {
		return strings.TrimRightFunc(prefix[:i], unicode.IsSpace)
	}
	return ""
}

func colorPeeledFromSlug(head, slug string) string {
	words := strings.Fields(head)
	if len(words) < 2 {
		return ""
	}
	want := normalizeFamilySlug(slug)
	if want == "" {
		return ""
	}
	for i := len(words) - 1; i >= 1; i-- {
		prefix := strings.Join(words[:i], " ")
		if normalizeFamilySlug(slugifyCC(prefix)) == want {
			color := strings.TrimSpace(strings.Join(words[i:], " "))
			return stripLeadingGender(color)
		}
	}
	return ""
}

func stripLeadingGender(color string) string {
	words := strings.Fields(color)
	for len(words) > 0 && (isGenderToken(words[0]) || words[0] == "-" || words[0] == "–") {
		words = words[1:]
	}
	return strings.Join(words, " ")
}

func isGenderToken(w string) bool {
	s := strings.ToLower(strings.Trim(w, "'-"))
	s = strings.TrimSuffix(s, "'s")
	switch s {
	case "men", "mens", "women", "womens", "kids", "kid", "boys", "boy", "girls", "girl", "youth":
		return true
	default:
		return false
	}
}

func slugifyCC(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			prevDash = false
			continue
		}
		if !prevDash {
			b.WriteByte('-')
			prevDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func normalizeFamilySlug(slug string) string {
	s := slugifyCC(strings.ReplaceAll(slug, ".", ""))
	for {
		next := stripFamilySlugSuffix(s)
		if next == s {
			return s
		}
		s = next
	}
}

func stripFamilySlugSuffix(s string) string {
	for _, suf := range []string{"-mens", "-womens", "-men", "-women", "-kids", "-boys", "-girls", "-youth"} {
		if strings.HasSuffix(s, suf) {
			return strings.TrimSuffix(s, suf)
		}
	}
	// Trailing Impact style codes such as gir002z, gwr006e, snzk1ps, cvl1x56.
	i := strings.LastIndex(s, "-")
	if i <= 0 {
		return s
	}
	tail := s[i+1:]
	if len(tail) < 5 || len(tail) > 12 {
		return s
	}
	letters, digits := 0, 0
	for _, r := range tail {
		switch {
		case r >= 'a' && r <= 'z':
			letters++
		case r >= '0' && r <= '9':
			digits++
		default:
			return s
		}
	}
	if letters >= 2 && digits >= 2 {
		return s[:i]
	}
	return s
}

func marshalVariantOptions(opts map[string]string) json.RawMessage {
	if len(opts) == 0 {
		return nil
	}
	b, err := json.Marshal(opts)
	if err != nil {
		return nil
	}
	return b
}
