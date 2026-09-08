package api

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/mtb-aggregator/api/internal/db"
)

func TestToPublicGiveawayJSON_omitsPublished(t *testing.T) {
	now := time.Date(2026, 9, 2, 18, 0, 0, 0, time.UTC)
	ends := now.Add(48 * time.Hour)
	g := db.Giveaway{
		ID:               7,
		Slug:             "norco-rampage",
		Kind:             "giveaway",
		Title:            "Win a custom Norco Rampage",
		Summary:          "One-of-one.",
		PrizeName:        "Custom Norco Rampage",
		HostName:         "Norco",
		EntryURL:         "https://www.norco.com/whistler-contest/",
		OfficialRulesURL: "https://www.norco.com/rules",
		EndsAt:           ends,
		TicketCurrency:   "USD",
		Published:        true,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	raw, err := json.Marshal(toPublicGiveawayJSON(g, now))
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	if _, ok := m["published"]; ok {
		t.Fatalf("public JSON must not include published: %s", raw)
	}
	if m["status"] != "open" {
		t.Fatalf("status=%v", m["status"])
	}
	if m["slug"] != "norco-rampage" {
		t.Fatalf("slug=%v", m["slug"])
	}
}

func TestToPublicGiveawayJSON_endedStatus(t *testing.T) {
	now := time.Date(2026, 9, 2, 18, 0, 0, 0, time.UTC)
	g := db.Giveaway{
		ID:               1,
		Slug:             "ended-one",
		Kind:             "raffle",
		Title:            "Shop raffle",
		Summary:          "Tickets.",
		PrizeName:        "Bike",
		HostName:         "Local shop",
		EntryURL:         "https://example.com/raffle",
		OfficialRulesURL: "https://example.com/rules",
		EndsAt:           now.Add(-time.Hour),
		TicketCurrency:   "USD",
		Published:        true,
	}
	item := toPublicGiveawayJSON(g, now)
	if item.Status != string(GiveawayStatusEnded) {
		t.Fatalf("status=%q", item.Status)
	}
}
