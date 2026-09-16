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
