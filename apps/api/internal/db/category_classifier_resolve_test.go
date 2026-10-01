package db

import (
	"errors"
	"testing"
)

func TestResolvedCategoryID_requiresATreeMatch(t *testing.T) {
	t.Parallel()
	id := 83
	got, err := resolvedCategoryID([]string{"Bikes", "Mountain Bikes", "Trail"}, &id, nil)
	if err != nil || got != 83 {
		t.Fatalf("resolved = (%d, %v), want 83", got, err)
	}
	if _, err := resolvedCategoryID([]string{"Components", "Frames"}, nil, nil); !errors.Is(err, ErrUnresolvedCategoryPath) {
		t.Fatalf("unresolved path err = %v", err)
	}
	if _, err := resolvedCategoryID(nil, nil, nil); !errors.Is(err, ErrUnresolvedCategoryPath) {
		t.Fatalf("empty path err = %v", err)
	}
	boom := errors.New("db down")
	if _, err := resolvedCategoryID([]string{"Bikes"}, &id, boom); !errors.Is(err, boom) {
		t.Fatalf("resolve err = %v, want %v", err, boom)
	}
}
