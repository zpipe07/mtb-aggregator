package taxonomy

import (
	"path/filepath"
	"slices"
	"testing"
)

func TestMap_gloveBreadcrumbsBeatClothingShortAndMTB(t *testing.T) {
	SetMappings([]Mapping{
		{Raw: []string{"glove", "gloves"}, Canonical: []string{"Gear", "Gloves"}},
		{Raw: []string{"mountain bike clothing", "mtb clothing", "road bike clothing", "skirt", "skirts"}, Canonical: []string{"Gear", "Clothing"}},
		{Raw: []string{"shorts", "liner short"}, Canonical: []string{"Gear", "Clothing", "Shorts"}},
		{Raw: []string{"jacket", "jackets", "softshell", "vest"}, Canonical: []string{"Gear", "Clothing", "Jackets"}},
		{Raw: []string{"clothing", "jersey", "jerseys", "short", "shorts", "pant", "pants", "jacket", "vest", "glove", "sock", "socks"}, Canonical: []string{"Gear", "Clothing"}},
		{Raw: []string{"mountain bike", "mtb", "mountain bikes"}, Canonical: []string{"Bikes", "Mountain Bikes"}},
		{Raw: []string{"bike", "bikes"}, Canonical: []string{"Bikes"}},
	})
	t.Cleanup(func() { SetMappings(nil) })

	cases := []struct {
		raw  []string
		want []string
	}{
		{[]string{"Women's Clothing", "Women's Mountain Bike Clothing", "Women's Mountain Bike Accessories", "Women's Mountain Bike Gloves", "Women's Long Finger Mountain Bike Gloves"}, []string{"Gear", "Gloves"}},
		{[]string{"MTB Gloves"}, []string{"Gear", "Gloves"}},
		{[]string{"Bike Gloves"}, []string{"Gear", "Gloves"}},
		{[]string{"Road/XC Gloves"}, []string{"Gear", "Gloves"}},
		{[]string{"Apparel", "Gloves", "Men's Gloves"}, []string{"Gear", "Gloves"}},
		{[]string{"Men's Clothing", "Men's Road Bike Clothing", "Men's Road Bike Accessories", "Men's Gloves", "Men's Short Finger Cycling Gloves"}, []string{"Gear", "Gloves"}},
		{[]string{"Gloves and Liners"}, []string{"Gear", "Gloves"}},
		{[]string{"Clothing & Protective Gear"}, []string{"Gear", "Clothing"}},
		{[]string{"Clothing"}, []string{"Gear", "Clothing"}},
		{[]string{"Women's Clothing", "Women's Mountain Bike Clothing", "Women's Mountain Bike Bottoms", "Women's Skirts"}, []string{"Gear", "Clothing"}},
	}
	for _, tc := range cases {
		got := Map(tc.raw)
		if !slices.Equal(got, tc.want) {
			t.Errorf("Map(%v) = %v, want %v", tc.raw, got, tc.want)
		}
	}
}

func TestMap_seedTaxonomyMapsGlovePaths(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "packages", "shared", "category_taxonomy.json")
	if err := Load(path); err != nil {
		t.Fatalf("Load(%s): %v", path, err)
	}
	t.Cleanup(func() { SetMappings(nil) })

	cases := []struct {
		raw  []string
		want []string
	}{
		{[]string{"Women's Clothing", "Women's Mountain Bike Clothing", "Women's Mountain Bike Accessories", "Women's Mountain Bike Gloves", "Women's Long Finger Mountain Bike Gloves"}, []string{"Gear", "Gloves"}},
		{[]string{"MTB Gloves"}, []string{"Gear", "Gloves"}},
		{[]string{"Road/XC Gloves"}, []string{"Gear", "Gloves"}},
		{[]string{"Apparel", "Gloves", "Men's Gloves"}, []string{"Gear", "Gloves"}},
		{[]string{"Women's Clothing", "Women's Mountain Bike Clothing", "Women's Mountain Bike Bottoms", "Women's Skirts"}, []string{"Gear", "Clothing"}},
		{[]string{"Bikes", "Mountain Bikes", "Pre-Configured Mountain Bikes"}, []string{"Bikes", "Mountain"}},
	}
	for _, tc := range cases {
		got := Map(tc.raw)
		if !slices.Equal(got, tc.want) {
			t.Errorf("Map(%v) = %v, want %v", tc.raw, got, tc.want)
		}
	}
}

func TestRefineGloves_clothingTitlesMoveToGloves(t *testing.T) {
	clothing := []string{"Gear", "Clothing"}
	shorts := []string{"Gear", "Clothing", "Shorts"}
	jackets := []string{"Gear", "Clothing", "Jackets"}
	cases := []struct {
		from  []string
		title string
		want  []string
	}{
		{clothing, "Troy Lee Designs Ace 2.0 Glove - Women's Firecracker, L", glovesPath},
		{clothing, "Fox Racing Flexair Pro Gloves", glovesPath},
		{clothing, "iXS Carve Digger Gloves", glovesPath},
		{clothing, "Endura Loop Mitt - Black", glovesPath},
		{clothing, "Oakley Ridge Gore-Tex Gauntlet Mitten Blackout, XL - Men's", glovesPath},
		{clothing, "Gore Universal Undergloves - Black", glovesPath},
		{shorts, "Pearl Izumi Expedition Gel Short Finger Glove - Twilight", glovesPath},
		{shorts, "Fox Racing Ranger Gel Short MTB Glove - Bark", glovesPath},
		{jackets, "2026 Softshell Thermal Glove Lf Wmn", glovesPath},
		{[]string{"Accessories"}, "Women's La DND Glove", glovesPath},
		{[]string{"Gear"}, "ION Scrub Amp MTB Glove - Black", glovesPath},
		{[]string{"Gear", "Shoes"}, "DND Glove", glovesPath},
		{[]string{"Bikes", "Mountain Bikes"}, "Fox Racing Ranger Gel Short Finger Glove - Bark", []string{"Bikes", "Mountain Bikes"}},
	}
	for _, tc := range cases {
		got := RefineGloves(tc.from, tc.title)
		if !slices.Equal(got, tc.want) {
			t.Errorf("RefineGloves(%v, %q) = %v, want %v", tc.from, tc.title, got, tc.want)
		}
	}
}

func TestRefineGloves_leavesNonGloves(t *testing.T) {
	clothing := []string{"Gear", "Clothing"}
	stay := []string{
		"Club Ride Apparel Drift Short - Women's Plum Perfect, S",
		"Castelli Innovation Logo T-Shirt",
		"Glacier Glove Outback Hat Collection – Sun Protection, Breathable Wide-Brim Safari Hats",
		"Muc-Off Deep Scrubber Cleaning Glove - Silicone Dishwasher Safe Large",
		"Sunlite Road Brake Cables 1700mm Stainless Steel, Silver Gloves",
		"Fasthouse Grindhouse Stealth Moto Sock - Black-Camo",
		"Yeti SB165 Summit",
	}
	gear := []string{"Gear"}
	pogie := RefineGloves(gear, "Bar Mitts Mountain / Commuter Pogie Handlebar Mitten: LG Black")
	if !slices.Equal(pogie, gear) {
		t.Fatalf("bar mitts on Gear should stay, got %v", pogie)
	}
	hat := RefineGloves(gear, "Glacier Glove Outback Hat Collection – Sun Protection Hats")
	if !slices.Equal(hat, gear) {
		t.Fatalf("Glacier Glove hat should stay on Gear, got %v", hat)
	}
	for _, title := range stay {
		got := RefineGloves(clothing, title)
		if !slices.Equal(got, clothing) {
			t.Errorf("RefineGloves(Clothing, %q) = %v, want Clothing", title, got)
		}
	}

	gloves := RefineGloves(glovesPath, "Troy Lee Designs Ace 2.0 Glove")
	if !slices.Equal(gloves, glovesPath) {
		t.Fatalf("already on Gloves should stay, got %v", gloves)
	}
}

func TestMapListing_gloveTitleEscapesClothingPath(t *testing.T) {
	SetMappings([]Mapping{
		{Raw: []string{"glove", "gloves"}, Canonical: []string{"Gear", "Gloves"}},
		{Raw: []string{"shorts", "liner short"}, Canonical: []string{"Gear", "Clothing", "Shorts"}},
		{Raw: []string{"clothing", "short", "glove"}, Canonical: []string{"Gear", "Clothing"}},
		{Raw: []string{"mountain bike", "mtb"}, Canonical: []string{"Bikes", "Mountain Bikes"}},
	})
	t.Cleanup(func() { SetMappings(nil) })

	fromProtective := MapListing([]string{"Clothing & Protective Gear"}, "iXS Carve Digger Gloves")
	if !slices.Equal(fromProtective, glovesPath) {
		t.Fatalf("MapListing(Clothing & Protective Gear + glove title) = %v, want Gloves", fromProtective)
	}

	fromShortFinger := MapListing(
		[]string{"Men's Clothing", "Men's Road Bike Clothing", "Men's Road Bike Accessories", "Men's Gloves", "Men's Short Finger Cycling Gloves"},
		"Pearl Izumi Expedition Gel Short Finger Glove - Twilight",
	)
	if !slices.Equal(fromShortFinger, glovesPath) {
		t.Fatalf("MapListing(short-finger glove path) = %v, want Gloves", fromShortFinger)
	}

	fromBike := MapListing(
		[]string{"Bikes", "Mountain Bikes"},
		"Fox Racing Ranger Gel Short Finger Glove - Bark",
	)
	if !slices.Equal(fromBike, glovesPath) {
		t.Fatalf("MapListing(MTB path + short-finger glove title) = %v, want Gloves", fromBike)
	}

	jersey := MapListing([]string{"Clothing"}, "Castelli Innovation Logo T-Shirt")
	if !slices.Equal(jersey, []string{"Gear", "Clothing"}) {
		t.Fatalf("MapListing(jersey) = %v, want Clothing", jersey)
	}
}
