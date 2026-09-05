package taxonomy

import (
	"path/filepath"
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

// Production-like seed order for ZAC-245: generic "bike"/"gravel"/"gear" beat
// "wheels" on a joined breadcrumb because they appear earlier (higher priority).
func zac245JoinedPathTrapMappings() []Mapping {
	return []Mapping{
		{Raw: []string{"bike", "bikes", "bicycle"}, Canonical: []string{"Bikes"}},
		{Raw: []string{"gravel"}, Canonical: []string{"Bikes", "Gravel"}},
		{Raw: []string{"wheel", "wheels", "tire", "tyre", "rim"}, Canonical: []string{"Components", "Wheels/Tires"}},
		{Raw: []string{"component", "parts", "part"}, Canonical: []string{"Components"}},
		{Raw: []string{"gear", "equipment"}, Canonical: []string{"Gear"}},
	}
}

func zac245SpecializedWheelPath() []string {
	return []string{
		"Cycling Gear",
		"Bike Parts",
		"Roval Wheels and Components",
		"Bike Wheels",
		"Gravel Bike Wheels and Wheelsets",
	}
}

func TestMap_legacyBikeKeywordOnWheelLeafStillMapsToBikes(t *testing.T) {
	SetMappings(zac245JoinedPathTrapMappings())
	t.Cleanup(func() { SetMappings(nil) })

	got := Map(zac245SpecializedWheelPath())
	if !slices.Equal(got, []string{"Bikes"}) {
		t.Fatalf("without complete-wheels keywords, leaf still hits generic bike: got %v", got)
	}
}

func TestMap_mostSpecificSegmentWinsOverHigherPriorityAncestor(t *testing.T) {
	SetMappings([]Mapping{
		{Raw: []string{"gear", "equipment"}, Canonical: []string{"Gear"}},
		{Raw: []string{"wheelset", "wheelsets", "wheels"}, Canonical: []string{"Components", "Wheels/Tires", "Complete wheels"}},
	})
	t.Cleanup(func() { SetMappings(nil) })

	got := Map(zac245SpecializedWheelPath())
	want := []string{"Components", "Wheels/Tires", "Complete wheels"}
	if !slices.Equal(got, want) {
		t.Fatalf("Map(Specialized wheel breadcrumb) = %v, want %v (leaf should beat Cycling Gear)", got, want)
	}
}

func TestMap_completeWheelsKeywordsBeatBikeOnLeaf(t *testing.T) {
	SetMappings([]Mapping{
		{Raw: []string{
			"wheelset", "wheelsets", "complete wheel", "complete wheels",
			"bike wheels", "bike wheel",
		}, Canonical: []string{"Components", "Wheels/Tires", "Complete wheels"}},
		{Raw: []string{"bike", "bikes", "bicycle"}, Canonical: []string{"Bikes"}},
		{Raw: []string{"gravel"}, Canonical: []string{"Bikes", "Gravel"}},
		{Raw: []string{"wheel", "wheels", "tire", "tyre", "rim"}, Canonical: []string{"Components", "Wheels/Tires"}},
		{Raw: []string{"gear", "equipment"}, Canonical: []string{"Gear"}},
	})
	t.Cleanup(func() { SetMappings(nil) })

	got := Map(zac245SpecializedWheelPath())
	want := []string{"Components", "Wheels/Tires", "Complete wheels"}
	if !slices.Equal(got, want) {
		t.Fatalf("Map(Specialized wheel breadcrumb) = %v, want %v", got, want)
	}
}

func TestMap_unmappedLeafFallsBackToParentSegment(t *testing.T) {
	SetMappings([]Mapping{
		{Raw: []string{"trail bike", "trail mountain", "trail riding"}, Canonical: []string{"Bikes", "Mountain", "Trail"}},
		{Raw: []string{"mountain bike", "mtb", "mountain bikes"}, Canonical: []string{"Bikes", "Mountain"}},
		{Raw: []string{"bike", "bikes", "bicycle"}, Canonical: []string{"Bikes"}},
	})
	t.Cleanup(func() { SetMappings(nil) })

	got := Map([]string{"Bikes", "Mountain Bikes", "Trail Bikes", "Stumpjumper"})
	want := []string{"Bikes", "Mountain", "Trail"}
	if !slices.Equal(got, want) {
		t.Fatalf("Map(Specialized bike breadcrumb with product leaf) = %v, want %v", got, want)
	}
}

func TestMap_seedTaxonomyMapsSpecializedWheelPathToCompleteWheels(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "packages", "shared", "category_taxonomy.json")
	if err := Load(path); err != nil {
		t.Fatalf("Load(%s): %v", path, err)
	}
	t.Cleanup(func() { SetMappings(nil) })

	got := Map(zac245SpecializedWheelPath())
	want := []string{"Components", "Wheels/Tires", "Complete wheels"}
	if !slices.Equal(got, want) {
		t.Fatalf("Map(seed taxonomy, Specialized wheel breadcrumb) = %v, want %v", got, want)
	}
}

func TestMap_singleSegmentUnchanged(t *testing.T) {
	SetMappings([]Mapping{
		{Raw: []string{"helmet", "helmets"}, Canonical: []string{"Gear", "Helmets"}},
		{Raw: []string{"gear", "equipment"}, Canonical: []string{"Gear"}},
	})
	t.Cleanup(func() { SetMappings(nil) })

	got := Map([]string{"Cycling Gear"})
	if !slices.Equal(got, []string{"Gear"}) {
		t.Fatalf("Map([Cycling Gear]) = %v, want [Gear]", got)
	}
}

// ZAC-246: specific helmet-part phrases must beat bare "helmet" / "helmets"
// so store paths like "Helmet Parts" and "Helmet Accessories" do not land
// on complete Helmets (cheap pads/visors sort to the top of /deals/c/gear/helmets).
func helmetVsPartsMappings() []Mapping {
	return []Mapping{
		{Raw: []string{
			"helmet parts", "helmet part", "helmet accessories", "helmet accessory",
			"helmet visor", "helmet visors", "helmet liner", "helmet liners",
			"helmet pad", "helmet pads", "helmet padding",
			"replacement visor", "replacement visors", "replacement liner", "replacement liners",
			"cheek pad", "cheek pads", "cheekpad", "cheekpads",
		}, Canonical: []string{"Gear", "Helmet parts"}},
		{Raw: []string{"helmet", "helmets"}, Canonical: []string{"Gear", "Helmets"}},
		{Raw: []string{"gear", "equipment"}, Canonical: []string{"Gear"}},
	}
}

func TestMap_legacyBareHelmetKeywordWouldTrapHelmetParts(t *testing.T) {
	SetMappings([]Mapping{
		{Raw: []string{"helmet", "helmets"}, Canonical: []string{"Gear", "Helmets"}},
		{Raw: []string{"gear", "equipment"}, Canonical: []string{"Gear"}},
	})
	t.Cleanup(func() { SetMappings(nil) })

	got := Map([]string{"Helmet Parts"})
	if !slices.Equal(got, []string{"Gear", "Helmets"}) {
		t.Fatalf("legacy bare helmet mapping should still demonstrate the ZAC-246 trap, got %v", got)
	}
}

func TestMap_helmetPartsPathsAreNotHelmets(t *testing.T) {
	SetMappings(helmetVsPartsMappings())
	t.Cleanup(func() { SetMappings(nil) })

	cases := []struct {
		raw  []string
		want []string
	}{
		{[]string{"Helmet Parts"}, []string{"Gear", "Helmet parts"}},
		{[]string{"Apparel", "Helmets", "Helmet Accessories"}, []string{"Gear", "Helmet parts"}},
		{[]string{"Helmet Accessories"}, []string{"Gear", "Helmet parts"}},
		{[]string{"Cycling Gear", "Bike Accessories", "Bike Helmets", "Mountain Bike Helmets"}, []string{"Gear", "Helmets"}},
		{[]string{"MTB Helmets"}, []string{"Gear", "Helmets"}},
		{[]string{"Cycling", "Helmets"}, []string{"Gear", "Helmets"}},
	}
	for _, tc := range cases {
		got := Map(tc.raw)
		if !slices.Equal(got, tc.want) {
			t.Errorf("Map(%v) = %v, want %v", tc.raw, got, tc.want)
		}
	}
}

func TestMap_seedTaxonomyMapsHelmetPartsPath(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "packages", "shared", "category_taxonomy.json")
	if err := Load(path); err != nil {
		t.Fatalf("Load(%s): %v", path, err)
	}
	t.Cleanup(func() { SetMappings(nil) })

	got := Map([]string{"Helmet Parts"})
	want := []string{"Gear", "Helmet parts"}
	if !slices.Equal(got, want) {
		t.Fatalf("Map(seed taxonomy, Helmet Parts) = %v, want %v", got, want)
	}

	gotHelmet := Map([]string{"Cycling", "Helmets"})
	wantHelmet := []string{"Gear", "Helmets"}
	if !slices.Equal(gotHelmet, wantHelmet) {
		t.Fatalf("Map(seed taxonomy, Cycling > Helmets) = %v, want %v", gotHelmet, wantHelmet)
	}
}

// ZAC-264: Competitive Cyclist apparel breadcrumbs include "mountain bike"
// / "road bike" (e.g. "Women's Mountain Bike Bottoms"). Unmapped leaves
// ("Women's Skirts", "Men's Liners") fall back to that parent and hit
// generic bike keywords unless more specific apparel phrases run first.
func ccApparelVsBikeMappings() []Mapping {
	return []Mapping{
		{Raw: []string{
			"mountain bike clothing", "mtb clothing", "bike clothing",
			"mountain bike bottoms", "mtb bottoms", "bike bottoms",
			"mountain bike tops", "bike tops",
			"road bike clothing", "road bike tops", "road bike bottoms",
			"triathlon clothing",
		}, Canonical: []string{"Gear", "Clothing"}},
		{Raw: []string{
			"skirt", "skirts", "skort", "skorts",
			"skinsuit", "skinsuits",
			"cycling tops", "casual cycling",
			"tri tops", "tri top",
			"cycling hat", "bike hat", "cycling cap",
		}, Canonical: []string{"Gear", "Clothing"}},
		{Raw: []string{
			"shorts", "bib shorts", "cycling shorts", "mtb shorts",
			"liner shorts", "liner short", "men's liners", "women's liners",
		}, Canonical: []string{"Gear", "Clothing", "Shorts"}},
		{Raw: []string{"clothing"}, Canonical: []string{"Gear", "Clothing"}},
		{Raw: []string{"hardtail"}, Canonical: []string{"Bikes", "Mountain Bikes"}},
		{Raw: []string{"mountain bike", "mtb", "mountain bikes"}, Canonical: []string{"Bikes", "Mountain Bikes"}},
		{Raw: []string{"road bike", "road"}, Canonical: []string{"Bikes", "Road Bikes"}},
		{Raw: []string{"bike", "bikes", "bicycle"}, Canonical: []string{"Bikes"}},
	}
}

func TestMap_legacyMountainBikeKeywordWouldTrapCCApparel(t *testing.T) {
	SetMappings([]Mapping{
		{Raw: []string{"shorts", "liner shorts"}, Canonical: []string{"Gear", "Clothing", "Shorts"}},
		{Raw: []string{"clothing"}, Canonical: []string{"Gear", "Clothing"}},
		{Raw: []string{"mountain bike", "mtb", "mountain bikes"}, Canonical: []string{"Bikes", "Mountain Bikes"}},
		{Raw: []string{"bike", "bikes"}, Canonical: []string{"Bikes"}},
	})
	t.Cleanup(func() { SetMappings(nil) })

	got := Map([]string{
		"Women's Clothing",
		"Women's Mountain Bike Clothing",
		"Women's Mountain Bike Bottoms",
		"Women's Skirts",
	})
	if !slices.Equal(got, []string{"Bikes", "Mountain Bikes"}) {
		t.Fatalf("legacy mountain-bike mapping should still demonstrate the ZAC-264 trap, got %v", got)
	}
}

func TestMap_ccApparelPathsAreNotBikes(t *testing.T) {
	SetMappings(ccApparelVsBikeMappings())
	t.Cleanup(func() { SetMappings(nil) })

	cases := []struct {
		raw  []string
		want []string
	}{
		{[]string{"Women's Clothing", "Women's Mountain Bike Clothing", "Women's Mountain Bike Bottoms", "Women's Skirts"}, []string{"Gear", "Clothing"}},
		{[]string{"Men's Clothing", "Men's Mountain Bike Clothing", "Men's Mountain Bike Bottoms", "Men's Liners"}, []string{"Gear", "Clothing", "Shorts"}},
		{[]string{"Women's Clothing", "Women's Mountain Bike Clothing", "Women's Mountain Bike Bottoms", "Women's Liners"}, []string{"Gear", "Clothing", "Shorts"}},
		{[]string{"Men's Clothing", "Men's Road Bike Clothing", "Men's Road Bike Tops", "Men's Casual Cycling Tops"}, []string{"Gear", "Clothing"}},
		{[]string{"Men's Clothing", "Men's Road Bike Clothing", "Men's Road Bike Tops", "Men's Skinsuits"}, []string{"Gear", "Clothing"}},
		{[]string{"Men's Clothing", "Men's Triathlon Clothing", "Men's Tri Bike", "Men's Tri Tops"}, []string{"Gear", "Clothing"}},
		{[]string{"Men's Clothing", "Men's Mountain Bike Clothing", "Men's Mountain Bike Accessories", "Men's Bike Hats", "Cycling Hats & Caps"}, []string{"Gear", "Clothing"}},
		{[]string{"Hardtail Mountain Bike"}, []string{"Bikes", "Mountain Bikes"}},
		{[]string{"Bikes", "Mountain Bikes", "Pre-Configured Mountain Bikes"}, []string{"Bikes", "Mountain Bikes"}},
	}
	for _, tc := range cases {
		got := Map(tc.raw)
		if !slices.Equal(got, tc.want) {
			t.Errorf("Map(%v) = %v, want %v", tc.raw, got, tc.want)
		}
	}
}

func TestMap_seedTaxonomyMapsCCApparelPaths(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "packages", "shared", "category_taxonomy.json")
	if err := Load(path); err != nil {
		t.Fatalf("Load(%s): %v", path, err)
	}
	t.Cleanup(func() { SetMappings(nil) })

	gotSkirt := Map([]string{
		"Women's Clothing",
		"Women's Mountain Bike Clothing",
		"Women's Mountain Bike Bottoms",
		"Women's Skirts",
	})
	if !slices.Equal(gotSkirt, []string{"Gear", "Clothing"}) {
		t.Fatalf("Map(seed taxonomy, CC skirt path) = %v, want [Gear Clothing]", gotSkirt)
	}

	gotLiner := Map([]string{
		"Men's Clothing",
		"Men's Mountain Bike Clothing",
		"Men's Mountain Bike Bottoms",
		"Men's Liners",
	})
	if !slices.Equal(gotLiner, []string{"Gear", "Clothing", "Shorts"}) {
		t.Fatalf("Map(seed taxonomy, CC liner path) = %v, want [Gear Clothing Shorts]", gotLiner)
	}

	gotBike := Map([]string{"Bikes", "Mountain Bikes", "Pre-Configured Mountain Bikes"})
	if !slices.Equal(gotBike, []string{"Bikes", "Mountain"}) {
		t.Fatalf("Map(seed taxonomy, CC complete bike path) = %v, want [Bikes Mountain]", gotBike)
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
