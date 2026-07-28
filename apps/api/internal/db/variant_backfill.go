package db

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	shopifyCollectionPerPage  = 250
	shopifyCollectionMaxPages = 250 // safety cap (~62k products per store)
)

// BackfillVariantOptions fills variant_options for Shopify listings missing them.
// Primary path: paginate each store's scrape_url collection **/products.json** (same as scrapers),
// index products by handle, then match listing SKU to variants. Fallback (unless
// BACKFILL_VARIANT_FALLBACK_PRODUCT_JSON=0): GET /products/{handle}.json for handles not in the index.
//
// Enrichment does not populate variant_options for Shopify stores; JensonUSA uses PDP enrich + DB fan-out instead. Shopify rows are filled by scrape upserts or this backfill.
//
// Set BACKFILL_VARIANT_VERBOSE=1 for per-row skip reasons (debugging).
//
// Rate limits: BACKFILL_VARIANT_PAGE_DELAY_MS between collection pages (default 500ms);
// BACKFILL_VARIANT_DELAY_MS between fallback product.json requests (default 1000ms);
// BACKFILL_VARIANT_MAX_ATTEMPTS per HTTP URL on 429/503 (default 6).
func (db *DB) BackfillVariantOptions(ctx context.Context) (int, error) {
	verbose := os.Getenv("BACKFILL_VARIANT_VERBOSE") == "1"
	fallbackProductJSON := os.Getenv("BACKFILL_VARIANT_FALLBACK_PRODUCT_JSON") != "0"
	pageDelay := backfillVariantPageDelay()
	fallbackDelay := backfillVariantInterRequestDelay()
	maxAttempts := backfillVariantMaxAttempts()
	client := &http.Client{Timeout: 45 * time.Second}

	rows, err := db.pool.Query(ctx, `
		SELECT l.id, l.store_id, l.store_sku, l.product_url, s.scrape_url, s.base_url
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		WHERE s.store_type IN ('ridebicycles', 'worldwidecyclery', 'revelbikes', 'thundermountainbikes', 'mackcycle', 'rideconcepts', 'leatt', 'chromag', 'gravitycartel', 'bikesonline', 'evo', 'cambriabikes', '365cycles', 'thelostco', 'hayes', 'raceface', 'ion', 'coloradocyclist', 'canfield', 'cased')
		  AND l.hidden = false
		  AND (
		    l.variant_options IS NULL
		    OR l.variant_options = '{}'::jsonb
		    OR l.variant_options = 'null'::jsonb
		  )
		ORDER BY l.store_id, l.id
	`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type listingRow struct {
		id         int
		storeID    int
		storeSKU   string
		productURL string
		scrapeURL  string
		baseURL    string
	}
	var batch []listingRow
	var scanned, updated int
	var skippedNoHandle, skippedFetch, skippedHTTP, skippedDecode, skippedNoMatch, skippedEmpty int
	var skippedNotInCollection int
	var loggedFirstHTTP bool

	flush := func(list []listingRow) error {
		if len(list) == 0 {
			return nil
		}
		storeID := list[0].storeID
		scrapeURL := list[0].scrapeURL
		baseURL := list[0].baseURL

		log.Printf("[backfill-variant] store_id=%d listings=%d collection=%q page_delay=%s fallback_delay=%s fallback_product_json=%v",
			storeID, len(list), scrapeURL, pageDelay, fallbackDelay, fallbackProductJSON)

		byHandle, pages, err := fetchCollectionProductIndex(ctx, client, scrapeURL, maxAttempts, verbose, pageDelay, storeID)
		if err != nil {
			log.Printf("[backfill-variant] store_id=%d collection index failed: %v", storeID, err)
			skippedFetch += len(list)
			return nil
		}
		log.Printf("[backfill-variant] store_id=%d indexed %d products from %d collection page(s)", storeID, len(byHandle), pages)

		fallbackCount := 0
		for _, r := range list {
			scanned++
			handle := extractProductHandle(r.productURL)
			if handle == "" {
				skippedNoHandle++
				if verbose {
					log.Printf("[backfill-variant] id=%d skip: no handle from URL %s", r.id, r.productURL)
				}
				continue
			}

			apiOrigin := originFromProductURL(r.productURL)
			if apiOrigin == "" {
				apiOrigin = strings.TrimRight(baseURL, "/")
			}

			var data *shopifyProductJSON
			if w, ok := byHandle[handle]; ok {
				wrapped := w
				data = &wrapped
			} else if fallbackProductJSON {
				if fallbackCount > 0 && fallbackDelay > 0 {
					select {
					case <-ctx.Done():
						return ctx.Err()
					case <-time.After(fallbackDelay):
					}
				}
				fallbackCount++

				reqURL := fmt.Sprintf("%s/products/%s.json", apiOrigin, handle)
				body, status, err := fetchShopifyProductJSON(ctx, client, reqURL, r.productURL, apiOrigin, maxAttempts, verbose, r.id)
				if err != nil {
					skippedFetch++
					if verbose {
						log.Printf("[backfill-variant] id=%d fallback skip: fetch %s: %v", r.id, reqURL, err)
					}
					continue
				}
				if status != http.StatusOK {
					skippedHTTP++
					if !loggedFirstHTTP {
						loggedFirstHTTP = true
						snippet := strings.TrimSpace(string(body))
						if len(snippet) > 200 {
							snippet = snippet[:200] + "…"
						}
						log.Printf("[backfill-variant] first non-200 (after retries): status=%d url=%s body_prefix=%q (403=bot block; 429=rate limit)",
							status, reqURL, snippet)
					}
					if verbose {
						log.Printf("[backfill-variant] id=%d fallback skip: GET %s -> %d", r.id, reqURL, status)
					}
					continue
				}
				var single shopifyProductJSON
				if err := json.Unmarshal(body, &single); err != nil {
					skippedDecode++
					if verbose {
						log.Printf("[backfill-variant] id=%d fallback skip: JSON decode %s: %v", r.id, reqURL, err)
					}
					continue
				}
				data = &single
			} else {
				skippedNotInCollection++
				if verbose {
					log.Printf("[backfill-variant] id=%d skip: handle %q not in collection index (fallback disabled)", r.id, handle)
				}
				continue
			}

			opts, ok := matchVariantOptions(data, r.storeSKU)
			if !ok {
				skippedNoMatch++
				if verbose {
					log.Printf("[backfill-variant] id=%d skip: no variant match sku=%q handle=%q variants=%d", r.id, r.storeSKU, handle, len(data.Product.Variants))
				}
				continue
			}
			if len(opts) == 0 {
				skippedEmpty++
				if verbose {
					log.Printf("[backfill-variant] id=%d skip: empty option map sku=%q", r.id, r.storeSKU)
				}
				continue
			}
			optsBytes, err := json.Marshal(opts)
			if err != nil {
				continue
			}
			pgk := fmt.Sprintf("%d:%s", r.storeID, data.Product.Handle)
			_, err = db.pool.Exec(ctx, `
				UPDATE store_listings
				SET variant_options = $1::jsonb,
				    product_group_key = COALESCE(NULLIF(trim(product_group_key), ''), $2)
				WHERE id = $3
			`, string(optsBytes), pgk, r.id)
			if err != nil {
				if verbose {
					log.Printf("[backfill-variant] id=%d skip: update: %v", r.id, err)
				}
				continue
			}
			updated++
		}
		return nil
	}

	var curStore int
	for rows.Next() {
		var r listingRow
		if err := rows.Scan(&r.id, &r.storeID, &r.storeSKU, &r.productURL, &r.scrapeURL, &r.baseURL); err != nil {
			return updated, err
		}
		if len(batch) > 0 && r.storeID != curStore {
			if err := flush(batch); err != nil {
				return updated, err
			}
			batch = batch[:0]
		}
		curStore = r.storeID
		batch = append(batch, r)
	}
	if err := rows.Err(); err != nil {
		return updated, err
	}
	if err := flush(batch); err != nil {
		return updated, err
	}

	log.Printf("[backfill-variant] scanned=%d updated=%d skipped_no_handle=%d skipped_not_in_collection=%d skipped_fetch=%d skipped_http=%d skipped_decode=%d skipped_no_match=%d skipped_empty_map=%d",
		scanned, updated, skippedNoHandle, skippedNotInCollection, skippedFetch, skippedHTTP, skippedDecode, skippedNoMatch, skippedEmpty)
	return updated, nil
}

// fetchCollectionProductIndex paginates GET {origin}{collectionPath}/products.json?limit=250&page=N (same as scrapers).
func fetchCollectionProductIndex(ctx context.Context, client *http.Client, scrapeURL string, maxAttempts int, verbose bool, pageDelay time.Duration, storeID int) (map[string]shopifyProductJSON, int, error) {
	origin, path, err := collectionPathForJSON(scrapeURL)
	if err != nil {
		return nil, 0, err
	}
	out := make(map[string]shopifyProductJSON)
	pages := 0
	for page := 1; page <= shopifyCollectionMaxPages; page++ {
		if page > 1 && pageDelay > 0 {
			select {
			case <-ctx.Done():
				return nil, pages, ctx.Err()
			case <-time.After(pageDelay):
			}
		}
		reqURL := fmt.Sprintf("%s%s/products.json?limit=%d&page=%d", origin, path, shopifyCollectionPerPage, page)
		body, status, err := fetchShopifyProductJSON(ctx, client, reqURL, scrapeURL, origin, maxAttempts, verbose, storeID)
		if err != nil {
			return nil, pages, err
		}
		if status != http.StatusOK {
			return nil, pages, fmt.Errorf("collection page %d: HTTP %d", page, status)
		}
		var coll shopifyCollectionJSON
		if err := json.Unmarshal(body, &coll); err != nil {
			return nil, pages, fmt.Errorf("collection page %d: decode: %w", page, err)
		}
		if len(coll.Products) == 0 {
			break
		}
		pages++
		for _, p := range coll.Products {
			h := strings.TrimSpace(p.Handle)
			if h == "" {
				continue
			}
			out[h] = shopifyProductFromCollection(p)
		}
		if len(coll.Products) < shopifyCollectionPerPage {
			break
		}
	}
	return out, pages, nil
}

func collectionPathForJSON(scrapeURL string) (origin string, pathNoQuery string, err error) {
	u, err := url.Parse(scrapeURL)
	if err != nil {
		return "", "", err
	}
	if u.Scheme == "" || u.Host == "" {
		return "", "", fmt.Errorf("invalid scrape URL: %s", scrapeURL)
	}
	origin = strings.TrimRight(u.Scheme+"://"+u.Host, "/")
	pathNoQuery = strings.TrimSuffix(strings.TrimSpace(u.Path), "/")
	if pathNoQuery == "" {
		return "", "", fmt.Errorf("empty collection path in scrape URL: %s", scrapeURL)
	}
	return origin, pathNoQuery, nil
}

func shopifyProductFromCollection(p shopifyCollectionProduct) shopifyProductJSON {
	var s shopifyProductJSON
	s.Product.Handle = p.Handle
	s.Product.Options = p.Options
	s.Product.Variants = p.Variants
	return s
}

func backfillVariantPageDelay() time.Duration {
	v := strings.TrimSpace(os.Getenv("BACKFILL_VARIANT_PAGE_DELAY_MS"))
	if v == "" {
		return 500 * time.Millisecond
	}
	ms, err := strconv.Atoi(v)
	if err != nil || ms < 0 {
		return 500 * time.Millisecond
	}
	return time.Duration(ms) * time.Millisecond
}

// fetchShopifyProductJSON GETs reqURL with retries on 429 Too Many Requests and 503 Service Unavailable.
func fetchShopifyProductJSON(ctx context.Context, client *http.Client, reqURL, productURL, apiOrigin string, maxAttempts int, verbose bool, listingID int) ([]byte, int, error) {
	var lastResp *http.Response
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 && lastResp != nil {
			wait := waitBeforeHTTPRetry(lastResp, attempt)
			if verbose {
				log.Printf("[backfill-variant] id=%d HTTP retry %d/%d after %s (was %d)",
					listingID, attempt, maxAttempts-1, wait, lastResp.StatusCode)
			}
			select {
			case <-ctx.Done():
				return nil, 0, ctx.Err()
			case <-time.After(wait):
			}
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
		if err != nil {
			return nil, 0, err
		}
		applyShopifyJSONHeaders(req, productURL, apiOrigin)

		resp, err := client.Do(req)
		if err != nil {
			return nil, 0, err
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		resp.Body.Close()
		if readErr != nil {
			return nil, 0, readErr
		}
		if resp.StatusCode == http.StatusOK {
			return body, http.StatusOK, nil
		}
		retryable := resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusServiceUnavailable
		if !retryable || attempt == maxAttempts-1 {
			return body, resp.StatusCode, nil
		}
		lastResp = resp
	}
	return nil, 0, fmt.Errorf("fetchShopifyProductJSON: exhausted attempts")
}

func backfillVariantInterRequestDelay() time.Duration {
	v := strings.TrimSpace(os.Getenv("BACKFILL_VARIANT_DELAY_MS"))
	if v == "" {
		return time.Second
	}
	ms, err := strconv.Atoi(v)
	if err != nil || ms < 0 {
		return time.Second
	}
	return time.Duration(ms) * time.Millisecond
}

func backfillVariantMaxAttempts() int {
	v := strings.TrimSpace(os.Getenv("BACKFILL_VARIANT_MAX_ATTEMPTS"))
	if v == "" {
		return 6
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return 6
	}
	if n > 20 {
		return 20
	}
	return n
}

// waitBeforeHTTPRetry uses Retry-After when present, else exponential backoff (2s, 4s, … cap 60s).
func waitBeforeHTTPRetry(resp *http.Response, retryAttempt int) time.Duration {
	if resp != nil {
		if d, ok := parseRetryAfterHeader(resp.Header); ok && d > 0 {
			if d > 2*time.Minute {
				return 2 * time.Minute
			}
			return d
		}
	}
	r := retryAttempt
	if r < 1 {
		r = 1
	}
	if r > 6 {
		r = 6
	}
	d := time.Duration(1<<uint(r)) * time.Second
	if d > 60*time.Second {
		d = 60 * time.Second
	}
	return d
}

func parseRetryAfterHeader(h http.Header) (time.Duration, bool) {
	v := strings.TrimSpace(h.Get("Retry-After"))
	if v == "" {
		return 0, false
	}
	if secs, err := strconv.Atoi(v); err == nil && secs >= 0 {
		return time.Duration(secs) * time.Second, true
	}
	if t, err := http.ParseTime(v); err == nil {
		d := time.Until(t)
		if d < 0 {
			return 0, false
		}
		return d, true
	}
	return 0, false
}

const shopifyJSONUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

func originFromProductURL(productURL string) string {
	u, err := url.Parse(productURL)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	return strings.TrimRight(u.Scheme+"://"+u.Host, "/")
}

func applyShopifyJSONHeaders(req *http.Request, productURL, apiOrigin string) {
	req.Header.Set("Accept", "application/json, text/javascript, */*;q=0.01")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("User-Agent", shopifyJSONUserAgent)
	if productURL != "" {
		req.Header.Set("Referer", productURL)
	} else {
		req.Header.Set("Referer", apiOrigin+"/")
	}
}

type shopifyProductJSON struct {
	Product struct {
		Handle   string               `json:"handle"`
		Options  []struct{ Name string `json:"name"` } `json:"options"`
		Variants []shopifyVariantJSON `json:"variants"`
	} `json:"product"`
}

// shopifyCollectionJSON is the response from GET /collections/{handle}/products.json
type shopifyCollectionJSON struct {
	Products []shopifyCollectionProduct `json:"products"`
}

type shopifyCollectionProduct struct {
	Handle   string               `json:"handle"`
	Options  []struct{ Name string `json:"name"` } `json:"options"`
	Variants []shopifyVariantJSON `json:"variants"`
}

// Shopify may emit sku as a JSON string or number; unmarshaling into *string breaks the whole decode.
type shopifyVariantJSON struct {
	ID      int64           `json:"id"`
	SKU     json.RawMessage `json:"sku"`
	Barcode json.RawMessage `json:"barcode"`
	Option1 *string         `json:"option1"`
	Option2 *string         `json:"option2"`
	Option3 *string         `json:"option3"`
	Title   *string         `json:"title"`
}

func extractProductHandle(productURL string) string {
	u, err := url.Parse(productURL)
	if err != nil {
		return ""
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	for i := 0; i < len(parts)-1; i++ {
		if parts[i] == "products" && i+1 < len(parts) {
			return strings.Split(parts[i+1], "?")[0]
		}
	}
	return ""
}

// rawJSONString coerces JSON string, number, or null to a comparable SKU/barcode string.
func rawJSONString(raw json.RawMessage) string {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || bytes.Equal(raw, []byte("null")) {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strings.TrimSpace(s)
	}
	var n json.Number
	if err := json.Unmarshal(raw, &n); err == nil {
		return strings.TrimSpace(n.String())
	}
	return ""
}

func matchVariantOptions(data *shopifyProductJSON, storeSKU string) (map[string]string, bool) {
	want := strings.TrimSpace(storeSKU)
	if want == "" {
		return nil, false
	}
	for i := range data.Product.Variants {
		v := &data.Product.Variants[i]
		sku := rawJSONString(v.SKU)
		bar := rawJSONString(v.Barcode)
		if (sku != "" && sku == want) || (bar != "" && bar == want) {
			return buildVariantOptionMap(data, v), true
		}
	}
	for i := range data.Product.Variants {
		v := &data.Product.Variants[i]
		if fmt.Sprintf("v%d", v.ID) == want {
			return buildVariantOptionMap(data, v), true
		}
	}
	return nil, false
}

func buildVariantOptionMap(data *shopifyProductJSON, v *shopifyVariantJSON) map[string]string {
	names := data.Product.Options
	vals := []*string{v.Option1, v.Option2, v.Option3}
	out := make(map[string]string)
	for i := 0; i < len(names) && i < 3; i++ {
		n := strings.TrimSpace(names[i].Name)
		if n == "" {
			continue
		}
		if vals[i] == nil || strings.TrimSpace(*vals[i]) == "" {
			continue
		}
		out[n] = strings.TrimSpace(*vals[i])
	}
	if len(out) == 0 {
		fallbackNames := []string{"Option 1", "Option 2", "Option 3"}
		for i := 0; i < 3; i++ {
			if vals[i] != nil && strings.TrimSpace(*vals[i]) != "" {
				out[fallbackNames[i]] = strings.TrimSpace(*vals[i])
			}
		}
	}
	if len(out) == 0 && v.Title != nil {
		t := strings.TrimSpace(*v.Title)
		if t != "" && strings.ToLower(t) != "default title" {
			out["Variant"] = t
		}
	}
	return out
}
