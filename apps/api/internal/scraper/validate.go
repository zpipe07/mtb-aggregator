package scraper

import (
	"fmt"
	"net/url"
	"strings"
)

// ValidationError describes a contract violation for a scrape result.
type ValidationError struct {
	Index  int    // 0-based index in batch, -1 for batch-level
	Field  string
	Reason string
}

func (e ValidationError) Error() string {
	if e.Index >= 0 {
		return fmt.Sprintf("[%d] %s: %s", e.Index, e.Field, e.Reason)
	}
	return fmt.Sprintf("%s: %s", e.Field, e.Reason)
}

// ValidateResult checks a single ScrapeResult against the scraper contract.
// Returns nil if valid, or a list of validation errors.
func ValidateResult(r ScrapeResult, index int) []ValidationError {
	var errs []ValidationError
	add := func(field, reason string) {
		errs = append(errs, ValidationError{Index: index, Field: field, Reason: reason})
	}

	// Required fields
	if strings.TrimSpace(r.StoreSKU) == "" {
		add("store_sku", "required, cannot be empty")
	}
	if strings.TrimSpace(r.ProductName) == "" {
		add("product_name", "required, cannot be empty")
	}
	if r.CurrentPrice <= 0 {
		add("current_price", "required, must be positive")
	}
	if r.CurrentPrice > 50000 {
		add("current_price", "suspiciously high, likely parsing error")
	}
	if strings.TrimSpace(r.ProductURL) == "" {
		add("product_url", "required, cannot be empty")
	} else if _, err := url.Parse(r.ProductURL); err != nil {
		add("product_url", "must be valid URL")
	}

	// Optional but validated when present
	if r.OriginalPrice != nil {
		if *r.OriginalPrice <= 0 {
			add("original_price", "when present, must be positive")
		} else if r.CurrentPrice > 0 {
			discountFraction := (*r.OriginalPrice - r.CurrentPrice) / *r.OriginalPrice
			if discountFraction > 0.80 {
				add("original_price", fmt.Sprintf("implausible discount: %.0f%% off ($%.2f → $%.2f); compare_at_price may represent bulk/case pricing rather than a 'was' price", discountFraction*100, *r.OriginalPrice, r.CurrentPrice))
			}
		}
	}
	if r.ImageURL != nil && *r.ImageURL != "" {
		if _, err := url.Parse(*r.ImageURL); err != nil {
			add("image_url", "must be valid URL when present")
		}
	}

	return errs
}

// BatchValidationResult summarizes validation for a scrape batch.
type BatchValidationResult struct {
	ValidCount    int
	InvalidCount  int
	Errors        []ValidationError
	Warnings      []ValidationError // e.g. expected fields missing
	AbortSave     bool              // true if strict mode and validation failed
}

// ValidateBatch validates all results and checks batch-level expectations.
// storeType can inform expectations (e.g. "jensonusa" clearance expects original_price).
func ValidateBatch(results []ScrapeResult, storeName string, strictMode bool) BatchValidationResult {
	var out BatchValidationResult

	for i, r := range results {
		errs := ValidateResult(r, i)
		if len(errs) == 0 {
			out.ValidCount++
		} else {
			out.InvalidCount++
			out.Errors = append(out.Errors, errs...)
		}
	}

	// Batch-level: for clearance/sale pages, expect original_price on most results
	const minResults = 10
	const minWithOriginalPct = 0.1
	if len(results) >= minResults {
		withOriginal := 0
		for _, r := range results {
			if r.OriginalPrice != nil && *r.OriginalPrice > 0 {
				withOriginal++
			}
		}
		pct := float64(withOriginal) / float64(len(results))
		if pct < minWithOriginalPct {
			out.Warnings = append(out.Warnings, ValidationError{
				Index:  -1,
				Field:  "original_price",
				Reason: fmt.Sprintf("%d/%d results have original_price (expected on clearance). Scraper may use wrong DTO field (msrpPrice not originalPrice)", withOriginal, len(results)),
			})
			if strictMode {
				out.AbortSave = true
			}
		}
	}

	return out
}
