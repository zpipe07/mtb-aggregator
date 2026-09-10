package taxonomy

import (
	"path/filepath"
	"slices"
	"testing"
)

func fromBrakesets() []string {
	return []string{"Components", "Brakes", "Brakesets"}
}

func fromBrakesParent() []string {
	return []string{"Components", "Brakes"}
}

func wantBrakeParts() []string {
	return []string{"Components", "Brakes", "Brake parts"}
}

// Production-like priority: parts keywords, then pads/rotors, then bare brake → Brakesets.
func zac272BrakeMappings() []Mapping {
	return []Mapping{
		{
			Raw: []string{
				"brake parts", "brake part", "brake hardware",
				"brake olive", "brake olives", "olive and insert", "olives and inserts",
				"banjo bolt", "brake piston", "brake pistons", "caliper piston",
				"brake hose", "brake hoses", "hydraulic hose",
				"brake cable", "brake cables", "brake housing", "cable parts",
				"cables & hoses", "cables & housing",
				"brake adaptor", "brake adapter", "brake adaptors", "brake adapters",
				"mount adaptor", "mount adapter",
				"lever parts", "lever part", "lever hood", "lever hoods", "lever blade",
				"brake small parts",
				"brake noodle", "cable hanger",
				"parts & adaptors", "parts & adapters",
			},
			Canonical: []string{"Components", "Brakes", "Brake parts"},
		},
		{Raw: []string{"brake pad", "brake pads"}, Canonical: []string{"Components", "Brakes", "Pads"}},
		{Raw: []string{"rotor", "rotors"}, Canonical: []string{"Components", "Brakes", "Rotors"}},
		{Raw: []string{"brakes", "brake", "brakesets", "brakeset"}, Canonical: []string{"Components", "Brakes", "Brakesets"}},
	}
}

func TestRefineBrakes_smallHardwareLeavesBrakesets(t *testing.T) {
	titles := []string{
		"Jagwire Brake Housing Open Brass End Cap",
		"Jagwire 1.8mm Cable End Crimps",
		"Foundation Brake Cable (Single)",
		"SRAM 5mm Brake Cable Housing - White",
		"BH59 Olive & Barb (Connecting Insert)",
		"Shimano Linear Pull Brake Noodle",
		"Shimano BL-M395 Hydraulic Brake Lever Bleed Screw & O-Ring",
		"Shimano XT BL-M8000 BL-M785 Brake Lever Axle",
		"Shimano Flat-Mount Road Disc Caliper Fixing Bolt C",
		"Shimano Disc Brake Adapter",
		"Hayes T25 Torx Rotor Bolts",
		"Avid Lever Parts",
		"Jagwire Center Lock Disc Brake Rotor Lock Ring for 9-12mm Axles, Alloy",
		"Tektro Cable Hanger",
		"Shimano 105 ST-5700 STI Lever Hoods",
		"SLX BL-M7100 Brake Lever Blade",
		"Code R Lever Blade Kit",
	}
	for _, title := range titles {
		got := RefineBrakes(fromBrakesets(), title)
		if !slices.Equal(got, wantBrakeParts()) {
			t.Errorf("RefineBrakes(Brakesets, %q) = %v, want Brake parts", title, got)
		}
	}
}

func TestRefineBrakes_completeBrakesetsStay(t *testing.T) {
	titles := []string{
		"SRAM Code RSC Disc Brake",
		"Shimano XT M8120 4-Piston Disc Brake",
		"Hope Tech 4 V4 Brake Set",
		"Magura MT7 Brakeset",
		"Avid FR-5 MTB Brake Lever - Single - Black",
		"Sunlite Alloy Cantilever Brake - Silver",
		"Tektro 855AL Linear Pull Brake",
		"Shimano Altus CT91 Cantilever Brake Caliper - Rear - Silver",
	}
	for _, title := range titles {
		got := RefineBrakes(fromBrakesets(), title)
		if !slices.Equal(got, fromBrakesets()) {
			t.Errorf("RefineBrakes(Brakesets, %q) = %v, want Brakesets", title, got)
		}
	}
}

func TestRefineBrakes_padTitleGoesToPads(t *testing.T) {
	got := RefineBrakes(fromBrakesets(), "Hayes Dyno/Ryde Disc Brake Pads")
	want := []string{"Components", "Brakes", "Pads"}
	if !slices.Equal(got, want) {
		t.Fatalf("RefineBrakes(Brakesets, pad title) = %v, want Pads", got)
	}
}

func TestRefineBrakes_parentPathAlsoMoves(t *testing.T) {
	got := RefineBrakes(fromBrakesParent(), "BH90 Olive & Barb (Connecting Insert)")
	if !slices.Equal(got, wantBrakeParts()) {
		t.Fatalf("RefineBrakes(Brakes parent, olive) = %v, want Brake parts", got)
	}
}

func TestRefineBrakes_ignoresPadsRotorsAndOtherTrees(t *testing.T) {
	pad := RefineBrakes([]string{"Components", "Brakes", "Pads"}, "Jagwire Brake Cable")
	if !slices.Equal(pad, []string{"Components", "Brakes", "Pads"}) {
		t.Fatalf("should not steal Pads: got %v", pad)
	}
	rotor := RefineBrakes([]string{"Components", "Brakes", "Rotors"}, "Shimano Disc Brake Adapter")
	if !slices.Equal(rotor, []string{"Components", "Brakes", "Rotors"}) {
		t.Fatalf("should not steal Rotors: got %v", rotor)
	}
	bike := RefineBrakes([]string{"Bikes", "Mountain Bikes"}, "SRAM Code Brake Cable Promo")
	if !slices.Equal(bike, []string{"Bikes", "Mountain Bikes"}) {
		t.Fatalf("should ignore titles outside Brakes: got %v", bike)
	}
}

func TestMap_zac272PartsPathsBeatBareBrake(t *testing.T) {
	SetMappings(zac272BrakeMappings())
	t.Cleanup(func() { SetMappings(nil) })

	cases := []struct {
		raw  []string
		want []string
	}{
		{[]string{"Brake Cable Parts"}, wantBrakeParts()},
		{[]string{"MTB/Road Brake Cables"}, wantBrakeParts()},
		{[]string{"BMX Brake Cables"}, wantBrakeParts()},
		{[]string{"Brake Adaptors"}, wantBrakeParts()},
		{[]string{"Components > Brakes > Brake Adaptors"}, wantBrakeParts()},
		{[]string{"Components > Brakes > Cables & Hoses"}, wantBrakeParts()},
		{[]string{"Brake Lever Parts and Accessories"}, wantBrakeParts()},
		{[]string{"Brake Small Parts"}, wantBrakeParts()},
		{[]string{"Linear Pull Brake Noodle"}, wantBrakeParts()},
		{[]string{"MTB Disc Brake Parts"}, wantBrakeParts()},
		{[]string{"_Components_Brakes & Brake Levers_Parts & Adaptors__"}, wantBrakeParts()},
		{[]string{"MTB Disc Brakes"}, fromBrakesets()},
		{[]string{"Components > Brakes > Brake Sets"}, fromBrakesets()},
		{[]string{"Disc Brake Calipers"}, fromBrakesets()},
	}
	for _, tc := range cases {
		got := Map(tc.raw)
		if !slices.Equal(got, tc.want) {
			t.Errorf("Map(%v) = %v, want %v", tc.raw, got, tc.want)
		}
	}
}

func TestMapListing_cableTitleOnDiscBrakePathGoesToParts(t *testing.T) {
	SetMappings(zac272BrakeMappings())
	t.Cleanup(func() { SetMappings(nil) })

	got := MapListing([]string{"MTB Disc Brakes"}, "Jagwire 1.8mm Cable End Crimps")
	if !slices.Equal(got, wantBrakeParts()) {
		t.Fatalf("MapListing(disc-brake path + crimp title) = %v, want Brake parts", got)
	}
	stay := MapListing([]string{"MTB Disc Brakes"}, "SRAM Code RSC Disc Brake")
	if !slices.Equal(stay, fromBrakesets()) {
		t.Fatalf("MapListing(disc-brake path + complete title) = %v, want Brakesets", stay)
	}
}

func TestMap_seedTaxonomyMapsBrakeCablePathsToParts(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "packages", "shared", "category_taxonomy.json")
	if err := Load(path); err != nil {
		t.Fatalf("Load(%s): %v", path, err)
	}
	t.Cleanup(func() { SetMappings(nil) })

	got := Map([]string{"Brake Cable Parts"})
	if !slices.Equal(got, wantBrakeParts()) {
		t.Fatalf("Map(seed taxonomy, Brake Cable Parts) = %v, want Brake parts", got)
	}
	adaptor := Map([]string{"Brake Adaptors"})
	if !slices.Equal(adaptor, wantBrakeParts()) {
		t.Fatalf("Map(seed taxonomy, Brake Adaptors) = %v, want Brake parts", adaptor)
	}
}

func TestRefineListing_chainsWheelsAndBrakes(t *testing.T) {
	gotBrake := RefineListing(fromBrakesets(), "BH59 Olive & Barb (Connecting Insert)")
	if !slices.Equal(gotBrake, wantBrakeParts()) {
		t.Fatalf("RefineListing(brakes) = %v, want Brake parts", gotBrake)
	}
	fromTires := []string{"Components", "Wheels/Tires", "Tires"}
	gotWheel := RefineListing(fromTires, "Roval Terra CL Wheelset / Tire Set")
	wantWheels := []string{"Components", "Wheels/Tires", "Complete wheels"}
	if !slices.Equal(gotWheel, wantWheels) {
		t.Fatalf("RefineListing(wheels) = %v, want Complete wheels", gotWheel)
	}
	gotApparel := RefineListing([]string{"Bikes", "Mountain Bikes"}, "Club Ride Apparel Drift Short - Women's Plum Perfect, S")
	if !slices.Equal(gotApparel, []string{"Gear", "Clothing", "Shorts"}) {
		t.Fatalf("RefineListing(apparel) = %v, want Shorts", gotApparel)
	}
}
