package taxonomy

import (
	"slices"
	"testing"
)

// Production-like priority order: first rule wins (priority DESC).
func lightsVsBikeMappings() []Mapping {
	return []Mapping{
		{Raw: []string{"lightweight emtb", "light emtb"}, Canonical: []string{"Bikes", "Electric Mountain Bikes", "Lightweight eMTBs"}},
		{
			Raw: []string{
				"lights", "lighting", "bike light", "bike lights",
				"headlight", "headlights", "taillight", "taillights",
				"tail light", "front light", "rear light", "helmet light",
				"lamp", "lamps",
			},
			Canonical: []string{"Accessories", "Lights"},
		},
		{Raw: []string{"hardtail"}, Canonical: []string{"Bikes", "Mountain Bikes"}},
		{Raw: []string{"mountain bike", "mtb"}, Canonical: []string{"Bikes", "Mountain Bikes"}},
		{Raw: []string{"bike", "bikes", "bicycle"}, Canonical: []string{"Bikes"}},
	}
}

func TestMap_bikesOnlineLightweightHeadlineDoesNotBecomeLights(t *testing.T) {
	SetMappings(lightsVsBikeMappings())
	t.Cleanup(func() { SetMappings(nil) })

	got := Map([]string{
		"Hardtail Mountain Bikes Conquer Every Trail with a Lightweight, Efficient Hard Tail Mountain Bike",
	})
	want := []string{"Bikes", "Mountain Bikes"}
	if !slices.Equal(got, want) {
		t.Fatalf("Map(Bikes Online hardtail headline) = %v, want %v", got, want)
	}
}

func TestMap_legacyBareLightKeywordWouldTrapLightweight(t *testing.T) {
	SetMappings([]Mapping{
		{Raw: []string{"light", "lights", "lamp"}, Canonical: []string{"Accessories", "Lights"}},
		{Raw: []string{"hardtail"}, Canonical: []string{"Bikes", "Mountain Bikes"}},
		{Raw: []string{"bike", "bikes"}, Canonical: []string{"Bikes"}},
	})
	t.Cleanup(func() { SetMappings(nil) })

	got := Map([]string{
		"Hardtail Mountain Bikes Conquer Every Trail with a Lightweight, Efficient Hard Tail Mountain Bike",
	})
	if !slices.Equal(got, []string{"Accessories", "Lights"}) {
		t.Fatalf("legacy bare light mapping should still demonstrate the ZAC-234 trap, got %v", got)
	}
}

func TestMap_actualLightPathsStillMatch(t *testing.T) {
	SetMappings(lightsVsBikeMappings())
	t.Cleanup(func() { SetMappings(nil) })

	cases := []struct {
		raw  []string
		want []string
	}{
		{[]string{"Accessories", "Lights"}, []string{"Accessories", "Lights"}},
		{[]string{"Bike Lights"}, []string{"Accessories", "Lights"}},
		{[]string{"Headlights"}, []string{"Accessories", "Lights"}},
		{[]string{"Bikes"}, []string{"Bikes"}},
	}
	for _, tc := range cases {
		got := Map(tc.raw)
		if !slices.Equal(got, tc.want) {
			t.Errorf("Map(%v) = %v, want %v", tc.raw, got, tc.want)
		}
	}
}

// Production-like priority order after ZAC-238: fork/shock leaves beat
// complete-bike "full/front suspension" phrases, which beat bare "suspension".
func suspensionVsBikeMappings() []Mapping {
	return []Mapping{
		{Raw: []string{"xc full suspension"}, Canonical: []string{"Bikes", "Mountain Bikes", "XC Bikes"}},
		{Raw: []string{"trail bike", "trail mountain"}, Canonical: []string{"Bikes", "Mountain Bikes", "Trail Bikes"}},
		{Raw: []string{"enduro bike", "enduro"}, Canonical: []string{"Bikes", "Mountain Bikes", "Enduro Bikes"}},
		{Raw: []string{"fork parts", "shock kit", "fork kit"}, Canonical: []string{"Components", "Suspension", "Parts"}},
		{Raw: []string{"shock", "shocks"}, Canonical: []string{"Components", "Suspension", "Shocks"}},
		{Raw: []string{"fork", "forks"}, Canonical: []string{"Components", "Suspension", "Forks"}},
		{Raw: []string{"full suspension frames", "full suspension frame", "full-suspension frames", "full-suspension frame"}, Canonical: []string{"Bikes", "Frames"}},
		{Raw: []string{"full suspension", "full-suspension", "front suspension", "front-suspension"}, Canonical: []string{"Bikes", "Mountain Bikes"}},
		{Raw: []string{"suspension", "fork", "shock", "damper"}, Canonical: []string{"Components", "Suspension"}},
		{Raw: []string{"mountain bike", "mtb", "mountain bikes", "full suspension", "hardtail"}, Canonical: []string{"Bikes", "Mountain Bikes"}},
	}
}

func TestMap_legacyBareSuspensionKeywordWouldTrapFullSuspension(t *testing.T) {
	SetMappings([]Mapping{
		{Raw: []string{"suspension", "fork", "shock", "damper"}, Canonical: []string{"Components", "Suspension"}},
		{Raw: []string{"mountain bike", "mtb", "full suspension", "hardtail"}, Canonical: []string{"Bikes", "Mountain Bikes"}},
	})
	t.Cleanup(func() { SetMappings(nil) })

	got := Map([]string{"Full Suspension"})
	if !slices.Equal(got, []string{"Components", "Suspension"}) {
		t.Fatalf("legacy bare suspension mapping should still demonstrate the ZAC-238 trap, got %v", got)
	}
}

func TestMap_fullAndFrontSuspensionStorePathsAreBikes(t *testing.T) {
	SetMappings(suspensionVsBikeMappings())
	t.Cleanup(func() { SetMappings(nil) })

	cases := []struct {
		raw  []string
		want []string
	}{
		{[]string{"Full Suspension"}, []string{"Bikes", "Mountain Bikes"}},
		{[]string{"Bicycles - Mountain - Front Suspension"}, []string{"Bikes", "Mountain Bikes"}},
		{[]string{"Bicycles - Mountain - Full Suspension"}, []string{"Bikes", "Mountain Bikes"}},
		{[]string{"Mountain: Full Suspension"}, []string{"Bikes", "Mountain Bikes"}},
		{[]string{"Full Suspension Mountain Bike"}, []string{"Bikes", "Mountain Bikes"}},
		{[]string{"Bikes", "Mountain Bikes", "Full Suspension Mountain Bikes"}, []string{"Bikes", "Mountain Bikes"}},
	}
	for _, tc := range cases {
		got := Map(tc.raw)
		if !slices.Equal(got, tc.want) {
			t.Errorf("Map(%v) = %v, want %v", tc.raw, got, tc.want)
		}
	}
}

func TestMap_suspensionPartsAndFramesStillMatch(t *testing.T) {
	SetMappings(suspensionVsBikeMappings())
	t.Cleanup(func() { SetMappings(nil) })

	cases := []struct {
		raw  []string
		want []string
	}{
		{[]string{"Components", "Suspension"}, []string{"Components", "Suspension"}},
		{[]string{"Suspension Forks"}, []string{"Components", "Suspension", "Forks"}},
		{[]string{"Front Suspension Forks"}, []string{"Components", "Suspension", "Forks"}},
		{[]string{"Components", "Forks & Suspension", "Rear Shocks"}, []string{"Components", "Suspension", "Shocks"}},
		{[]string{"Full Suspension Frames"}, []string{"Bikes", "Frames"}},
		{[]string{"Bikes", "Mountain Bikes", "Pre-Configured Mountain Bikes", "XC Full Suspension"}, []string{"Bikes", "Mountain Bikes", "XC Bikes"}},
		{[]string{"Fork kit"}, []string{"Components", "Suspension", "Parts"}},
	}
	for _, tc := range cases {
		got := Map(tc.raw)
		if !slices.Equal(got, tc.want) {
			t.Errorf("Map(%v) = %v, want %v", tc.raw, got, tc.want)
		}
	}
}
