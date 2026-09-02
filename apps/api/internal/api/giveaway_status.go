package api

import "time"

const GiveawayRecentEndedWindow = 30 * 24 * time.Hour

type GiveawayStatus string

const (
	GiveawayStatusUpcoming GiveawayStatus = "upcoming"
	GiveawayStatusOpen     GiveawayStatus = "open"
	GiveawayStatusEnded    GiveawayStatus = "ended"
)

func DeriveGiveawayStatus(now, startsAt, endsAt time.Time, startsAtSet bool) GiveawayStatus {
	if !endsAt.IsZero() && !now.Before(endsAt) {
		return GiveawayStatusEnded
	}
	if startsAtSet && now.Before(startsAt) {
		return GiveawayStatusUpcoming
	}
	return GiveawayStatusOpen
}

// GiveawayPubliclyVisible is the public list rule: published and not ended more than 30 days ago.
func GiveawayPubliclyVisible(now, endsAt time.Time, published bool) bool {
	if !published {
		return false
	}
	cutoff := now.Add(-GiveawayRecentEndedWindow)
	return !endsAt.Before(cutoff)
}
