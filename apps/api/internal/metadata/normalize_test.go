package metadata

import (
	"encoding/json"
	"testing"
)

func TestMergeLLMSpecs_storesConfidenceAndReasoningSeparately(t *testing.T) {
	t.Parallel()
	existing := []byte(`{"llm_specs":{"wheel_size":"29"}}`)
	llmResult := map[string]interface{}{
		"wheel_size": "27.5",
		"confidence": 0.92,
		"reasoning":  "Title says 27.5; scraped specs ambiguous.",
	}
	merged := MergeLLMSpecs(existing, llmResult)

	var meta map[string]interface{}
	if err := json.Unmarshal(merged, &meta); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if meta["llm_confidence"] != 0.92 {
		t.Fatalf("llm_confidence = %v, want 0.92", meta["llm_confidence"])
	}
	if meta["llm_specs_reasoning"] != "Title says 27.5; scraped specs ambiguous." {
		t.Fatalf("llm_specs_reasoning = %v", meta["llm_specs_reasoning"])
	}
	llmSpecs, ok := meta["llm_specs"].(map[string]interface{})
	if !ok {
		t.Fatal("llm_specs missing")
	}
	if _, hasConfidence := llmSpecs["confidence"]; hasConfidence {
		t.Fatal("confidence should not be stored in llm_specs")
	}
	if _, hasReasoning := llmSpecs["reasoning"]; hasReasoning {
		t.Fatal("reasoning should not be stored in llm_specs")
	}
	if llmSpecs["wheel_size"] != "27.5" {
		t.Fatalf("wheel_size = %v, want 27.5", llmSpecs["wheel_size"])
	}
}
