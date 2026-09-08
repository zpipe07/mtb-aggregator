package taxonomy

import (
	"regexp"
	"strings"
)

var (
	completeWheelsPath = []string{"Components", "Wheels/Tires", "Complete wheels"}
	rimsPath           = []string{"Components", "Wheels/Tires", "Rims"}
)

var (
	wheelsetRe = regexp.MustCompile(`(?i)\bwheel\s*sets?\b|\bcomplete\s+wheels?\b`)
	wheelRe    = regexp.MustCompile(`(?i)\bwheels?\b`)
	rimRe      = regexp.MustCompile(`(?i)\brims?\b`)

	wheelExcludeRe = regexp.MustCompile(`(?i)\bfreewheels?\b|\bflywheels?\b|\btraining\s+wheels?\b|\bwheel\s*bags?\b|\bwheel\s*covers?\b|\bwheel\s*builders?\b|\bwheel\s+building\b|\bwheel\s*tru|\bwheel\s+magnets?\b|\bwheel\s+sensors?\b|\bcaster\s+wheels?\b|\bwheel\s*hubs?\b`)
	hubOrSpokeRe   = regexp.MustCompile(`(?i)\bhubs?\b|\bspokes?\b|\bnipples?\b`)
	rimExcludeRe   = regexp.MustCompile(`(?i)\brim\s*tapes?\b|\brim\s*strips?\b|\btire\s*tapes?\b|\btyre\s*tapes?\b|\brim\s+brakes?\b|\brim\s+pads?\b`)
)

func inWheelsTiresTree(canonical []string) bool {
	return len(canonical) >= 2 && canonical[0] == "Components" && canonical[1] == "Wheels/Tires"
}

// IsWheelsTiresPath reports whether canonical is under Components › Wheels/Tires.
func IsWheelsTiresPath(canonical []string) bool {
	return inWheelsTiresTree(canonical)
}

// RefineWheelsTires overrides a Wheels/Tires canonical path from the product title so
// wheelsets, single built wheels, and bare rims do not stay on the Tires leaf (ZAC-263).
// "Tire Set" in a wheelset+tire bundle title does not win. Titles outside this subtree
// are left unchanged — we do not feed full names into Map (bike/light keyword traps).
func RefineWheelsTires(canonical []string, productName string) []string {
	if !inWheelsTiresTree(canonical) {
		return canonical
	}
	name := strings.TrimSpace(productName)
	if name == "" {
		return canonical
	}
	if isCompleteWheelTitle(name) {
		return append([]string(nil), completeWheelsPath...)
	}
	if isRimTitle(name) {
		return append([]string(nil), rimsPath...)
	}
	return canonical
}

func isCompleteWheelTitle(name string) bool {
	if wheelsetRe.MatchString(name) {
		return true
	}
	if !wheelRe.MatchString(name) {
		return false
	}
	if wheelExcludeRe.MatchString(name) || hubOrSpokeRe.MatchString(name) {
		return false
	}
	return true
}

func isRimTitle(name string) bool {
	return rimRe.MatchString(name) && !rimExcludeRe.MatchString(name)
}

// MapListing maps a store breadcrumb, then applies title-based leaf refiners.
func MapListing(categoryPath []string, productName string) []string {
	return RefineListing(Map(categoryPath), productName)
}
