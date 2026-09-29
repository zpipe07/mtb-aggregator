package taxonomy

import (
	"slices"
	"testing"
)

func fromElectricBikes() []string {
	return []string{"Bikes", "Electric Bikes"}
}

func fromElectricLegacy() []string {
	return []string{"Bikes", "Electric"}
}

func fromEMTB() []string {
	return []string{"Bikes", "Electric Mountain Bikes"}
}

func TestRefineElectric_analogCompleteBikesLeaveElectric(t *testing.T) {
	titles := []string{
		"Transition Patrol Carbon GX AXS 2025",
		"Transition Patrol Carbon GX 2025",
		"Transition Patrol Carbon Eagle 90 2025",
		"Santa Cruz Hightower Carbon C S 2024",
	}
	for _, title := range titles {
		got := RefineElectric(fromElectricBikes(), title)
		if !slices.Equal(got, mountainBikesPath) {
			t.Errorf("RefineElectric(Electric Bikes, %q) = %v, want Mountain Bikes", title, got)
		}
	}
	legacy := RefineElectric(fromElectricLegacy(), "Transition Patrol Carbon GX 2025")
	if !slices.Equal(legacy, mountainBikesPath) {
		t.Fatalf("legacy Electric path = %v, want Mountain Bikes", legacy)
	}
}

func TestRefineElectric_framesetGoesToFrames(t *testing.T) {
	got := RefineElectric(fromElectricBikes(), "Transition Patrol Frameset")
	if !slices.Equal(got, framesPath) {
		t.Fatalf("RefineElectric(frameset) = %v, want Frames", got)
	}
}

func TestRefineElectric_nonBikesLeaveElectricTree(t *testing.T) {
	titles := []string{
		"Shimano Alivio BL-MT200 - Hydraulic Brake Leverout Caliper",
		"Tektro P20.11 Disc Brake Pads - Overall Balanced Resin Compound For 2-Piston Caliper",
		"Park Tool AWS-10 Folding Hex Wrench Set",
		"Topeak Shuttle Gauge",
		"Energizer A23 Batteries 2-Pack",
		"ABUS Granit 640 U-Lock",
		"100% Ridecamp Knee Guards",
		"Bike Yoke Revive 2.0 Dropper",
		"Avid BB7 Road Mechanical disc brake Rear 140mm Grey",
	}
	for _, title := range titles {
		got := RefineElectric(fromElectricBikes(), title)
		if got != nil {
			t.Errorf("RefineElectric(Electric Bikes, %q) = %v, want nil", title, got)
		}
	}
}

func TestRefineElectric_realEBikesStay(t *testing.T) {
	cases := []struct {
		from  []string
		title string
	}{
		{fromEMTB(), "Norco Range A1 VLT MX 2024"},
		{fromEMTB(), "Transition Relay Alloy PNW Eagle 90 - 2026"},
		{fromEMTB(), "Transition Repeater PT GX AXS"},
		{fromElectricBikes(), "Salsa Tributary C Rival GX AXS Transmission SUS Ebike - 29\", Carbon"},
		{fromElectricBikes(), "Specialized Como SL 4.0"},
		{fromElectricBikes(), "Trek Vado 4"},
	}
	for _, tc := range cases {
		got := RefineElectric(tc.from, tc.title)
		if !slices.Equal(got, tc.from) {
			t.Errorf("RefineElectric(%v, %q) = %v, want unchanged", tc.from, tc.title, got)
		}
	}
}

func TestRefineElectric_eBikeAccessoriesLeaveElectric(t *testing.T) {
	titles := []string{
		"Bosch PowerTube Batteries - eBike System 2",
		"Bosch Charger Power Cable - USA Canada BDU2XX BDU3XX",
		"Polygon Greenway Charger",
	}
	for _, title := range titles {
		got := RefineElectric(fromElectricBikes(), title)
		if got != nil {
			t.Errorf("RefineElectric(accessory %q) = %v, want nil", title, got)
		}
	}
}

func TestRefineElectric_emtbShelfStaysWhenTitleLooksAnalog(t *testing.T) {
	titles := []string{
		"Santa Cruz Bullit Carbon MX - 70 Kit - Gloss Black - 2026",
		"Santa Cruz Vala 1 CC X0 AXS RSV Bike 2026",
		"Santa Cruz Vala Carbon MX - GX AXS - Gloss Gray - 2026",
		"Devinci eTroy GX LTD 12s E-Mountain Bike 2023",
	}
	paths := [][]string{
		fromEMTB(),
		{"Bikes", "Electric Mountain Bikes", "Full Power eMTBs"},
		{"Bikes", "Electric Mountain Bikes", "Lightweight eMTBs"},
	}
	for _, title := range titles {
		for _, path := range paths {
			got := RefineElectric(append([]string(nil), path...), title)
			if !slices.Equal(got, path) {
				t.Errorf("RefineElectric(%v, %q) = %v, want eMTB path unchanged", path, title, got)
			}
		}
	}

	// The generic Electric Bikes bucket is still the ZAC-273 trap. A Bullit
	// title with no e-bike token on that path demotes to analog Mountain.
	demoted := RefineElectric(fromElectricBikes(), titles[0])
	if !slices.Equal(demoted, mountainBikesPath) {
		t.Fatalf("RefineElectric(Electric Bikes, Bullit) = %v, want Mountain Bikes", demoted)
	}
}

func TestMapListing_explicitEMTBPathStaysOnEMTB(t *testing.T) {
	SetMappings([]Mapping{
		{Raw: []string{"emtb", "e-mtb", "e-mountain bike", "electric mountain bike", "electric mountain", "e-mountain"}, Canonical: fromEMTB()},
		{Raw: []string{"e-mountain bike", "electric mountain bike", "e-bike", "ebike", "electric bike"}, Canonical: fromElectricBikes()},
		{Raw: []string{"mountain bike", "mtb", "full suspension"}, Canonical: fromMountainBikes()},
	})
	t.Cleanup(func() { SetMappings(nil) })

	cases := []struct {
		path  []string
		title string
	}{
		{[]string{"e-Mountain Completes"}, "Santa Cruz Bullit Carbon MX - 70 Kit - Gloss Black - 2026"},
		{[]string{"Electric Mountain Bikes"}, "Santa Cruz Vala Carbon MX - GX AXS - Gloss Gray - 2026"},
		{[]string{"Bikes", "Electric Bikes", "Electric Mountain Bikes"}, "Santa Cruz Vala 1 CC X0 AXS RSV Bike 2026"},
		{[]string{"e-Mountain Completes"}, "Devinci eTroy GX LTD 12s E-Mountain Bike 2023"},
	}
	for _, tc := range cases {
		got := MapListing(tc.path, tc.title)
		if !slices.Equal(got, fromEMTB()) {
			t.Errorf("MapListing(%v, %q) = %v, want Electric Mountain Bikes", tc.path, tc.title, got)
		}
	}
}

func TestRefineElectric_ignoresTitlesOutsideElectric(t *testing.T) {
	got := RefineElectric(fromMountainBikes(), "Shimano Alivio BL-MT200")
	if !slices.Equal(got, fromMountainBikes()) {
		t.Fatalf("non-electric path should be unchanged, got %v", got)
	}
}

func TestMapListing_rideBicyclesElectricCommuterPath(t *testing.T) {
	SetMappings([]Mapping{
		{Raw: []string{"electric commuter", "electric city bike"}, Canonical: fromElectricBikes()},
		{Raw: []string{"electric bike", "electric bikes", "e-bike", "ebike"}, Canonical: fromElectricBikes()},
		{Raw: []string{"mountain bike", "mtb"}, Canonical: fromMountainBikes()},
		{Raw: []string{"bike", "bikes"}, Canonical: []string{"Bikes"}},
	})
	t.Cleanup(func() { SetMappings(nil) })

	path := []string{"Electric Commuter & Urban Bikes"}
	if got := Map(path); !slices.Equal(got, fromElectricBikes()) {
		t.Fatalf("Map(junk Ride Bicycles type) = %v, want Electric Bikes (pre-refine trap)", got)
	}

	patrol := MapListing(path, "Transition Patrol Carbon GX AXS 2025")
	if !slices.Equal(patrol, mountainBikesPath) {
		t.Fatalf("MapListing(junk type + Patrol) = %v, want Mountain Bikes", patrol)
	}
	pads := MapListing(path, "Tektro P20.11 Disc Brake Pads")
	if pads != nil {
		t.Fatalf("MapListing(junk type + pads) = %v, want nil", pads)
	}
	ebike := MapListing(path, "Specialized Como SL 4.0")
	if !slices.Equal(ebike, fromElectricBikes()) {
		t.Fatalf("MapListing(junk type + Como) = %v, want Electric Bikes", ebike)
	}
}

func TestRefineListing_chainsElectricAfterApparel(t *testing.T) {
	got := RefineListing(fromElectricBikes(), "Transition Patrol Carbon GX AXS 2025")
	if !slices.Equal(got, mountainBikesPath) {
		t.Fatalf("RefineListing(Patrol) = %v, want Mountain Bikes", got)
	}
}
