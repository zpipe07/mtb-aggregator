package taxonomy

import (
	"regexp"
	"strings"
)

var glovesPath = []string{"Gear", "Gloves"}

var (
	gloveTitleRe = regexp.MustCompile(`(?i)\bgloves?\b`)
	mittTitleRe  = regexp.MustCompile(`(?i)\bmitts?\b|\bmittens?\b|\bundergloves?\b`)
	// Brand "Glacier Glove" hats, workshop scrubbers, and brake cables whose
	// colorway is "Silver Gloves" are not riding gloves.
	gloveNotProductRe = regexp.MustCompile(`(?i)\bhats?\b|\bcaps?\b|\bcables?\b|cleaning\s+gloves?|\bscrubbers?\b`)
)

func inClothingTree(canonical []string) bool {
	return len(canonical) >= 2 && canonical[0] == "Gear" && canonical[1] == "Clothing"
}

// RefineGloves moves riding gloves onto Gear › Gloves (ZAC-311).
//
// taxonomy.Map only sees category_path. Production still has a priority-60
// Clothing row whose keywords include "glove" and bare "short", so
// "Women's Mountain Bike Gloves" and "Men's Short Finger Cycling Gloves" land
// on Clothing, and an earlier name backfill then parked short-finger and
// softshell gloves on Shorts and Jackets. Paths that never say glove
// ("Clothing", "Clothing & Protective Gear", "Accessories") need the title.
// Mitts move only off the Clothing tree so bar-mitt pogies on the Gear parent
// stay put. Hats sold under the Glacier Glove brand stay put. Do not match
// bare "mitt" inside summit.
func RefineGloves(canonical []string, productName string) []string {
	name := strings.TrimSpace(productName)
	if name == "" || gloveNotProductRe.MatchString(name) {
		return canonical
	}
	if inClothingTree(canonical) && (gloveTitleRe.MatchString(name) || mittTitleRe.MatchString(name)) {
		return clonePath(glovesPath)
	}
	if inLooseGloveShelf(canonical) && gloveTitleRe.MatchString(name) {
		return clonePath(glovesPath)
	}
	return canonical
}

func inLooseGloveShelf(canonical []string) bool {
	if len(canonical) == 1 && (canonical[0] == "Gear" || canonical[0] == "Accessories") {
		return true
	}
	return len(canonical) == 2 && canonical[0] == "Gear" && canonical[1] == "Shoes"
}
