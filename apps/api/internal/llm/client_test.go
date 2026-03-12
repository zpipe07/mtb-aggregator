package llm

import (
	"context"
	"encoding/json"
	"testing"
)

func TestBuildOpenAISchema(t *testing.T) {
	client := New("", "")
	profile := Profile{
		ExtractionSchema: ExtractionSchema{
			Fields: []SchemaField{
				{Key: "front_travel_mm", Type: "integer", Description: "Front fork travel in mm"},
				{Key: "wheel_size", Type: "enum", Description: "Wheel size", Values: []string{"29", "27.5", "26", "mullet"}},
				{Key: "confidence", Type: "number", Description: "Overall confidence 0-1"},
			},
		},
	}
	schema, err := client.buildOpenAISchema(profile.ExtractionSchema)
	if err != nil {
		t.Fatalf("buildOpenAISchema: %v", err)
	}
	schemaJSON, _ := json.MarshalIndent(schema, "", "  ")
	t.Logf("schema: %s", schemaJSON)

	// Basic structure checks
	if schema["type"] != "object" {
		t.Errorf("expected type object, got %v", schema["type"])
	}
	props, ok := schema["properties"].(map[string]interface{})
	if !ok {
		t.Fatalf("properties not a map")
	}
	if len(props) != 3 {
		t.Errorf("expected 3 properties, got %d", len(props))
	}
	// Enum should include null
	wheelProp, ok := props["wheel_size"].(map[string]interface{})
	if !ok {
		t.Fatal("wheel_size property not a map")
	}
	enum, ok := wheelProp["enum"].([]interface{})
	if !ok || len(enum) != 5 {
		t.Errorf("wheel_size enum should have 5 values (4 + null), got %v", enum)
	}
}

func TestExtractNoAPIKey(t *testing.T) {
	client := New("", "")
	result, err := client.Extract(context.Background(), Profile{}, ExtractInput{ProductName: "test"})
	if err != nil {
		t.Fatalf("expected no error when api key empty: %v", err)
	}
	if result != nil {
		t.Errorf("expected nil result when api key empty, got %v", result)
	}
}

func TestBuildUserMessage(t *testing.T) {
	client := New("sk-fake", "")
	input := ExtractInput{
		ProductName:  "Yeti SB140",
		Description: "150mm fork, 140mm rear travel",
		Specs:       map[string]string{"Frame": "Carbon"},
		CategoryPath: []string{"Bikes", "Mountain"},
	}
	msg := client.buildUserMessage(input)
	if msg == "" {
		t.Fatal("expected non-empty message")
	}
	if !contains(msg, "Yeti SB140") || !contains(msg, "150mm fork") || !contains(msg, "Carbon") {
		t.Errorf("message should contain product details: %s", msg)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > len(sub) && (s[:len(sub)] == sub || s[len(s)-len(sub):] == sub || findSubstring(s, sub)))
}

func findSubstring(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
