package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const defaultModel = "gpt-4o-mini"
const openAIBaseURL = "https://api.openai.com/v1"

// Client is a lightweight OpenAI client for structured extraction.
// When API key is not set, Extract returns (nil, nil) (graceful degradation).
type Client struct {
	apiKey    string
	model     string
	baseURL   string
	httpClient *http.Client
}

// New creates an LLM client. If apiKey is empty, uses OPENAI_API_KEY env var.
// If still empty, returns a client that will no-op in Extract.
func New(apiKey, model string) *Client {
	if apiKey == "" {
		apiKey = os.Getenv("OPENAI_API_KEY")
	}
	if model == "" {
		model = os.Getenv("OPENAI_MODEL")
	}
	if model == "" {
		model = defaultModel
	}
	baseURL := os.Getenv("OPENAI_BASE_URL")
	if baseURL == "" {
		baseURL = openAIBaseURL
	}
	return &Client{
		apiKey:    apiKey,
		model:     model,
		baseURL:   baseURL,
		httpClient: &http.Client{Timeout: 60 * time.Second},
	}
}

// Profile defines the extraction task: system prompt and schema for outputs.
type Profile struct {
	SystemPrompt     string                 `json:"system_prompt"`
	ExtractionSchema ExtractionSchema       `json:"extraction_schema"`
}

// ExtractionSchema defines fields to extract. Matches DB llm_prompt_profiles.extraction_schema.
type ExtractionSchema struct {
	Fields []SchemaField `json:"fields"`
}

// SchemaField defines a single extractable field.
type SchemaField struct {
	Key         string   `json:"key"`
	Type        string   `json:"type"` // "integer", "number", "string", "enum"
	Description string   `json:"description"`
	Values      []string `json:"values,omitempty"` // for type "enum"
}

// ExtractInput is the product context passed to the LLM.
type ExtractInput struct {
	ProductName  string            `json:"product_name"`
	Description  string            `json:"description"`
	Specs       map[string]string `json:"specs"`
	CategoryPath []string          `json:"category_path"`
}

// ClassifyInput is the product context for category classification (same shape as ExtractInput).
// CategoryPath here is the raw breadcrumb path from the store.
type ClassifyInput struct {
	ProductName   string            `json:"product_name"`
	Description   string            `json:"description"`
	Specs         map[string]string `json:"specs"`
	CategoryPath  []string          `json:"category_path"` // raw breadcrumbs from store
}

// ClassifyConfig configures the category classifier.
type ClassifyConfig struct {
	SystemPrompt        string     `json:"system_prompt"`
	ValidCategories     [][]string `json:"valid_categories"`
	ConfidenceThreshold float64    `json:"confidence_threshold"`
}

// ClassifyResult is the output of category classification.
type ClassifyResult struct {
	CanonicalCategory []string
	Confidence        float64
	Reasoning         string
}

// Extract runs the LLM with the given profile and input, returns extracted fields as a map.
// Returns (nil, nil) when API key is not set (caller should skip LLM step).
func (c *Client) Extract(ctx context.Context, profile Profile, input ExtractInput) (map[string]interface{}, error) {
	if c.apiKey == "" {
		return nil, nil
	}

	userContent := c.buildUserMessage(input)
	schema, err := c.buildOpenAISchema(profile.ExtractionSchema)
	if err != nil {
		return nil, fmt.Errorf("build schema: %w", err)
	}

	reqBody := map[string]interface{}{
		"model": c.model,
		"messages": []map[string]string{
			{"role": "system", "content": profile.SystemPrompt},
			{"role": "user", "content": userContent},
		},
		"response_format": map[string]interface{}{
			"type": "json_schema",
			"json_schema": map[string]interface{}{
				"name":   "extraction_result",
				"strict": true,
				"schema": schema,
			},
		},
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("openai api %d: %s", resp.StatusCode, string(body))
	}

	var apiResp openAIChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if len(apiResp.Choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}
	content := apiResp.Choices[0].Message.Content
	if content == "" {
		return nil, fmt.Errorf("empty content in response")
	}

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, fmt.Errorf("parse extracted json: %w", err)
	}
	return result, nil
}

// categoryPathSeparator is used to stringify/parse category paths for the LLM enum.
const categoryPathSeparator = " > "

// Classify runs the LLM to determine the canonical category for a product.
// Returns (nil, nil) when API key is not set.
func (c *Client) Classify(ctx context.Context, config ClassifyConfig, input ClassifyInput) (*ClassifyResult, error) {
	if c.apiKey == "" {
		return nil, nil
	}
	if len(config.ValidCategories) == 0 {
		return nil, fmt.Errorf("valid_categories cannot be empty")
	}

	userContent := c.buildClassifyUserMessage(input)
	schema := c.buildClassifySchema(config.ValidCategories)

	reqBody := map[string]interface{}{
		"model": c.model,
		"messages": []map[string]string{
			{"role": "system", "content": config.SystemPrompt},
			{"role": "user", "content": userContent},
		},
		"response_format": map[string]interface{}{
			"type": "json_schema",
			"json_schema": map[string]interface{}{
				"name":   "classification_result",
				"strict": true,
				"schema": schema,
			},
		},
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("openai api %d: %s", resp.StatusCode, string(body))
	}

	var apiResp openAIChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if len(apiResp.Choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}
	content := apiResp.Choices[0].Message.Content
	if content == "" {
		return nil, fmt.Errorf("empty content in response")
	}

	var rawResult map[string]interface{}
	if err := json.Unmarshal([]byte(content), &rawResult); err != nil {
		return nil, fmt.Errorf("parse extracted json: %w", err)
	}

	catStr, _ := rawResult["canonical_category"].(string)
	if catStr == "" {
		return nil, fmt.Errorf("LLM returned empty canonical_category")
	}
	canonical := strings.Split(catStr, categoryPathSeparator)
	// Trim spaces from each segment
	for i := range canonical {
		canonical[i] = strings.TrimSpace(canonical[i])
	}

	conf, _ := rawResult["confidence"].(float64)
	reasoning, _ := rawResult["reasoning"].(string)

	return &ClassifyResult{
		CanonicalCategory: canonical,
		Confidence:        conf,
		Reasoning:         reasoning,
	}, nil
}

func (c *Client) buildClassifyUserMessage(input ClassifyInput) string {
	var buf bytes.Buffer
	buf.WriteString("Classify this product into the correct canonical category:\n\n")
	buf.WriteString("Product name: " + input.ProductName + "\n\n")
	if input.Description != "" {
		buf.WriteString("Description:\n" + input.Description + "\n\n")
	}
	if len(input.Specs) > 0 {
		buf.WriteString("Existing specs:\n")
		for k, v := range input.Specs {
			buf.WriteString("  - " + k + ": " + v + "\n")
		}
		buf.WriteString("\n")
	}
	if len(input.CategoryPath) > 0 {
		buf.WriteString("Store breadcrumb path: " + fmt.Sprint(input.CategoryPath) + "\n")
	}
	return buf.String()
}

func (c *Client) buildClassifySchema(validCategories [][]string) map[string]interface{} {
	enumStrs := make([]interface{}, 0, len(validCategories))
	for _, path := range validCategories {
		s := strings.Join(path, categoryPathSeparator)
		if s != "" {
			enumStrs = append(enumStrs, s)
		}
	}
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"canonical_category": map[string]interface{}{
				"type":        "string",
				"description": "The canonical category path from the valid list",
				"enum":        enumStrs,
			},
			"confidence": map[string]interface{}{
				"type":        "number",
				"description": "Confidence 0-1 in the classification",
			},
			"reasoning": map[string]interface{}{
				"type":        "string",
				"description": "Brief reasoning for the classification",
			},
		},
		"required":             []string{"canonical_category", "confidence", "reasoning"},
		"additionalProperties": false,
	}
}

func (c *Client) buildUserMessage(input ExtractInput) string {
	var buf bytes.Buffer
	buf.WriteString("Extract structured data from this product listing:\n\n")
	buf.WriteString("Product name: " + input.ProductName + "\n\n")
	if input.Description != "" {
		buf.WriteString("Description:\n" + input.Description + "\n\n")
	}
	if len(input.Specs) > 0 {
		buf.WriteString("Existing specs:\n")
		for k, v := range input.Specs {
			buf.WriteString("  - " + k + ": " + v + "\n")
		}
		buf.WriteString("\n")
	}
	if len(input.CategoryPath) > 0 {
		buf.WriteString("Category path: " + fmt.Sprint(input.CategoryPath) + "\n")
	}
	return buf.String()
}

// buildOpenAISchema converts our ExtractionSchema to OpenAI JSON schema format.
// OpenAI strict mode requires "required" to include every key in properties.
func (c *Client) buildOpenAISchema(es ExtractionSchema) (map[string]interface{}, error) {
	properties := make(map[string]interface{})
	required := make([]string, 0, len(es.Fields))
	for _, f := range es.Fields {
		prop := make(map[string]interface{})
		prop["description"] = f.Description
		switch f.Type {
		case "integer":
			prop["type"] = []string{"integer", "null"}
		case "number":
			prop["type"] = []string{"number", "null"}
		case "string":
			prop["type"] = []string{"string", "null"}
		case "enum":
			prop["type"] = []string{"string", "null"}
			if len(f.Values) > 0 {
				enumVals := make([]interface{}, len(f.Values)+1)
				for i, v := range f.Values {
					enumVals[i] = v
				}
				enumVals[len(f.Values)] = nil
				prop["enum"] = enumVals
			}
		default:
			prop["type"] = []string{"string", "null"}
		}
		properties[f.Key] = prop
		required = append(required, f.Key)
	}
	return map[string]interface{}{
		"type":                 "object",
		"properties":           properties,
		"required":             required,
		"additionalProperties": false,
	}, nil
}

type openAIChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Refusal *string `json:"refusal,omitempty"`
}

// ListingDataProvider provides listing data for LLM extraction. Implemented by db.DB.
type ListingDataProvider interface {
	GetListingForLLM(ctx context.Context, id int) (*ListingForLLM, error)
	GetLLMPromptProfileForCategory(ctx context.Context, canonicalCategory []string) (*LLMPromptProfileRow, error)
	UpdateListingLLMSpecs(ctx context.Context, id int, llmResult map[string]interface{}) error
}

// ListingForLLM holds data needed for LLM extraction.
type ListingForLLM struct {
	ProductName       string
	Metadata          []byte
	CanonicalCategory []string
}

// LLMPromptProfileRow is the minimal profile data needed for extraction.
type LLMPromptProfileRow struct {
	SystemPrompt    string
	ExtractionSchema json.RawMessage
}
