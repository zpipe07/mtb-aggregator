package impact

import (
	"net/url"
	"strings"
)

const maxImpactURLUnwrap = 16

// unwrapImpactTrackedProductURL peels Impact Radius–style hops encoded as query param `u=<percent-encoded-next-url>`.
// Competitive Cyclist catalog rows often put `Url` as an Impact redirect host (e.g. *.g39l.net) wrapping the real PDP.
// Applying IMPACT_DEEP_LINK_COMPETITIVE_CYCLIST on that wrapped string double-nests tracking URLs and breaks clicks.
func unwrapImpactTrackedProductURL(tracked string) string {
	s := strings.TrimSpace(tracked)
	if s == "" {
		return s
	}
	prev := ""
	for range maxImpactURLUnwrap {
		if s == prev {
			break
		}
		prev = s
		u, err := url.Parse(s)
		if err != nil {
			return tracked
		}
		inner := strings.TrimSpace(u.Query().Get("u"))
		if inner == "" {
			break
		}
		decoded, err := url.QueryUnescape(inner)
		if err != nil {
			decoded = inner
		}
		decoded = strings.TrimSpace(decoded)
		if decoded == "" {
			break
		}
		s = decoded
	}
	return s
}

// trackingCatalogOutboundURL selects the catalog Url for outbound attribution when no deep-link template is configured.
// When unwrap peels nested Impact redirects (raw ≠ PDP), we keep the outer tracked hop.
// When the feed URL does not unwrap but points off competitivecyclist.com, treat it as a redirect tracking hop.
func trackingCatalogOutboundURL(normalizedCatalogURL, canonicalPDP string) *string {
	raw := strings.TrimSpace(normalizedCatalogURL)
	pdp := strings.TrimSpace(canonicalPDP)
	if raw == "" {
		return nil
	}
	if raw != pdp {
		out := raw
		return &out
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil
	}
	host := strings.ToLower(strings.TrimPrefix(u.Hostname(), "www."))
	if host != "" && host != "competitivecyclist.com" {
		out := raw
		return &out
	}
	return nil
}
