package taxonomy

import (
	"regexp"
	"strings"
)

var (
	clothingPath = []string{"Gear", "Clothing"}
	shortsPath   = []string{"Gear", "Clothing", "Shorts"}
	pantsPath    = []string{"Gear", "Clothing", "Pants"}
	shirtsPath   = []string{"Gear", "Clothing", "Shirts"}
	jerseysPath  = []string{"Gear", "Clothing", "Jerseys"}
	jacketsPath  = []string{"Gear", "Clothing", "Jackets"}
	socksPath    = []string{"Gear", "Clothing", "Socks"}
)

// Garment leaves first so "Short-Sleeve Tri Suit" is Clothing, not Shorts.
var (
	skinsuitTitleRe = regexp.MustCompile(`(?i)\bskinsuits?\b|\btri[\s-]?suits?\b`)
	skirtTitleRe    = regexp.MustCompile(`(?i)\bskirts?\b|\bskorts?\b`)
	dressTitleRe    = regexp.MustCompile(`(?i)\bdress(?:es)?\b`)
	hatTitleRe      = regexp.MustCompile(`(?i)\bcaps?\b|\bhats?\b`)

	shortsPluralRe    = regexp.MustCompile(`(?i)\bshorts\b|\bliner shorts?\b|\bbib shorts?\b|\bboxers?\b|\bchamois\b`)
	singularShortRe   = regexp.MustCompile(`(?i)\bshort\b`)
	shortNotGarmentRe = regexp.MustCompile(`(?i)short[\s-]?sleeves?|short[\s-]?travel|short[\s-]?cage|short[\s-]?reach`)

	pantsTitleRe = regexp.MustCompile(`(?i)\btights?\b|\bknickers\b|\bbib tights?\b|\bcycling pants\b|\bpants\b`)

	jerseyTitleRe = regexp.MustCompile(`(?i)\bjerseys?\b|\bpolos?\b|\btri[\s-]?tops?\b`)

	shirtTitleRe = regexp.MustCompile(`(?i)\bt-shirts?\b|\btees?\b|\bhoodies?\b|\bsweatshirts?\b|\blong[\s-]?sleeves?\b|\bflannels?\b|\bbase layers?\b`)

	jacketTitleRe = regexp.MustCompile(`(?i)\bjackets?\b|\bvests?\b|\bgilets?\b|\bwindbreakers?\b`)

	socksTitleRe = regexp.MustCompile(`(?i)\bsocks?\b`)
)

func inBikesTree(canonical []string) bool {
	return len(canonical) >= 1 && canonical[0] == "Bikes"
}

// IsBikesPath reports whether canonical is under the Bikes tree (including the parent).
func IsBikesPath(canonical []string) bool {
	return inBikesTree(canonical)
}

func clonePath(path []string) []string {
	return append([]string(nil), path...)
}

// RefineApparel moves clothing off the Bikes tree using the product title (ZAC-264).
// taxonomy.Map only sees category_path; Competitive Cyclist Impact breadcrumbs like
// "Women's Mountain Bike Bottoms" / "Men's Tri Bike" substring-match generic bike
// keywords when the leaf is unmapped. CC is not PDP-enriched, so the classifier
// never corrects them. Titles that look like complete bikes (or helmet liners)
// are left unchanged. Do not match bare "liners".
func RefineApparel(canonical []string, productName string) []string {
	if !inBikesTree(canonical) {
		return canonical
	}
	name := strings.TrimSpace(productName)
	if name == "" {
		return canonical
	}
	if path := apparelPathForTitle(name); len(path) > 0 {
		return clonePath(path)
	}
	return canonical
}

func apparelPathForTitle(name string) []string {
	if skinsuitTitleRe.MatchString(name) || skirtTitleRe.MatchString(name) || dressTitleRe.MatchString(name) || hatTitleRe.MatchString(name) {
		return clothingPath
	}
	if isShortsTitle(name) {
		return shortsPath
	}
	if pantsTitleRe.MatchString(name) {
		return pantsPath
	}
	if jerseyTitleRe.MatchString(name) {
		return jerseysPath
	}
	if shirtTitleRe.MatchString(name) {
		return shirtsPath
	}
	if jacketTitleRe.MatchString(name) {
		return jacketsPath
	}
	if socksTitleRe.MatchString(name) {
		return socksPath
	}
	return nil
}

func isShortsTitle(name string) bool {
	if shortsPluralRe.MatchString(name) {
		return true
	}
	if !singularShortRe.MatchString(name) {
		return false
	}
	return !shortNotGarmentRe.MatchString(name)
}
