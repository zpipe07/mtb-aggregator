package metadata

import (
	"encoding/json"
	"testing"
)

func TestInferHelmetCoverage_issueSamples(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		want string
	}{
		{"Limar Air Pro MIPS Road Helmet - Red", CoverageHalfShell},
		{"Super Air R Spherical", CoverageThreeQuarter},
		{"Bell Super Air R Spherical", CoverageThreeQuarter},
		{"Bexley Mips Helmet", CoverageHalfShell},
		{"Giro Manifest MIPS Bike Helmet", CoverageHalfShell},
		{"POC Kortal Race MIPS Bike Helmet", CoverageHalfShell},
		{"Super Air Spherical", CoverageHalfShell},
		{"Bell Super Air Spherical MIPS Bike Helmet", CoverageHalfShell},
		{"Troy Lee Designs A2 MIPS MTB Helmet - Decoy - Black", CoverageHalfShell},
		{"7idp Limited Edition Project 21 Pro Helmet", CoverageHalfShell},
		{"Troy Lee Designs A3 MTB Helmet with MIPS - Digi Camo - Black", CoverageHalfShell},
		{"Leatt AllMtn 4.0 MTB Helmet - Pine - Prior Season", CoverageHalfShell},
		{"Ambush 2", CoverageHalfShell},
		{"Giro Merit Spherical MTB Helmet - Matt White-Black", CoverageHalfShell},
		{"Helmet MTB AllMtn 3.0", CoverageHalfShell},
		{"Dropframe Pro Digi Image Helmet", CoverageHalfShell},
		{"661 Evo AM Helmet - Black-Gray", CoverageHalfShell},
		{"Giro Artex MIPS", CoverageHalfShell},
		{"Giro Tyrant MIPS", CoverageHalfShell},
		{"Bell 4Forty Air MIPS MTB Helmet - Matt Black Camo", CoverageHalfShell},
		{"Bell Falcon XR MIPS MTB Helmet - Matt Tour Green", CoverageHalfShell},
		{"Bell Nomad 2 JR", CoverageHalfShell},
		{"Bell Span", CoverageHalfShell},
		{"Bell Local", CoverageHalfShell},
		{"Bell Racket", CoverageHalfShell},
		{"7 iDP M2 BOA MTB Helmet - Diesel Blue", CoverageHalfShell},
		{"7 iDP M5 MTB Helmet - Black", CoverageHalfShell},
		{"7 iDP X2 MTB Helmet - Matt Gray", CoverageHalfShell},
		{"Helmet MTB Trail 3.0", CoverageHalfShell},
		{"POC Cularis MIPS Bike Helmet", CoverageHalfShell},
		{"Lazer Helmet Impala KC", CoverageHalfShell},
		{"Lazer Revolution MTB Helmet - Black-Green", CoverageHalfShell},
		{"Endura PissPot Helmet", CoverageHalfShell},
		{"Protec Low Pro", CoverageHalfShell},
		{"Pure Cycles Urban-Lite", CoverageHalfShell},
		{"iXS Trigger X Helmet - Mips", CoverageThreeQuarter},
		{"Bell 3Qtr-Air Mips Helmet", CoverageThreeQuarter},
		{"Sanction 2 DLX MIPS", CoverageFullFace},
		{"Bell Sanction 2 DLX MIPS Full Face Helmet - Crux Matte Blue", CoverageFullFace},
		{"Coalition Spherical", CoverageFullFace},
		{"Bell Super 3R/2R Chin Bar - Black", CoverageOther},
		{"Fizik Kudo Aero Helmet (CPSC) + Light", CoverageHalfShell},
		{"Fox Proframe Matte Black Helmet MIPS", CoverageFullFace},
		{"Bell Full-9 Fusion MIPS Bike Helmet", CoverageFullFace},
		{"Bell Full-10 Spherical Helmet", CoverageFullFace},
		{"7 iDP M1 Full Face Helmet - Matte Black", CoverageFullFace},
		{"7 iDP Project 23 Carbon Full Face Helmet - Matt Ice Blue-Black", CoverageFullFace},
		{"Troy Lee Designs D4 Polyacrylite Helmet - Adult", CoverageFullFace},
		{"Giro Switchblade MIPS", CoverageConvertible},
		{"Bell Super DH MIPS", CoverageConvertible},
		{"Bell Super 3R MIPS Helmet", CoverageConvertible},
		{"Bell Full-Air Mips Helmet", CoverageConvertible},
		{"iXS Trigger Full Face Helmet - Non MIPS", CoverageFullFace},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := InferHelmetCoverage(tc.name, "")
			if got != tc.want {
				t.Fatalf("InferHelmetCoverage(%q) = %q, want %q", tc.name, got, tc.want)
			}
		})
	}
}

func TestInferHelmetCoverage_doesNotUseMIPSAlone(t *testing.T) {
	t.Parallel()
	if got := InferHelmetCoverage("Generic MTB MIPS Lid", ""); got != "" {
		t.Fatalf("unexpected inference from MIPS/MTB alone: %q", got)
	}
}

func TestApplyHelmetCoverage_overrideWinsAndCopiesToSpecs(t *testing.T) {
	t.Parallel()
	existing := []byte(`{"llm_overrides":{"coverage":"Half shell"},"llm_specs":{"coverage":"3/4 shell"},"description":"extended rear coverage"}`)
	got := ApplyHelmetCoverage(existing, "Mystery Lid", []string{"Gear", "Helmets"})
	var m map[string]interface{}
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatal(err)
	}
	specs, _ := m["llm_specs"].(map[string]interface{})
	if specs["coverage"] != CoverageHalfShell {
		t.Fatalf("coverage = %v, want Half shell", specs["coverage"])
	}
}

func TestApplyHelmetCoverage_infersWhenNoOverride(t *testing.T) {
	t.Parallel()
	existing := []byte(`{"llm_specs":{"coverage":"Full face"}}`)
	got := ApplyHelmetCoverage(existing, "Bell 4Forty Air MIPS", []string{"Gear", "Helmets"})
	var m map[string]interface{}
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatal(err)
	}
	specs, _ := m["llm_specs"].(map[string]interface{})
	if specs["coverage"] != CoverageHalfShell {
		t.Fatalf("coverage = %v, want Half shell", specs["coverage"])
	}
}

func TestApplyHelmetCoverage_skipsHelmetPartsAndBikes(t *testing.T) {
	t.Parallel()
	existing := []byte(`{"llm_specs":{"coverage":"Full face"}}`)
	if string(ApplyHelmetCoverage(existing, "Bell 4Forty Air MIPS", []string{"Gear", "Helmet parts"})) != string(existing) {
		t.Fatal("Helmet parts should be unchanged")
	}
	if string(ApplyHelmetCoverage(existing, "Bell 4Forty Air MIPS", []string{"Bikes", "Mountain"})) != string(existing) {
		t.Fatal("non-helmet path should be unchanged")
	}
}
