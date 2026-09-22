package db

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

// isPlaceholderVariantOption reports Shopify dummy options and schema.org
// leftovers that must not be stored or rendered as facets (ZAC-278, ZAC-281).
func isPlaceholderVariantOption(name, value string) bool {
	n := strings.Join(strings.Fields(strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(name, "_", " "), "-", " "))), " ")
	compact := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(name, " ", ""), "_", ""), "-", ""))
	v := strings.Join(strings.Fields(strings.ToLower(value)), " ")
	if n == "" || v == "" {
		return true
	}
	if n == "title" || v == "default title" {
		return true
	}
	if n == "schema stock status" || strings.HasPrefix(n, "schema ") || strings.HasPrefix(compact, "schema") {
		return true
	}
	return strings.HasPrefix(v, "http://schema.org/") || strings.HasPrefix(v, "https://schema.org/")
}

// StripPlaceholderVariantOptions copies dims without Title / Default Title /
// schema.org leftover keys. The input map is not modified.
func StripPlaceholderVariantOptions(dims map[string]string) map[string]string {
	if len(dims) == 0 {
		return dims
	}
	out := make(map[string]string, len(dims))
	for k, v := range dims {
		if isPlaceholderVariantOption(k, v) {
			continue
		}
		out[k] = v
	}
	return out
}

// StripPlaceholderVariantOptionsJSON drops placeholder keys from a variant_options
// JSON object. Empty or all-placeholder payloads return nil so scrape upsert
// treats them as "no options" rather than storing junk.
func StripPlaceholderVariantOptionsJSON(raw []byte) []byte {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || bytes.Equal(raw, []byte("null")) || bytes.Equal(raw, []byte("{}")) {
		return nil
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return raw
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		s, ok := v.(string)
		if !ok {
			s = strings.TrimSpace(fmt.Sprint(v))
		}
		if isPlaceholderVariantOption(k, s) {
			continue
		}
		out[k] = s
	}
	if len(out) == 0 {
		return nil
	}
	b, err := json.Marshal(out)
	if err != nil {
		return raw
	}
	return b
}

// placeholderVariantOptionSQL is the jsonb_each-row predicate matching
// isPlaceholderVariantOption (alias e). Used by scrape upsert merge so
// existing Title/Default Title keys cannot survive an empty incoming scrape.
const placeholderVariantOptionSQL = `
			lower(regexp_replace(btrim(e.key), '[\s_-]+', ' ', 'g')) IN ('', 'title', 'schema stock status')
			OR btrim(COALESCE(e.value #>> '{}', '')) = ''
			OR lower(regexp_replace(btrim(COALESCE(e.value #>> '{}', '')), '\s+', ' ', 'g')) = 'default title'
			OR lower(regexp_replace(btrim(e.key), '[\s_-]+', ' ', 'g')) LIKE 'schema %'
			OR regexp_replace(lower(e.key), '[\s_-]+', '', 'g') LIKE 'schema%'
			OR lower(btrim(COALESCE(e.value #>> '{}', ''))) LIKE 'http://schema.org/%'
			OR lower(btrim(COALESCE(e.value #>> '{}', ''))) LIKE 'https://schema.org/%'
`

// mergedVariantOptionsSQL is the ON CONFLICT expression: merge option maps
// (ZAC-276) then drop placeholders so a Title-only scrape cannot keep junk
// when the next scrape correctly sends null/{} (ZAC-278, ZAC-281).
const mergedVariantOptionsSQL = `(
				SELECT CASE
					WHEN m.opts IS NULL OR m.opts = 'null'::jsonb THEN NULL
					WHEN jsonb_typeof(m.opts) <> 'object' THEN m.opts
					ELSE (
						SELECT jsonb_object_agg(e.key, e.value)
						FROM jsonb_each(m.opts) e
						WHERE NOT (` + placeholderVariantOptionSQL + `)
					)
				END
				FROM (
					SELECT CASE
						WHEN EXCLUDED.variant_options IS NULL
							OR EXCLUDED.variant_options = '{}'::jsonb
							OR EXCLUDED.variant_options = 'null'::jsonb
						THEN store_listings.variant_options
						WHEN store_listings.variant_options IS NULL
							OR store_listings.variant_options = '{}'::jsonb
							OR store_listings.variant_options = 'null'::jsonb
						THEN EXCLUDED.variant_options
						ELSE COALESCE(store_listings.variant_options, '{}'::jsonb) || EXCLUDED.variant_options
					END AS opts
				) m
			)`
