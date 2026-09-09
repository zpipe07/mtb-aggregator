package taxonomy

import (
	"regexp"
	"strings"
)

var (
	brakePartsPath = []string{"Components", "Brakes", "Brake parts"}
	brakePadsPath  = []string{"Components", "Brakes", "Pads"}
)

var brakePadsTitleRe = regexp.MustCompile(`(?i)\bbrake\s+pads?\b|\bdisc\s+brake\s+pads?\b`)

// brakePartsTitleRe matches hardware sold without a complete lever+caliper set.
// Keep patterns specific: bare "piston" / "hose" / "lever" would trap complete
// brakesets (e.g. "Code RSC 4-Piston Disc Brake").
var brakePartsTitleRe = regexp.MustCompile(`(?i)(?:` +
	`\bolives?\b|\bbarbs?\b|\bcrimps?\b|` +
	`\bend\s+caps?\b|\bend\s+buttons?\b|` +
	`\bbrake\s+cables?\b|\bbrake\s+housings?\b|\bcable\s+housings?\b|` +
	`\bcable\s+hangers?\b|\bcable\s+end\b|\bcable\s+anchors?\b|` +
	`\bbrake\s+noodles?\b|\blinear\s+pull\s+brake\s+noodle\b|` +
	`\b(?:disc\s+)?brake\s+adapt[oe]rs?\b|\bmount\s+adapt[oe]rs?\b|` +
	`\bmounting\s+bolts?\b|\bcaliper\s+fixing\s+bolts?\b|` +
	`\blever\s+axles?\b|\blever\s+parts?\b|\blever\s+hoods?\b|\blever\s+blades?\b|` +
	`\bbleed\s+screws?\b|` +
	`\brotor\s+bolts?\b|\block\s+rings?\b|\bbanjo\s+bolts?\b|` +
	`\bconnecting\s+inserts?\b|\bbrake\s+hoses?\b|\bhydraulic\s+hoses?\b|` +
	`\bcaliper\s+pistons?\b|\bbrake\s+pistons?\b` +
	`)`)

var brakeCompleteExcludeRe = regexp.MustCompile(`(?i)\bbrakesets?\b|\bbrake\s+sets?\b`)

func inBrakesetsOrBrakesParent(canonical []string) bool {
	if len(canonical) < 2 || canonical[0] != "Components" || canonical[1] != "Brakes" {
		return false
	}
	if len(canonical) == 2 {
		return true
	}
	return canonical[2] == "Brakesets"
}

// IsBrakesetsOrBrakesParent reports whether canonical is Brakesets or the Brakes parent.
func IsBrakesetsOrBrakesParent(canonical []string) bool {
	return inBrakesetsOrBrakesParent(canonical)
}

// RefineBrakes moves small brake hardware off Brakesets (or the Brakes parent)
// onto Brake parts using the product title (ZAC-272). taxonomy.Map only sees
// category_path; a production mapping of bare "brake" → Brakesets dumps cables,
// olives, and adapters onto the complete-product leaf. Titles that look like a
// complete brakeset are left unchanged. Pads and Rotors are not touched.
func RefineBrakes(canonical []string, productName string) []string {
	if !inBrakesetsOrBrakesParent(canonical) {
		return canonical
	}
	name := strings.TrimSpace(productName)
	if name == "" {
		return canonical
	}
	if brakeCompleteExcludeRe.MatchString(name) {
		return canonical
	}
	if brakePadsTitleRe.MatchString(name) {
		return append([]string(nil), brakePadsPath...)
	}
	if !isBrakePartsTitle(name) {
		return canonical
	}
	return append([]string(nil), brakePartsPath...)
}

func isBrakePartsTitle(name string) bool {
	return brakePartsTitleRe.MatchString(name)
}
