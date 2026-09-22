package metadata

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

const (
	CoverageHalfShell    = "Half shell"
	CoverageFullFace     = "Full face"
	CoverageThreeQuarter = "3/4 shell"
	CoverageConvertible  = "Convertible"
	CoverageOther        = "Other"
)

var (
	chinBarPartRe = regexp.MustCompile(`(?i)\bchin\s*bars?\b`)

	// Zack lock (ZAC-277): 3/4 = covers ears, no chin bar. Dropframe / Tyrant / Trigger X are known-good.
	threeQuarterNameRe = regexp.MustCompile(`(?i)\b3\s*qtr\b|\b3/?4(?:\s*shell)?\b|\bthree[\s-]?quarters?\b|\btrigger\s*x\b|\bdropframe\b|\btyrant\b`)
	triggerFullFaceRe  = regexp.MustCompile(`(?i)\btrigger\b.*\bfull[\s-]?face\b|\bfull[\s-]?face\b.*\btrigger\b`)

	convertibleNameRe = regexp.MustCompile(`(?i)\bsuper\s+dh\b|\bsuper\s+3r\b|\bsuper\s+2r\b|\bsuper\s+air\s*r\b|\bswitchblade\b|\bparachute\b|\bfull[\s-]?air\b`)

	fullFaceNameRe = regexp.MustCompile(`(?i)\bfull[\s-]?face\b|\bfull[\s-]?(?:9|10)\b|\bproframe\b|\bcoron\b|\botocon\b|\bsanction\s*2\s*dlx\b|\bcoalition\b|\bdissident\b|\brampage\b|\bproject\s*23\b|\baircraft\b|\bmt500\b|\binsurgent\b|\bcipher\b`)
	tldFullFaceRe  = regexp.MustCompile(`(?i)\bd[34](?:\s|$|[\-])|\bd4\s+(?:carbon|poly|stealth)`)
	leattGravityRe = regexp.MustCompile(`(?i)\bgravity\b`)

	halfShellFamilyRe = regexp.MustCompile(`(?i)\b4forty\b|\bfalcon\b|\bnomad\b|\bspan\b|\blocal\b|\bracket\b|\bartex\b|\bbexley\b|\bquarter\b|\bmanifest\b|\bmerit\b|\bagilis\b|\ba2\b|\ba3\b|\ball[\s-]?mtn\b|\btrail\s*[123](?:\.0)?\b|\bkortal\b|\bcularis\b|\btectal\b|\baxion\b|\bambush\b|\bproject\s*21\b|\bm2\b|\bm5\b|\bx2\b|\bimpala\b|\blupo\b|\brevolution\b|\bpisspot\b|\bengage\b|\bair\s*pro\b|\bkudo\b|\bkassis\b|\bbushwhacker\b|\bevo\s*am\b|\bspeedframe\b|\bmainframe\b|\bcrossframe\b|\bascent\b|\btrail\s*evo\b|\burban[\s-]?lite\b|\bprotec\b|\blow\s*pro\b`)
	superAirHalfRe    = regexp.MustCompile(`(?i)\bsuper\s+air\b`)
	openFaceRe        = regexp.MustCompile(`(?i)\bopen[\s-]?face\b`)
	roadUrbanAeroRe   = regexp.MustCompile(`(?i)\broad\s+helmet\b|\burban\s+helmet\b|\baero\s+helmet\b|\bcommuter\b`)

	removableChinDescRe = regexp.MustCompile(`(?i)\bremovable\s+chin\b|\b2[\s-]?click\s+removable\b|\bconvertible\b`)
	fullFaceDescRe      = regexp.MustCompile(`(?i)\bfull[\s-]?face\b|\bintegrated\s+chin\s+bar\b|\bfixed\s+chin\s+bar\b`)
)

// IsHelmetsPath reports whether canonical is Gear › Helmets (not Helmet parts).
func IsHelmetsPath(canonical []string) bool {
	return len(canonical) >= 2 && canonical[0] == "Gear" && canonical[1] == "Helmets"
}

// InferHelmetCoverage maps a helmet title (and optional PDP description) to a Coverage
// enum using product-type signals. Empty string means "leave the stored value".
// 3/4 shell = covers the ears, no chin bar (Fox Dropframe / Dropframe Pro, Giro Tyrant,
// iXS Trigger X, Bell 3Qtr-Air). Convertible = removable chin bar (Super Air R, Super DH/3R).
// Chin-bar / visor accessories sold alone are Other. Do not infer Full face from
// MTB / MIPS / Air / Trail marketing words alone (ZAC-277).
func InferHelmetCoverage(productName, description string) string {
	name := strings.TrimSpace(productName)
	if name == "" {
		return ""
	}
	blob := name
	if d := strings.TrimSpace(description); d != "" {
		blob = name + "\n" + d
	}

	if chinBarPartRe.MatchString(name) {
		return CoverageOther
	}
	if threeQuarterNameRe.MatchString(name) && !triggerFullFaceRe.MatchString(name) {
		return CoverageThreeQuarter
	}
	if convertibleNameRe.MatchString(name) {
		return CoverageConvertible
	}
	if fullFaceNameRe.MatchString(name) || tldFullFaceRe.MatchString(name) || leattGravityRe.MatchString(name) {
		return CoverageFullFace
	}
	if superAirHalfRe.MatchString(name) {
		return CoverageHalfShell
	}
	if halfShellFamilyRe.MatchString(name) || openFaceRe.MatchString(name) || roadUrbanAeroRe.MatchString(name) {
		return CoverageHalfShell
	}
	if openFaceRe.MatchString(blob) {
		return CoverageHalfShell
	}
	if removableChinDescRe.MatchString(blob) && !fullFaceDescRe.MatchString(name) {
		return CoverageConvertible
	}
	if fullFaceDescRe.MatchString(name) {
		return CoverageFullFace
	}
	return ""
}

// ApplyHelmetCoverage writes inferred (or override) Coverage into metadata.llm_specs
// for Gear › Helmets listings. Known model-family inference wins over a conflicting
// llm_overrides.coverage (the first-pass ZAC-277 audit overrode Dropframe / Tyrant
// to Half shell). Unmatched titles still copy a manual override onto llm_specs so
// public spec filters stay shopper-visible.
func ApplyHelmetCoverage(existing []byte, productName string, canonical []string) []byte {
	if !IsHelmetsPath(canonical) {
		return existing
	}
	var base map[string]interface{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &base)
	}
	if base == nil {
		base = make(map[string]interface{})
	}

	llmSpecs, _ := base["llm_specs"].(map[string]interface{})
	createdSpecs := false
	if llmSpecs == nil {
		llmSpecs = make(map[string]interface{})
		createdSpecs = true
	}

	desc, _ := base["description"].(string)
	inferred := InferHelmetCoverage(productName, desc)
	override := ""
	overrides, _ := base["llm_overrides"].(map[string]interface{})
	if overrides != nil {
		if v := strings.TrimSpace(fmt.Sprint(overrides["coverage"])); v != "" && v != "<nil>" {
			override = v
		}
	}

	next := inferred
	if next == "" {
		next = override
	}
	if next == "" {
		return existing
	}

	specsSame := fmt.Sprint(llmSpecs["coverage"]) == next
	overrideSame := override == "" || override == next
	if specsSame && overrideSame {
		return existing
	}
	if createdSpecs {
		base["llm_specs"] = llmSpecs
	}
	llmSpecs["coverage"] = next
	if inferred != "" && override != "" && override != inferred {
		overrides["coverage"] = inferred
	}
	b, err := json.Marshal(base)
	if err != nil {
		return existing
	}
	return b
}
