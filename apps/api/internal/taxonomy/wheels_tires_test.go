package taxonomy

import (
	"path/filepath"
	"slices"
	"testing"
)

func TestRefineWheelsTires_wheelsetAndTireSetBundleGoesToCompleteWheels(t *testing.T) {
	got := RefineWheelsTires(
		[]string{"Components", "Wheels/Tires", "Tires"},
		"Reserve 30 SL MX Boost Wheelset/Vittoria Tire Set",
	)
	want := []string{"Components", "Wheels/Tires", "Complete wheels"}
	if !slices.Equal(got, want) {
		t.Fatalf("bundle title = %v, want %v", got, want)
	}
}

func TestRefineWheelsTires_plainWheelsetAndSingleWheel(t *testing.T) {
	cases := []struct {
		name  string
		title string
	}{
		{"zipp", "Zipp 303 Firecrest Carbon 650b Wheelset"},
		{"reserve", "Reserve 30 SL DT MX 350 Wheelset"},
		{"alloy wheel", "Alloy mountain disc wheel"},
		{"bmx wheelset", "BMX wheelset 20 inch"},
		{"wheel master", "Wheel Master 26in Alloy Mountain Disc Wheel"},
	}
	want := []string{"Components", "Wheels/Tires", "Complete wheels"}
	fromTires := []string{"Components", "Wheels/Tires", "Tires"}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := RefineWheelsTires(fromTires, tc.title)
			if !slices.Equal(got, want) {
				t.Fatalf("%q = %v, want %v", tc.title, got, want)
			}
		})
	}
}

func TestRefineWheelsTires_rimsNotTires(t *testing.T) {
	cases := []string{
		"Alloy bicycle rims",
		"Weinmann Zac19 rim",
		"SE Bikes rim 36h",
		"Mavic Open Pro UST Rim",
	}
	want := []string{"Components", "Wheels/Tires", "Rims"}
	fromTires := []string{"Components", "Wheels/Tires", "Tires"}
	for _, title := range cases {
		got := RefineWheelsTires(fromTires, title)
		if !slices.Equal(got, want) {
			t.Errorf("%q = %v, want %v", title, got, want)
		}
	}
}

func TestRefineWheelsTires_realTiresStayTires(t *testing.T) {
	fromTires := []string{"Components", "Wheels/Tires", "Tires"}
	cases := []string{
		"Maxxis Minion DHF 29x2.5 WT 3C MaxxGrip DH Casing TR Tire",
		"Schwalbe Magic Mary Super Gravity Addix Ultra Soft",
		"Pirelli Scorpion Enduro Rear Specific Tire",
	}
	for _, title := range cases {
		got := RefineWheelsTires(fromTires, title)
		if !slices.Equal(got, fromTires) {
			t.Errorf("tire %q moved to %v", title, got)
		}
	}
}

func TestRefineWheelsTires_excludesHubsSpokesBagsTape(t *testing.T) {
	parent := []string{"Components", "Wheels/Tires", "Hubs"}
	cases := []struct {
		title string
		from  []string
	}{
		{"DT Swiss 350 Hub", parent},
		{"Sapim Race spokes 186mm", []string{"Components", "Wheels/Tires", "Parts"}},
		{"Evoc Wheel Bag", []string{"Components", "Wheels/Tires"}},
		{"Stan's NoTubes Rim Tape", []string{"Components", "Wheels/Tires", "Tubeless"}},
		{"SRAM GX Eagle Freewheel", []string{"Components", "Wheels/Tires"}},
	}
	for _, tc := range cases {
		got := RefineWheelsTires(tc.from, tc.title)
		if !slices.Equal(got, tc.from) {
			t.Errorf("%q = %v, want unchanged %v", tc.title, got, tc.from)
		}
	}
}

func TestRefineWheelsTires_ignoresTitlesOutsideWheelsTires(t *testing.T) {
	bikes := []string{"Bikes", "Mountain Bikes"}
	got := RefineWheelsTires(bikes, "Santa Cruz Hightower Carbon Wheelset Promo")
	if !slices.Equal(got, bikes) {
		t.Fatalf("must not refine outside Wheels/Tires, got %v", got)
	}
}

func TestMapListing_ccTirePathPlusWheelsetTitle(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "packages", "shared", "category_taxonomy.json")
	if err := Load(path); err != nil {
		t.Fatalf("Load(%s): %v", path, err)
	}
	t.Cleanup(func() { SetMappings(nil) })

	got := MapListing(
		[]string{"Cycling", "Bike Components", "Tires"},
		"Reserve 30 SL MX Boost Wheelset/Vittoria Tire Set",
	)
	want := []string{"Components", "Wheels/Tires", "Complete wheels"}
	if !slices.Equal(got, want) {
		t.Fatalf("MapListing(CC tires path + wheelset title) = %v, want %v", got, want)
	}

	tire := MapListing(
		[]string{"Cycling", "Bike Components", "Tires"},
		"Maxxis Minion DHF 29x2.5 WT Tire",
	)
	// Seed maps "tire" to the Wheels/Tires parent, not the Tires leaf.
	if !slices.Equal(tire, []string{"Components", "Wheels/Tires"}) {
		t.Fatalf("MapListing(real tire) = %v, want Wheels/Tires parent", tire)
	}
}
