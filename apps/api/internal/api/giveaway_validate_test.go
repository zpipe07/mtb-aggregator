package api

import "testing"

func TestSlugifyGiveaway(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"Win a Custom Norco Rampage!", "win-a-custom-norco-rampage"},
		{"  Muc-Off Specialized  ", "muc-off-specialized"},
		{"!!!", "giveaway"},
		{"", "giveaway"},
	}
	for _, tt := range tests {
		got := SlugifyGiveaway(tt.in)
		if got != tt.want {
			t.Errorf("SlugifyGiveaway(%q)=%q want %q", tt.in, got, tt.want)
		}
	}
}

func TestIsHTTPURL(t *testing.T) {
	if !IsHTTPURL("https://www.norco.com/whistler-contest/") {
		t.Fatal("expected https host url ok")
	}
	if !IsHTTPURL("http://example.com/rules") {
		t.Fatal("expected http ok")
	}
	if IsHTTPURL("javascript:alert(1)") {
		t.Fatal("javascript must fail")
	}
	if IsHTTPURL("/relative") {
		t.Fatal("relative must fail")
	}
	if IsHTTPURL("https://") {
		t.Fatal("empty host must fail")
	}
}

func TestParseGiveawayWrite_validation(t *testing.T) {
	truePtr := true
	price := 10.0
	giveawayPrice := 5.0
	valid := giveawayWriteBody{
		Kind:             "Giveaway",
		Title:            "Win a custom Norco Rampage",
		Summary:          "One-of-one custom paint.",
		PrizeName:        "Custom Norco Rampage",
		HostName:         "Norco",
		EntryURL:         "https://www.norco.com/whistler-contest/",
		OfficialRulesURL: "https://www.norco.com/whistler-contest/#rules",
		EndsAt:           "2026-09-15T23:59:59Z",
		Published:        &truePtr,
	}

	got, err := parseGiveawayWrite(valid)
	if err != nil {
		t.Fatalf("valid write: %v", err)
	}
	if got.Kind != "giveaway" || got.Slug != "win-a-custom-norco-rampage" || !got.Published {
		t.Fatalf("unexpected parse: %+v", got)
	}

	badKind := valid
	badKind.Kind = "contest"
	if _, err := parseGiveawayWrite(badKind); err == nil {
		t.Fatal("expected kind error")
	}

	withPrice := valid
	withPrice.TicketPrice = &giveawayPrice
	if _, err := parseGiveawayWrite(withPrice); err == nil {
		t.Fatal("expected ticket_price rejected on giveaway")
	}

	raffle := valid
	raffle.Kind = "raffle"
	raffle.TicketPrice = &price
	got, err = parseGiveawayWrite(raffle)
	if err != nil {
		t.Fatalf("raffle with price: %v", err)
	}
	if got.TicketPrice == nil || *got.TicketPrice != 10 {
		t.Fatal("expected ticket price kept")
	}

	zero := 0.0
	raffleZero := raffle
	raffleZero.TicketPrice = &zero
	if _, err := parseGiveawayWrite(raffleZero); err == nil {
		t.Fatal("expected zero price error")
	}

	startsAfter := valid
	s := "2026-09-16T00:00:00Z"
	startsAfter.StartsAt = &s
	if _, err := parseGiveawayWrite(startsAfter); err == nil {
		t.Fatal("expected starts_at after ends_at error")
	}

	badURL := valid
	badURL.EntryURL = "ftp://example.com/x"
	if _, err := parseGiveawayWrite(badURL); err == nil {
		t.Fatal("expected entry_url error")
	}
}

func TestNextGiveawaySlug(t *testing.T) {
	if got := nextGiveawaySlug("norco-rampage", 1); got != "norco-rampage" {
		t.Fatalf("got %q", got)
	}
	if got := nextGiveawaySlug("norco-rampage", 2); got != "norco-rampage-2" {
		t.Fatalf("got %q", got)
	}
}
