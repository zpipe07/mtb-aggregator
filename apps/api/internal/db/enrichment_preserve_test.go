package db

import (
	"testing"
)

func TestLLMCategoryFromMetadata(t *testing.T) {
	t.Parallel()
	meta := []byte(`{"llm_category":{"canonical_category":["Components","Brakes"],"confidence":0.9}}`)
	canon, conf, ok := llmCategoryFromMetadata(meta)
	if !ok || conf != 0.9 || len(canon) != 2 || canon[0] != "Components" {
		t.Fatalf("got canon=%v conf=%v ok=%v", canon, conf, ok)
	}
}

func TestLLMCategoryFromMetadata_stringCanonical(t *testing.T) {
	t.Parallel()
	meta := []byte(`{"llm_category":{"canonical_category":"Bikes","confidence":0.85}}`)
	canon, conf, ok := llmCategoryFromMetadata(meta)
	if !ok || conf != 0.85 || len(canon) != 1 || canon[0] != "Bikes" {
		t.Fatalf("got canon=%v conf=%v ok=%v", canon, conf, ok)
	}
}

func TestResolveLLMCategoryPreserveThreshold(t *testing.T) {
	t.Parallel()
	if v := resolveLLMCategoryPreserveThreshold("0.8", nil); v != 0.8 {
		t.Fatalf("env override: got %v", v)
	}
	cfg := &CategoryClassifierConfig{ConfidenceThreshold: 0.7}
	if v := resolveLLMCategoryPreserveThreshold("", cfg); v != 0.7 {
		t.Fatalf("classifier: got %v", v)
	}
	if v := resolveLLMCategoryPreserveThreshold("", nil); v != DefaultLLMCategoryPreserveThreshold {
		t.Fatalf("default: got %v", v)
	}
	if v := resolveLLMCategoryPreserveThreshold("invalid", nil); v != DefaultLLMCategoryPreserveThreshold {
		t.Fatalf("bad env should fall back: got %v", v)
	}
}
