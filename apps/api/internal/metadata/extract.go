package metadata

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
)

// Extract parses product name for MTB-relevant attributes and returns them as a JSON-serializable map.
// Only non-empty values are included. Used for metadata JSONB on store_listings.
func Extract(productName string) []byte {
	if productName == "" {
		return nil
	}
	name := " " + strings.ToLower(productName) + " "
	out := make(map[string]interface{})

	// Wheel size: 29er, 29", 27.5, 26, mullet
	if v := extractWheelSize(name); v != "" {
		out["wheel_size"] = v
	}
	// Suspension travel: 150mm, 160mm, etc. (first match in mm)
	if v := extractTravelMM(name); v != 0 {
		out["suspension_travel_mm"] = v
	}
	// Model year: 2024, 2025, 2019, etc.
	if v := extractModelYear(name); v != 0 {
		out["model_year"] = v
	}
	// Groupset / drivetrain: XT, XTR, GX Eagle, X01, etc.
	if v := extractGroupset(name); v != "" {
		out["groupset"] = v
	}

	if len(out) == 0 {
		return nil
	}
	b, _ := json.Marshal(out)
	return b
}

func extractWheelSize(name string) string {
	// Order matters: match longer/more specific first
	patterns := []struct {
		re   *regexp.Regexp
		norm string
	}{
		{regexp.MustCompile(`\b29er\b`), "29"},
		{regexp.MustCompile(`\b29"\b|\b29\s*inch\b`), "29"},
		{regexp.MustCompile(`\b27\.5\b|\b650b\b`), "27.5"},
		{regexp.MustCompile(`\b26"\b|\b26\s*inch\b`), "26"},
		{regexp.MustCompile(`\bmullet\b`), "mullet"},
	}
	for _, p := range patterns {
		if p.re.MatchString(name) {
			return p.norm
		}
	}
	// Bare 29 or 26 (avoid matching 290, 260, etc.)
	if regexp.MustCompile(`\b29\b`).MatchString(name) && !regexp.MustCompile(`\b29[0-9]`).MatchString(name) {
		return "29"
	}
	if regexp.MustCompile(`\b26\b`).MatchString(name) && !regexp.MustCompile(`\b26[0-9]`).MatchString(name) {
		return "26"
	}
	return ""
}

func extractTravelMM(name string) int {
	re := regexp.MustCompile(`\b([1-9][0-9]{2})\s*mm\b`)
	matches := re.FindStringSubmatch(name)
	if len(matches) < 2 {
		return 0
	}
	mm, err := strconv.Atoi(matches[1])
	if err != nil || mm < 80 || mm > 250 {
		return 0
	}
	return mm
}

func extractModelYear(name string) int {
	re := regexp.MustCompile(`\b(20[12][0-9])\b`)
	matches := re.FindStringSubmatch(name)
	if len(matches) < 2 {
		return 0
	}
	y, err := strconv.Atoi(matches[1])
	if err != nil || y < 2010 || y > 2030 {
		return 0
	}
	return y
}

// groupsetKeywords: canonical label -> regex or substring patterns (lowercase)
var groupsetKeywords = []struct {
	label string
	re    *regexp.Regexp
}{
	{label: "XTR", re: regexp.MustCompile(`\bxtr\b`)},
	{label: "XT", re: regexp.MustCompile(`\bxt\b`)}, // \bxtr\b matches first so XTR wins when present
	{label: "SLX", re: regexp.MustCompile(`\bslx\b`)},
	{label: "Deore", re: regexp.MustCompile(`\bdeore\b`)},
	{label: "XX1", re: regexp.MustCompile(`\bxx1\b`)},
	{label: "X01", re: regexp.MustCompile(`\bx01\b|\bx0\s*1\b`)},
	{label: "GX Eagle", re: regexp.MustCompile(`\bgx\s*eagle\b`)},
	{label: "GX", re: regexp.MustCompile(`\bgx\b`)},
	{label: "NX Eagle", re: regexp.MustCompile(`\bnx\s*eagle\b`)},
	{label: "NX", re: regexp.MustCompile(`\bnx\b`)},
	{label: "SX Eagle", re: regexp.MustCompile(`\bsx\s*eagle\b`)},
	{label: "SX", re: regexp.MustCompile(`\bsx\b`)},
	{label: "CUES", re: regexp.MustCompile(`\bcues\b`)},
	{label: "GRX", re: regexp.MustCompile(`\bgrx\b`)},
	{label: "105", re: regexp.MustCompile(`\b105\b`)},
	{label: "Ultegra", re: regexp.MustCompile(`\bultegra\b`)},
	{label: "Dura-Ace", re: regexp.MustCompile(`\bdura-?ace\b`)},
}

func extractGroupset(name string) string {
	for _, kw := range groupsetKeywords {
		if kw.re.MatchString(name) {
			return kw.label
		}
	}
	return ""
}
