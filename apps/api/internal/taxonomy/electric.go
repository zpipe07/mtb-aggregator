package taxonomy

import (
	"regexp"
	"strings"
)

var (
	mountainBikesPath = []string{"Bikes", "Mountain Bikes"}
	framesPath        = []string{"Bikes", "Frames"}
)

var (
	// e-bike *vehicles* in the title. Do not use bare "electric" / "bosch"
	// (those match chargers, pumps, and shop tools).
	eBikeVehicleRe = regexp.MustCompile(`(?i)(?:` +
		`\be-?bikes?\b|\bebikes?\b|\be-?mtbs?\b|\bemtbs?\b|` +
		`\be-?mountain\b|\belectric\s+(?:mountain|commuter|gravel|road|city)\b|` +
		`\belectric\s+bikes?\b|\bhybrid\s+e-?bikes?\b|` +
		`\bvlt\b|\brepeaters?\b|\brelays?\b|` +
		`\bturbo\s+levos?\b|\bkenevos?\b|\bcomo\b|\bvados?\b|\bteros?\b|` +
		`\bfuel\s+exe\b|\bpowerflys?\b|` +
		`\bbosch\s+performance\b|\bshimano\s+steps\b|\bfazua\b|\bbrose\b` +
		`)`)

	eBikeAccessoryRe = regexp.MustCompile(`(?i)(?:` +
		`\bbatter(?:y|ies)\b|\bchargers?\b|\bcharging\s+cables?\b|` +
		`\bpower\s+cables?\b|\bpowertubes?\b|\bpowerpacks?\b|` +
		`\bdisplay\s+mounts?\b|\bspoke\s+magnets?\b|\block\s+rings?\b` +
		`)`)

	electricNonBikeRe = regexp.MustCompile(`(?i)(?:` +
		`\bbrake\s+pads?\b|\bdisc\s+brake\s+pads?\b|\bbrakesets?\b|` +
		`\bbrake\s+levers?\b|\bhydraulic\s+brake\b|\bdisc\s+brakes?\b|` +
		`\bcalipers?\b|\brotors?\b|\bolives?\b|\bdroppers?\b|\bseatposts?\b|` +
		`\bsaddles?\b|\bstems?\b|\bhandlebars?\b|\bcranks?\b|` +
		`\bcassettes?\b|\bchainrings?\b|\bderailleurs?\b|\bhangers?\b|` +
		`\bshifters?\b|\bpark\s+tool\b|\btorque\s+wrench\b|\bwrenches?\b|` +
		`\bhex(?:es|\s+keys?)?\b|\bpliers?\b|\bspanners?\b|\brepair\s+stands?\b|` +
		`\bu-?locks?\b|\bchain\s+locks?\b|\bcable\s+locks?\b|\bfolding\s+locks?\b|` +
		`\bknee\s+(?:guards?|armor)\b|\belbow\s+(?:guards?|armor)\b|\barmor\b|` +
		`\blubes?\b|\bfenders?\b|\bpanniers?\b|\bframe\s+guards?\b|` +
		`\bgauges?\b|\btools?\b|\bcreams?\b|\bgloves?\b|\bhelmets?\b` +
		`)`)

	// Pedals had a typo space in the char class above — fix via a dedicated token.
	pedalTitleRe = regexp.MustCompile(`(?i)\bpedals?\b`)

	analogCompleteBikeRe = regexp.MustCompile(`(?i)(?:` +
		`(?:20[0-3]\d).*(?:carbon|alloy|framesets?|\bgx\b|\bx0\b|\bx01\b|\beagle\b|\baxs\b)|` +
		`(?:carbon|alloy|framesets?|\bgx\b|\bx0\b|\beagle\b|\baxs\b).*(?:20[0-3]\d)|` +
		`\bcarbon\s+(?:gx|x0|x01|eagle|axs)\b|\balloy\s+(?:gx|x0|x01|pnw|eagle)\b|` +
		`\benduro\s+bikes?\b|\bdownhill\s+bikes?\b|\btrail\s+bikes?\b|\bxc\s+bikes?\b|` +
		`\bhardtails?\b|\bfat\s+bikes?\b` +
		`)`)

	framesetTitleRe = regexp.MustCompile(`(?i)\bframesets?\b`)
)

func inElectricBikesTree(canonical []string) bool {
	if len(canonical) < 2 || canonical[0] != "Bikes" {
		return false
	}
	leaf := canonical[1]
	return leaf == "Electric" || leaf == "Electric Bikes" || strings.HasPrefix(leaf, "Electric ")
}

// IsElectricBikesPath reports whether canonical is under Bikes › Electric / eMTB.
func IsElectricBikesPath(canonical []string) bool {
	return inElectricBikesTree(canonical)
}

// RefineElectric moves analog complete bikes and non-bike SKUs off the Electric
// tree using the product title (ZAC-273). Ride Bicycles (and similar) tag
// thousands of pads, tools, locks, and analog MTBs with product_type
// "Electric Commuter & Urban Bikes", which substring-matches the
// "electric commuter" → Electric Bikes mapping. taxonomy.Map only sees
// category_path. Titles that look like real e-bikes are left unchanged.
// Non-bike titles return nil so they do not pollute /deals/c/bikes.
func RefineElectric(canonical []string, productName string) []string {
	if !inElectricBikesTree(canonical) {
		return canonical
	}
	name := strings.TrimSpace(productName)
	if name == "" {
		return canonical
	}
	if eBikeAccessoryRe.MatchString(name) {
		return nil
	}
	if eBikeVehicleRe.MatchString(name) {
		return canonical
	}
	if isElectricNonBikeTitle(name) {
		return nil
	}
	if framesetTitleRe.MatchString(name) {
		return clonePath(framesPath)
	}
	if analogCompleteBikeRe.MatchString(name) {
		return clonePath(mountainBikesPath)
	}
	return canonical
}

func isElectricNonBikeTitle(name string) bool {
	if electricNonBikeRe.MatchString(name) || pedalTitleRe.MatchString(name) {
		return true
	}
	return false
}
