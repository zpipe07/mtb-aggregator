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
