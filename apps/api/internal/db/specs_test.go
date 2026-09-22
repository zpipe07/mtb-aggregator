package db

import (
	"strings"
	"testing"
)

func TestEffectiveLLMSpecsExpr_mergesOverrides(t *testing.T) {
	got := effectiveLLMSpecsExpr("l.metadata")
	if !strings.Contains(got, "llm_specs") || !strings.Contains(got, "llm_overrides") || !strings.Contains(got, "||") {
		t.Fatalf("expected specs || overrides merge, got %q", got)
	}
}

func TestAppendMetadataSpecFilterConditions_usesEffectiveSpecs(t *testing.T) {
	var sb strings.Builder
	args := []interface{}{}
	argNum := 1
	appendMetadataSpecFilterConditions(&sb, &args, &argNum, map[string][]string{"coverage": {"Half shell"}}, true)
	sql := sb.String()
	if !strings.Contains(sql, "llm_overrides") {
		t.Fatalf("LLM spec filter should read overrides, got %q", sql)
	}
	if len(args) != 2 || args[0] != "coverage" || args[1] != "Half shell" {
		t.Fatalf("args = %#v", args)
	}
}

func TestFacetsListingGate(t *testing.T) {
	t.Run("empty suffix", func(t *testing.T) {
		got := facetsListingGate("")
		if !strings.Contains(got, "l.is_in_stock = true") {
			t.Fatalf("expected is_in_stock in %q", got)
		}
		if !strings.Contains(got, "l.hidden = false") {
			t.Fatalf("expected hidden = false in %q", got)
		}
	})
	t.Run("appends buildFacetsWhereClause suffix", func(t *testing.T) {
		suffix := " AND l.brand ILIKE $1"
		got := facetsListingGate(suffix)
		if !strings.HasPrefix(strings.TrimSpace(got), "AND l.is_in_stock") {
			t.Fatalf("expected gate first segment: %q", got)
		}
		if !strings.Contains(got, suffix) {
			t.Fatalf("expected suffix appended: %q", got)
		}
		idxStock := strings.Index(got, "is_in_stock")
		idxSuffix := strings.Index(got, suffix)
		if idxSuffix < idxStock {
			t.Fatalf("gate should precede suffix: %q", got)
		}
	})
}
