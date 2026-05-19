package impact

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

func parseCatalogInfos(body []byte) ([]CatalogInfo, error) {
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return nil, nil
	}

	if body[0] == '[' {
		var tryArray []map[string]interface{}
		if err := json.Unmarshal(body, &tryArray); err != nil {
			return nil, fmt.Errorf("decode catalog list: %w", err)
		}
		return mapSliceCatalogs(tryArray)
	}

	var wrap map[string]interface{}
	if err := json.Unmarshal(body, &wrap); err != nil {
		return nil, fmt.Errorf("decode catalog response: %w", err)
	}
	for _, key := range []string{"Catalogs", "Data", "catalogs"} {
		raw, ok := wrap[key]
		if !ok {
			continue
		}
		b, err := json.Marshal(raw)
		if err != nil {
			continue
		}
		var arr []map[string]interface{}
		if err := json.Unmarshal(b, &arr); err != nil {
			continue
		}
		return mapSliceCatalogs(arr)
	}
	return nil, fmt.Errorf("unrecognized Catalogs JSON shape")
}

func mapSliceCatalogs(arr []map[string]interface{}) ([]CatalogInfo, error) {
	out := make([]CatalogInfo, 0, len(arr))
	for _, m := range arr {
		id := firstStringFromMap(m,
			"Id", "ID", "CatalogId", "CatalogID", "catalogId")
		name := firstStringFromMap(m, "Name", "CatalogName", "Title")
		adv := firstStringFromMap(m, "AdvertiserName", "Advertiser", "ProgramName", "BrandName")
		if id == "" {
			continue
		}
		out = append(out, CatalogInfo{ID: id, Name: name, AdvertiserName: adv})
	}
	return out, nil
}

// parseItemSearchResponse extracts catalog item objects from known wrapper shapes.
func parseItemSearchResponse(body []byte) []map[string]interface{} {
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return nil
	}

	if body[0] == '[' {
		var arr []map[string]interface{}
		if err := json.Unmarshal(body, &arr); err != nil {
			return nil
		}
		return arr
	}

	var wrap map[string]interface{}
	if err := json.Unmarshal(body, &wrap); err != nil {
		return nil
	}

	for _, key := range []string{"CatalogItems", "Items", "Data", "catalogItems"} {
		raw, ok := wrap[key]
		if !ok {
			continue
		}
		b, err := json.Marshal(raw)
		if err != nil {
			continue
		}
		var arr []map[string]interface{}
		if err := json.Unmarshal(b, &arr); err != nil {
			continue
		}
		return arr
	}
	return nil
}

func firstStringFromMap(m map[string]interface{}, keys ...string) string {
	for _, k := range keys {
		if s, ok := stringFromAny(m[k]); ok && s != "" {
			return s
		}
	}
	return ""
}

func stringFromAny(v interface{}) (string, bool) {
	if v == nil {
		return "", false
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t), true
	case float64:
		return trimNumString(fmt.Sprint(t)), true
	case json.Number:
		return t.String(), true
	default:
		return strings.TrimSpace(fmt.Sprint(t)), true
	}
}

func trimNumString(s string) string {
	if i := strings.IndexByte(s, '.'); i >= 0 {
		s = strings.TrimRight(s, "0")
		s = strings.TrimSuffix(s, ".")
	}
	return s
}

func firstFloatFromMap(m map[string]interface{}, keys ...string) float64 {
	for _, k := range keys {
		if f, ok := floatFromAny(m[k]); ok {
			return f
		}
	}
	return 0
}

func floatFromAny(v interface{}) (float64, bool) {
	if v == nil {
		return 0, false
	}
	switch t := v.(type) {
	case float64:
		return t, true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case json.Number:
		f, err := t.Float64()
		if err != nil {
			return 0, false
		}
		return f, true
	case string:
		var f float64
		_, err := fmt.Sscanf(strings.TrimSpace(t), "%f", &f)
		if err != nil {
			return 0, false
		}
		return f, true
	default:
		s := strings.TrimSpace(fmt.Sprint(t))
		if s == "" {
			return 0, false
		}
		var f float64
		_, err := fmt.Sscanf(s, "%f", &f)
		if err != nil {
			return 0, false
		}
		return f, true
	}
}
