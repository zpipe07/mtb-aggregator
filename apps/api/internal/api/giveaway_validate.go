package api

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"
)

const (
	giveawayKindGiveaway = "giveaway"
	giveawayKindRaffle   = "raffle"
	giveawaySlugMaxLen   = 120
	giveawayPublicCap    = 100
)

var giveawaySlugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

func SlugifyGiveaway(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			continue
		}
		b.WriteByte('-')
	}
	s = giveawaySlugNonAlnum.ReplaceAllString(b.String(), "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "giveaway"
	}
	if len(s) > giveawaySlugMaxLen {
		s = strings.Trim(s[:giveawaySlugMaxLen], "-")
	}
	return s
}

func IsHTTPURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	return u.Host != ""
}

type parsedGiveaway struct {
	Slug              string
	Kind              string
	Title             string
	Summary           string
	PrizeName         string
	PrizeDescription  *string
	ImageURL          *string
	HostName          string
	EntryURL          string
	OfficialRulesURL  string
	StartsAt          *time.Time
	EndsAt            time.Time
	Eligibility       *string
	EntryRequirements *string
	TicketPrice       *float64
	TicketCurrency    string
	Beneficiary       *string
	Published         bool
	SlugProvided      bool
}

type giveawayWriteBody struct {
	Slug              *string  `json:"slug"`
	Kind              string   `json:"kind"`
	Title             string   `json:"title"`
	Summary           string   `json:"summary"`
	PrizeName         string   `json:"prize_name"`
	PrizeDescription  *string  `json:"prize_description"`
	ImageURL          *string  `json:"image_url"`
	HostName          string   `json:"host_name"`
	EntryURL          string   `json:"entry_url"`
	OfficialRulesURL  string   `json:"official_rules_url"`
	StartsAt          *string  `json:"starts_at"`
	EndsAt            string   `json:"ends_at"`
	Eligibility       *string  `json:"eligibility"`
	EntryRequirements *string  `json:"entry_requirements"`
	TicketPrice       *float64 `json:"ticket_price"`
	TicketCurrency    *string  `json:"ticket_currency"`
	Beneficiary       *string  `json:"beneficiary"`
	Published         *bool    `json:"published"`
}

func parseOptionalText(v *string) *string {
	if v == nil {
		return nil
	}
	s := strings.TrimSpace(*v)
	if s == "" {
		return nil
	}
	return &s
}

func parseRFC3339Ptr(raw *string, field string) (*time.Time, error) {
	if raw == nil {
		return nil, nil
	}
	s := strings.TrimSpace(*raw)
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t, err = time.Parse(time.RFC3339Nano, s)
	}
	if err != nil {
		return nil, fmt.Errorf("%s must be RFC3339", field)
	}
	return &t, nil
}

func parseGiveawayWrite(body giveawayWriteBody) (parsedGiveaway, error) {
	kind := strings.ToLower(strings.TrimSpace(body.Kind))
	if kind != giveawayKindGiveaway && kind != giveawayKindRaffle {
		return parsedGiveaway{}, fmt.Errorf("kind must be giveaway or raffle")
	}
	title := strings.TrimSpace(body.Title)
	summary := strings.TrimSpace(body.Summary)
	prize := strings.TrimSpace(body.PrizeName)
	host := strings.TrimSpace(body.HostName)
	entry := strings.TrimSpace(body.EntryURL)
	rules := strings.TrimSpace(body.OfficialRulesURL)
	if title == "" || summary == "" || prize == "" || host == "" || entry == "" || rules == "" {
		return parsedGiveaway{}, fmt.Errorf("title, summary, prize_name, host_name, entry_url, official_rules_url required")
	}
	if !IsHTTPURL(entry) {
		return parsedGiveaway{}, fmt.Errorf("entry_url must be http or https")
	}
	if !IsHTTPURL(rules) {
		return parsedGiveaway{}, fmt.Errorf("official_rules_url must be http or https")
	}
	img := parseOptionalText(body.ImageURL)
	if img != nil && !IsHTTPURL(*img) {
		return parsedGiveaway{}, fmt.Errorf("image_url must be http or https")
	}
	endsRaw := strings.TrimSpace(body.EndsAt)
	if endsRaw == "" {
		return parsedGiveaway{}, fmt.Errorf("ends_at required")
	}
	endsAt, err := time.Parse(time.RFC3339, endsRaw)
	if err != nil {
		endsAt, err = time.Parse(time.RFC3339Nano, endsRaw)
	}
	if err != nil {
		return parsedGiveaway{}, fmt.Errorf("ends_at must be RFC3339")
	}
	startsAt, err := parseRFC3339Ptr(body.StartsAt, "starts_at")
	if err != nil {
		return parsedGiveaway{}, err
	}
	if startsAt != nil && startsAt.After(endsAt) {
		return parsedGiveaway{}, fmt.Errorf("starts_at must be before ends_at")
	}
	if kind == giveawayKindGiveaway && body.TicketPrice != nil {
		return parsedGiveaway{}, fmt.Errorf("ticket_price is only valid for raffles")
	}
	if body.TicketPrice != nil && *body.TicketPrice <= 0 {
		return parsedGiveaway{}, fmt.Errorf("ticket_price must be greater than 0")
	}
	currency := "USD"
	if body.TicketCurrency != nil {
		c := strings.ToUpper(strings.TrimSpace(*body.TicketCurrency))
		if c != "" {
			if len(c) != 3 {
				return parsedGiveaway{}, fmt.Errorf("ticket_currency must be a 3-letter code")
			}
			currency = c
		}
	}
	out := parsedGiveaway{
		Kind:              kind,
		Title:             title,
		Summary:           summary,
		PrizeName:         prize,
		PrizeDescription:  parseOptionalText(body.PrizeDescription),
		ImageURL:          img,
		HostName:          host,
		EntryURL:          entry,
		OfficialRulesURL:  rules,
		StartsAt:          startsAt,
		EndsAt:            endsAt,
		Eligibility:       parseOptionalText(body.Eligibility),
		EntryRequirements: parseOptionalText(body.EntryRequirements),
		TicketPrice:       body.TicketPrice,
		TicketCurrency:    currency,
		Beneficiary:       parseOptionalText(body.Beneficiary),
	}
	if body.Published != nil {
		out.Published = *body.Published
	}
	if body.Slug != nil && strings.TrimSpace(*body.Slug) != "" {
		out.Slug = SlugifyGiveaway(*body.Slug)
		out.SlugProvided = true
	} else {
		out.Slug = SlugifyGiveaway(title)
	}
	return out, nil
}

func nextGiveawaySlug(base string, n int) string {
	if n <= 1 {
		return base
	}
	suffix := fmt.Sprintf("-%d", n)
	maxBase := giveawaySlugMaxLen - len(suffix)
	if maxBase < 1 {
		maxBase = 1
	}
	trimmed := base
	if len(trimmed) > maxBase {
		trimmed = strings.Trim(trimmed[:maxBase], "-")
	}
	return trimmed + suffix
}
