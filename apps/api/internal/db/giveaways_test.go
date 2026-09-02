package db

import (
	"context"
	"testing"
	"time"
)

func TestListPublicGiveaways_visibility(t *testing.T) {
	d := testDB(t)
	ctx := context.Background()
	now := time.Now().UTC()

	insert := func(slug, kind, entry string, published bool, starts, ends time.Time) int {
		t.Helper()
		var startsAt *time.Time
		if !starts.IsZero() {
			startsAt = &starts
		}
		id, err := d.CreateGiveaway(ctx, GiveawayWrite{
			Slug:             slug,
			Kind:             kind,
			Title:            slug,
			Summary:          "summary",
			PrizeName:        "prize",
			HostName:         "Host",
			EntryURL:         entry,
			OfficialRulesURL: "https://example.com/rules",
			StartsAt:         startsAt,
			EndsAt:           ends,
			TicketCurrency:   "USD",
			Published:        published,
		})
		if err != nil {
			t.Fatalf("insert %s: %v", slug, err)
		}
		t.Cleanup(func() {
			_ = d.DeleteGiveaway(context.Background(), id)
		})
		return id
	}

	openID := insert("test-open", "giveaway", "https://example.com/open", true, time.Time{}, now.Add(48*time.Hour))
	insert("test-draft", "giveaway", "https://example.com/draft", false, time.Time{}, now.Add(48*time.Hour))
	insert("test-old", "giveaway", "https://example.com/old", true, time.Time{}, now.Add(-31*24*time.Hour))
	recentID := insert("test-recent", "raffle", "https://example.com/recent", true, time.Time{}, now.Add(-2*24*time.Hour))
	upcomingID := insert("test-upcoming", "giveaway", "https://example.com/upcoming", true, now.Add(24*time.Hour), now.Add(72*time.Hour))

	rows, err := d.ListPublicGiveaways(ctx, now, "")
	if err != nil {
		t.Fatal(err)
	}
	got := map[int]Giveaway{}
	for _, g := range rows {
		got[g.ID] = g
	}
	if _, ok := got[openID]; !ok {
		t.Fatal("expected open published")
	}
	if _, ok := got[recentID]; !ok {
		t.Fatal("expected recently ended")
	}
	if _, ok := got[upcomingID]; !ok {
		t.Fatal("expected upcoming")
	}
	if len(got) < 3 {
		t.Fatalf("too few public rows: %d", len(got))
	}
	for _, g := range rows {
		if g.Slug == "test-draft" || g.Slug == "test-old" {
			t.Fatalf("unexpected %s in public list", g.Slug)
		}
	}

	raffles, err := d.ListPublicGiveaways(ctx, now, "raffle")
	if err != nil {
		t.Fatal(err)
	}
	for _, g := range raffles {
		if g.Kind != "raffle" {
			t.Fatalf("kind filter leaked %s", g.Kind)
		}
	}
}
