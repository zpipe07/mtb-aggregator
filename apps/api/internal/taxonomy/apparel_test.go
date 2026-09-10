package taxonomy

import (
	"slices"
	"testing"
)

func fromMountainBikes() []string {
	return []string{"Bikes", "Mountain Bikes"}
}

func fromRoadBikes() []string {
	return []string{"Bikes", "Road Bikes"}
}

func fromBikesParent() []string {
	return []string{"Bikes"}
}

func TestRefineApparel_ccGarmentsLeaveBikes(t *testing.T) {
	cases := []struct {
		from  []string
		title string
		want  []string
	}{
		{fromMountainBikes(), "Terry Bicycles Mixie Skirt - Women's Daisy Drop, M", clothingPath},
		{fromMountainBikes(), "Giro Liner Short - Men's Black, XXL", shortsPath},
		{fromMountainBikes(), "Club Ride Apparel Drift Short - Women's Plum Perfect, S", shortsPath},
		{fromMountainBikes(), "SHREDLY Hipster Cham Liner Short", shortsPath},
		{fromMountainBikes(), "Club Ride Apparel Montcham Short", shortsPath},
		{fromMountainBikes(), "PEARL iZUMi Transfer Minimal Boxer", shortsPath},
		{fromMountainBikes(), "SHREDLY YOGACHAM Liner Short", shortsPath},
		{fromMountainBikes(), "SHREDLY dress - Women's", clothingPath},
		{fromMountainBikes(), "Backcountry Tahoe Sun Golf Polo", jerseysPath},
		{fromBikesParent(), "Castelli Core Drill Short", shortsPath},
		{fromBikesParent(), "Castelli Espresso 2 Cap", clothingPath},
		{fromBikesParent(), "Castelli Core Short-Sleeve Tri Suit", clothingPath},
		{fromBikesParent(), "Castelli Free Speed 3 Race Tri Top", jerseysPath},
		{fromBikesParent(), "Castelli Soudal/Quick Step Cycling Cap", clothingPath},
		{fromRoadBikes(), "Castelli Saturday Morning Skinsuit", clothingPath},
		{fromRoadBikes(), "GOREWEAR SWIFTRIDE 3/4 Tight", pantsPath},
		{fromRoadBikes(), "PEARL iZUMi Thermal Cycling 3/4 Tight", pantsPath},
		{fromRoadBikes(), "ZOIC Reign Knickers", pantsPath},
		{fromRoadBikes(), "Club Ride Apparel Cog T-Shirt", shirtsPath},
		{fromRoadBikes(), "Castelli Innovation Logo T-Shirt", shirtsPath},
		{fromRoadBikes(), "Backcountry Tahoe Pro LT Sun Long-Sleeve Crew", shirtsPath},
		{[]string{"Bikes", "Kids Bikes"}, "Specialized Youth Trail Jersey", jerseysPath},
		{[]string{"Bikes", "Kids Bikes"}, "Specialized Youth Trail Short", shortsPath},
	}
	for _, tc := range cases {
		got := RefineApparel(tc.from, tc.title)
		if !slices.Equal(got, tc.want) {
			t.Errorf("RefineApparel(%v, %q) = %v, want %v", tc.from, tc.title, got, tc.want)
		}
	}
}

func TestRefineApparel_completeBikesStay(t *testing.T) {
	titles := []string{
		"Liv Women's Tempt 4 Hardtail Mountain Bike",
		"Giant ATX 2",
		"Eastern Alpaka",
		"Fuji Adventure 27.5",
		"Fuji Nevada 1.7",
		"Giant Talon 29 3",
		"Polygon Premier 5",
		"NS Bikes Synonym 2 Frameset",
		"Argon 18 Electron",
		"Giant Contend 3",
		"Specialized Allez Sprint Frameset",
		"Orbea Avant H30",
		"Polygon Strattos S2",
		"Santa Cruz Tallboy Carbon C S - Short Travel",
		"Specialized Stumpjumper EVO Comp Alloy Short Travel",
		"Specialized Hotwalk",
		"Yeti SB140 T-Series T2",
	}
	from := fromMountainBikes()
	for _, title := range titles {
		got := RefineApparel(from, title)
		if !slices.Equal(got, from) {
			t.Errorf("RefineApparel(Mountain Bikes, %q) = %v, want unchanged", title, got)
		}
	}
}

func TestRefineApparel_ignoresBareLinerAndOtherTrees(t *testing.T) {
	liner := RefineApparel(fromMountainBikes(), "Giro Manifest Spherical Helmet Liner")
	if !slices.Equal(liner, fromMountainBikes()) {
		t.Fatalf("bare helmet liner title should stay on Bikes, got %v", liner)
	}

	alreadyClothing := RefineApparel([]string{"Gear", "Clothing", "Shorts"}, "Club Ride Apparel Drift Short")
	if !slices.Equal(alreadyClothing, []string{"Gear", "Clothing", "Shorts"}) {
		t.Fatalf("already-clothing path should be unchanged, got %v", alreadyClothing)
	}

	brakes := RefineApparel([]string{"Components", "Brakes", "Brakesets"}, "Castelli Core Drill Short Promo")
	if !slices.Equal(brakes, []string{"Components", "Brakes", "Brakesets"}) {
		t.Fatalf("non-Bikes tree should be unchanged, got %v", brakes)
	}
}

func TestMapListing_ccApparelTitleEscapesMountainBikePath(t *testing.T) {
	SetMappings([]Mapping{
		{Raw: []string{"shorts", "liner shorts"}, Canonical: []string{"Gear", "Clothing", "Shorts"}},
		{Raw: []string{"clothing"}, Canonical: []string{"Gear", "Clothing"}},
		{Raw: []string{"mountain bike", "mtb", "mountain bikes"}, Canonical: []string{"Bikes", "Mountain Bikes"}},
		{Raw: []string{"bike", "bikes"}, Canonical: []string{"Bikes"}},
	})
	t.Cleanup(func() { SetMappings(nil) })

	got := MapListing(
		[]string{"Women's Clothing", "Women's Mountain Bike Clothing", "Women's Mountain Bike Bottoms", "Women's Skirts"},
		"Terry Bicycles Mixie Skirt - Women's Daisy Drop, M",
	)
	if !slices.Equal(got, clothingPath) {
		t.Fatalf("MapListing(CC skirt path + title) = %v, want Clothing", got)
	}

	short := MapListing(
		[]string{"Men's Clothing", "Men's Mountain Bike Clothing", "Men's Mountain Bike Bottoms", "Men's Liners"},
		"Giro Liner Short - Men's Black, XXL",
	)
	if !slices.Equal(short, shortsPath) {
		t.Fatalf("MapListing(CC liner path + title) = %v, want Shorts", short)
	}

	cap := MapListing(
		[]string{"Men's Clothing", "Men's Bike Hats", "Cycling Hats & Caps"},
		"Castelli Espresso 2 Cap",
	)
	if !slices.Equal(cap, clothingPath) {
		t.Fatalf("MapListing(CC hat path + title) = %v, want Clothing", cap)
	}

	bike := MapListing(
		[]string{"Bikes", "Mountain Bikes", "Pre-Configured Mountain Bikes"},
		"Liv Women's Tempt 4 Hardtail Mountain Bike",
	)
	if !slices.Equal(bike, []string{"Bikes", "Mountain Bikes"}) {
		t.Fatalf("MapListing(complete bike) = %v, want Mountain Bikes", bike)
	}
}
