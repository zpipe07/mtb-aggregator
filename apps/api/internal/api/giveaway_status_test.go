package api

import (
	"testing"
	"time"
)

func TestDeriveGiveawayStatus(t *testing.T) {
	now := time.Date(2026, 9, 2, 18, 0, 0, 0, time.UTC)
	endsOpen := now.Add(48 * time.Hour)
	endsEnded := now.Add(-time.Hour)
	startsFuture := now.Add(24 * time.Hour)
	startsPast := now.Add(-time.Hour)

	tests := []struct {
		name        string
		startsAt    time.Time
		startsAtSet bool
		endsAt      time.Time
		want        GiveawayStatus
	}{
		{name: "open no start", endsAt: endsOpen, want: GiveawayStatusOpen},
		{name: "open started", startsAt: startsPast, startsAtSet: true, endsAt: endsOpen, want: GiveawayStatusOpen},
		{name: "upcoming", startsAt: startsFuture, startsAtSet: true, endsAt: endsOpen, want: GiveawayStatusUpcoming},
		{name: "ended", endsAt: endsEnded, want: GiveawayStatusEnded},
		{name: "ended wins over upcoming start", startsAt: startsFuture, startsAtSet: true, endsAt: endsEnded, want: GiveawayStatusEnded},
		{name: "exact ends_at is ended", endsAt: now, want: GiveawayStatusEnded},
		{name: "one ns before end is open", endsAt: now.Add(time.Nanosecond), want: GiveawayStatusOpen},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DeriveGiveawayStatus(now, tt.startsAt, tt.endsAt, tt.startsAtSet)
			if got != tt.want {
				t.Fatalf("got %q want %q", got, tt.want)
			}
		})
	}
}

func TestGiveawayPubliclyVisible(t *testing.T) {
	now := time.Date(2026, 9, 2, 18, 0, 0, 0, time.UTC)
	tests := []struct {
		name      string
		endsAt    time.Time
		published bool
		want      bool
	}{
		{name: "draft hidden", endsAt: now.Add(time.Hour), published: false, want: false},
		{name: "open published", endsAt: now.Add(time.Hour), published: true, want: true},
		{name: "ended 29d still listed", endsAt: now.Add(-29 * 24 * time.Hour), published: true, want: true},
		{name: "ended exactly 30d still listed", endsAt: now.Add(-GiveawayRecentEndedWindow), published: true, want: true},
		{name: "ended 30d+1s hidden", endsAt: now.Add(-GiveawayRecentEndedWindow - time.Second), published: true, want: false},
		{name: "upcoming published", endsAt: now.Add(10 * 24 * time.Hour), published: true, want: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GiveawayPubliclyVisible(now, tt.endsAt, tt.published)
			if got != tt.want {
				t.Fatalf("got %v want %v", got, tt.want)
			}
		})
	}
}
