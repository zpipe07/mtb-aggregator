package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const defaultModel = "gpt-4o-mini"
const openAIBaseURL = "https://api.openai.com/v1"

// ErrQuotaExhausted is returned when OpenAI responds with insufficient_quota (billing), not a transient rate limit.
var ErrQuotaExhausted = errors.New("openai quota exhausted")

// ErrRateLimited is returned for HTTP 429 when the error is not insufficient_quota (retry with backoff).
var ErrRateLimited = errors.New("openai rate limited")

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

// Configured reports whether the client can call OpenAI (non-empty API key).
func (c *Client) Configured() bool {
	return c != nil && c.apiKey != ""
}

func getOpenAIMaxRetries() int {
	if s := os.Getenv("OPENAI_MAX_RETRIES"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			return n
		}
	}
	return 3
}

func getOpenAIRetryBaseMS() int {
	if s := os.Getenv("OPENAI_RETRY_BASE_MS"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			return n
		}
	}
	return 500
}

type openAIAPIErrorBody struct {
	Error struct {
		Message string `json:"message"`
		Type    string `json:"type"`
		Code    string `json:"code"`
	} `json:"error"`
}

// parseOpenAIError maps HTTP status and JSON body to typed errors for quota vs rate limit.
func parseOpenAIError(statusCode int, body []byte) error {
	var ob openAIAPIErrorBody
	_ = json.Unmarshal(body, &ob)
	code := ob.Error.Code
	typ := ob.Error.Type
	if code == "insufficient_quota" || typ == "insufficient_quota" {
		return fmt.Errorf("%w: %s", ErrQuotaExhausted, string(body))
	}
	if statusCode == http.StatusTooManyRequests {
		return fmt.Errorf("%w: %s", ErrRateLimited, string(body))
	}
	if statusCode >= 500 && statusCode <= 599 {
		return fmt.Errorf("openai api %d: %s", statusCode, string(body))
	}
	return fmt.Errorf("openai api %d: %s", statusCode, string(body))
}

func isRetriableOpenAIError(statusCode int, err error) bool {
	if errors.Is(err, ErrRateLimited) {
		return true
	}
	return statusCode >= 500 && statusCode <= 599
}

func parseRetryAfterSeconds(s string) (time.Duration, bool) {
	sec, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil || sec < 0 {
		return 0, false
	}
	return time.Duration(sec) * time.Second, true
}

func sleepOpenAIRetry(ctx context.Context, attempt int, baseMS int, retryAfter *time.Duration) {
	var d time.Duration
	if retryAfter != nil && *retryAfter > 0 {
		d = *retryAfter
	} else {
		exp := baseMS * (1 << attempt)
		if exp > 30000 {
			exp = 30000
		}
		d = time.Duration(exp) * time.Millisecond
		d += time.Duration(rand.IntN(baseMS)) * time.Millisecond
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
	case <-t.C:
	}
}

// postChatCompletions POSTs to /chat/completions with retries for transient 429/5xx. Does not retry ErrQuotaExhausted.
func (c *Client) postChatCompletions(ctx context.Context, bodyBytes []byte) ([]byte, error) {
	maxRetries := getOpenAIMaxRetries()
	baseMS := getOpenAIRetryBaseMS()
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(bodyBytes))
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
		req.Header.Set("Content-Type", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			if attempt < maxRetries-1 {
				sleepOpenAIRetry(ctx, attempt, baseMS, nil)
				continue
			}
			return nil, fmt.Errorf("request: %w", err)
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			return body, nil
		}

		apiErr := parseOpenAIError(resp.StatusCode, body)
		lastErr = apiErr

		if errors.Is(apiErr, ErrQuotaExhausted) {
			return nil, apiErr
		}

		var retryAfter *time.Duration
		if ra := resp.Header.Get("Retry-After"); ra != "" {
			if d, ok := parseRetryAfterSeconds(ra); ok {
				retryAfter = &d
			}
		}

		if attempt < maxRetries-1 && isRetriableOpenAIError(resp.StatusCode, apiErr) {
			sleepOpenAIRetry(ctx, attempt, baseMS, retryAfter)
			continue
		}
		return nil, apiErr
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("openai: exhausted retries")
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
// Display metadata (label, sort_order, filterable) controls how the field appears as a filter.
type SchemaField struct {
	Key         string   `json:"key"`
	Type        string   `json:"type"` // "integer", "number", "string", "enum", "multi_enum"
	Description string   `json:"description"`
	Values      []string `json:"values,omitempty"` // for type "enum"
	// Display metadata for filter UI (optional)
	Label       string `json:"label,omitempty"`        // display label; fallback to key title-case
	SortOrder   int    `json:"sort_order,omitempty"`  // higher = shown first
	Filterable  *bool  `json:"filterable,omitempty"`  // default true; false for confidence/metadata fields
	Extractable *bool  `json:"extractable,omitempty"` // default true; false to omit from LLM schema (facets unchanged)
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
	SystemPrompt         string            `json:"system_prompt"`
	ValidCategories      [][]string        `json:"valid_categories"`
	CategoryDescriptions map[string]string `json:"category_descriptions,omitempty"` // keyed by joined path (CategoryPathSeparator)
	ConfidenceThreshold  float64           `json:"confidence_threshold"`
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

	respBody, err := c.postChatCompletions(ctx, bodyBytes)
	if err != nil {
		return nil, err
	}

	var apiResp openAIChatResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
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

// CategoryPathSeparator joins category path segments for the LLM enum and description map keys.
const CategoryPathSeparator = " > "

// Classify runs the LLM to determine the canonical category for a product.
// Returns (nil, nil) when API key is not set.
func (c *Client) Classify(ctx context.Context, config ClassifyConfig, input ClassifyInput) (*ClassifyResult, error) {
	if c.apiKey == "" {
		return nil, nil
	}
	if len(config.ValidCategories) == 0 {
		return nil, fmt.Errorf("valid_categories cannot be empty")
	}

	userContent := c.buildClassifyUserMessage(input, config.ValidCategories, config.CategoryDescriptions)
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

	respBody, err := c.postChatCompletions(ctx, bodyBytes)
	if err != nil {
		return nil, err
	}

	var apiResp openAIChatResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
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
	canonical := strings.Split(catStr, CategoryPathSeparator)
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

func (c *Client) buildClassifyUserMessage(input ClassifyInput, validPaths [][]string, categoryDescriptions map[string]string) string {
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
	if len(categoryDescriptions) > 0 && len(validPaths) > 0 {
		buf.WriteString("\nCategory definitions:\n")
		for _, path := range validPaths {
			if len(path) == 0 {
				continue
			}
			key := strings.Join(path, CategoryPathSeparator)
			if desc, ok := categoryDescriptions[key]; ok && desc != "" {
				buf.WriteString("- " + key + ": " + desc + "\n")
			}
		}
	}
	return buf.String()
}

func (c *Client) buildClassifySchema(validCategories [][]string) map[string]interface{} {
	enumStrs := make([]interface{}, 0, len(validCategories))
	for _, path := range validCategories {
		s := strings.Join(path, CategoryPathSeparator)
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
		if f.Extractable != nil && !*f.Extractable {
			continue
		}
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
		case "multi_enum":
			itemSchema := map[string]interface{}{
				"type": "string",
			}
			if len(f.Values) > 0 {
				enumVals := make([]interface{}, len(f.Values))
				for i, v := range f.Values {
					enumVals[i] = v
				}
				itemSchema["enum"] = enumVals
			}
			prop["type"] = []string{"array", "null"}
			prop["items"] = itemSchema
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
