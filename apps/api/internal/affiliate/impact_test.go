package affiliate

import (
	"os"
	"testing"
)

func TestCompetitiveCyclistOutboundURL_UnsetEnv(t *testing.T) {
	_ = os.Unsetenv(EnvImpactDeepLinkCompetitiveCyclist)
	got, ok := CompetitiveCyclistOutboundURL("https://www.competitivecyclist.com/example")
	if ok {
		t.Fatalf("expected unset env to disable link: ok=%v got=%q", ok, got)
	}
}

func TestCompetitiveCyclistOutboundURL_PrefixConcat(t *testing.T) {
	const prefix = "https://track.example/track?dest="
	const dest = "https://www.competitivecyclist.com/p/foo"
	t.Setenv(EnvImpactDeepLinkCompetitiveCyclist, prefix)
	got, ok := CompetitiveCyclistOutboundURL(dest)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if got != prefix+"https%3A%2F%2Fwww.competitivecyclist.com%2Fp%2Ffoo" {
		t.Fatalf("unexpected got %q", got)
	}
}

func TestCompetitiveCyclistOutboundURL_Placeholder(t *testing.T) {
	tpl := "https://goto.test/c/x?u={{URL}}"
	const dest = "https://example.com?q=1"
	t.Setenv(EnvImpactDeepLinkCompetitiveCyclist, tpl)
	got, ok := CompetitiveCyclistOutboundURL(dest)
	if !ok {
		t.Fatal("expected ok=true")
	}
	want := "https://goto.test/c/x?u=" + "https%3A%2F%2Fexample.com%3Fq%3D1"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
