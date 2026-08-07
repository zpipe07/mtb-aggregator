package affiliate

import (
	"net/url"
	"os"
	"strings"
)

// EnvImpactDeepLinkCompetitiveCyclist is the Impact Radius destination template:
// Either a literal prefix ending before the encoded PDP URL (e.g. "...?u="), or contains "{{URL}}"
// substituted with QueryEscape(destination).
const EnvImpactDeepLinkCompetitiveCyclist = "IMPACT_DEEP_LINK_COMPETITIVE_CYCLIST"

// CompetitiveCyclistOutboundURL builds a tracked outbound URL when IMPACT_DEEP_LINK_COMPETITIVE_CYCLIST is set.
// Returns "", false when unset — callers typically fall back to the Impact catalog row Url for affiliate_url.
func CompetitiveCyclistOutboundURL(destination string) (string, bool) {
	tpl := strings.TrimSpace(os.Getenv(EnvImpactDeepLinkCompetitiveCyclist))
	if tpl == "" {
		return "", false
	}
	dest := strings.TrimSpace(destination)
	if dest == "" {
		return "", false
	}
	enc := url.QueryEscape(dest)
	if strings.Contains(tpl, "{{URL}}") {
		return strings.ReplaceAll(tpl, "{{URL}}", enc), true
	}
	return tpl + enc, true
}
