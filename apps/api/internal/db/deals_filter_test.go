package db

import (
	"context"
	"strings"
	"testing"
)

func TestDealsFilterSQLExcludeHomeDemoted(t *testing.T) {
	frag, args, nextArg, err := (&DB{}).dealsFilterSQL(context.Background(), GetDealsParams{ExcludeHomeDemoted: true}, 1)
	if err != nil {
		t.Fatalf("dealsFilterSQL: %v", err)
	}
	if !strings.Contains(frag, "l.home_demoted = false") {
		t.Fatalf("expected home_demoted filter in %q", frag)
	}
	if len(args) != 0 {
		t.Fatalf("expected no args, got %v", args)
	}
	if nextArg != 1 {
		t.Fatalf("nextArg = %d, want 1", nextArg)
	}
}
