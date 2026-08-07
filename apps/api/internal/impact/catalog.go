package impact

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/mtb-aggregator/api/internal/scraper"
)

const maxSearchPages = 2000

// maxImpactResultWindow is the maximum offset window Impact allows for Catalogs/Items Page+PageSize pagination.
// Requests beyond this return 400 ("Request exceeds the maximum results window of 20000").
const maxImpactResultWindow = 20000

// maxImpactItemsPage returns the last valid 1-based Page index for the given PageSize.
func maxImpactItemsPage(pageSize int) int {
	if pageSize <= 0 {
		return maxSearchPages
	}
	// ceil( maxImpactResultWindow / pageSize ) — last page whose start offset is still within the window.
	return (maxImpactResultWindow + pageSize - 1) / pageSize
}

// CatalogInfo is a subset of Impact catalog metadata used for CC detection.
type CatalogInfo struct {
	ID             string
	Name           string
	AdvertiserName string
}

// ListCatalogs calls GET /Mediapartners/{sid}/Catalogs and parses known JSON shapes.
func (c *Client) ListCatalogs(ctx context.Context) ([]CatalogInfo, error) {
	p := fmt.Sprintf("/Mediapartners/%s/Catalogs", url.PathEscape(c.AccountSID))
	q := c.irQuery()
	body, err := c.GetOK(ctx, p, q)
	if err != nil {
		return nil, err
	}
	return parseCatalogInfos(body)
}

// ResolveCCCatalogID returns IMPACT_CC_CATALOG_ID when set; otherwise picks the CC catalog by name.
func ResolveCCCatalogID(ctx context.Context, client *Client, cfg Config) (string, error) {
	id := strings.TrimSpace(cfg.CCCatalogID)
	if id != "" {
		return id, nil
	}
	list, err := client.ListCatalogs(ctx)
	if err != nil {
		return "", err
	}
	picked := pickCompetitiveCyclistCatalog(list)
	if picked == "" {
		return "", fmt.Errorf("no Competitive Cyclist catalog found among %d catalogs (set IMPACT_CC_CATALOG_ID manually)", len(list))
	}
	return picked, nil
}

func pickCompetitiveCyclistCatalog(list []CatalogInfo) string {
	type scored struct {
		id    string
		score int
	}
	var ranks []scored
	for _, c := range list {
		h := strings.ToLower(c.Name + " " + c.AdvertiserName)
		s := 0
		if strings.Contains(h, "competitive") && strings.Contains(h, "cyclist") {
			s += 100
		}
		if strings.Contains(h, "competitivecyclist") {
			s += 50
		}
		if strings.Contains(strings.ToLower(c.AdvertiserName), "competitive") {
			s += 10
		}
		if s > 0 {
			ranks = append(ranks, scored{id: c.ID, score: s})
		}
	}
	sort.Slice(ranks, func(i, j int) bool { return ranks[i].score > ranks[j].score })
	if len(ranks) == 0 {
		return ""
	}
	return ranks[0].id
}

// SearchCatalogItemsPage requests one page of catalog items.
// Uses GET .../Catalogs/{catalogId}/Items (Impact Partner catalog item list). The flat
// .../Catalogs/ItemSearch endpoint rejects ?CatalogId=; .../Catalogs/{id}/ItemSearch often returns 403.
func (c *Client) SearchCatalogItemsPage(ctx context.Context, catalogID, itemQuery string, page, pageSize int) ([]map[string]interface{}, bool, error) {
	p := fmt.Sprintf("/Mediapartners/%s/Catalogs/%s/Items", url.PathEscape(c.AccountSID), url.PathEscape(catalogID))
	q := c.irQuery()
	if strings.TrimSpace(itemQuery) != "" {
		q.Set("Query", itemQuery)
	}
	q.Set("Page", strconv.Itoa(page))
	q.Set("PageSize", strconv.Itoa(pageSize))

	body, code, err := c.Get(ctx, p, q)
	if err != nil {
		return nil, false, err
	}
	if code == 400 && strings.TrimSpace(itemQuery) != "" {
		q2 := c.irQuery()
		q2.Set("Page", strconv.Itoa(page))
		q2.Set("PageSize", strconv.Itoa(pageSize))
		body, code, err = c.Get(ctx, p, q2)
		if err != nil {
			return nil, false, err
		}
	}
	if code < 200 || code >= 300 {
		return nil, false, fmt.Errorf("impact API %s: status %d: %s", p, code, truncate(string(body), 500))
	}

	items := parseItemSearchResponse(body)
	more := pageSize > 0 && len(items) >= pageSize
	return items, more, nil
}

// SearchCatalogItemsPaginated fetches all pages until exhaustion, maxSearchPages, or Impact's ~20k result window.
func (c *Client) SearchCatalogItemsPaginated(ctx context.Context, catalogID, itemQuery string, pageSize int) ([]map[string]interface{}, error) {
	var out []map[string]interface{}
	maxPage := maxImpactItemsPage(pageSize)
	if maxPage > maxSearchPages {
		maxPage = maxSearchPages
	}
	for page := 1; page <= maxPage; page++ {
		items, more, err := c.SearchCatalogItemsPage(ctx, catalogID, itemQuery, page, pageSize)
		if err != nil {
			return nil, err
		}
		if len(items) == 0 {
			break
		}
		out = append(out, items...)
		if !more {
			break
		}
		if page == maxPage {
			if more {
				log.Printf("[impact] catalog Items pagination stopped at page %d (~%d rows): Impact limits Page/PageSize to a %d-result window; increase IMPACT_CC_PAGE_SIZE to fetch more per request or narrow IMPACT_CC_ITEM_SEARCH_QUERY",
					page, len(out), maxImpactResultWindow)
			}
			break
		}
	}
	return out, nil
}

// FetchCompetitiveCyclistScrapeResults loads the CC catalog and maps items to ScrapeResult rows
// (sale + optional category filters applied).
func FetchCompetitiveCyclistScrapeResults(ctx context.Context, cfg Config) ([]scraper.ScrapeResult, error) {
	if !cfg.CatalogConfigured() {
		return nil, fmt.Errorf("impact catalog: set %s and %s", EnvAccountSID, EnvAuthToken)
	}
	cl := NewClient(cfg)
	catID, err := ResolveCCCatalogID(ctx, cl, cfg)
	if err != nil {
		return nil, err
	}
	raw, err := cl.SearchCatalogItemsPaginated(ctx, catID, cfg.CCItemSearchQuery, cfg.PageSize)
	if err != nil {
		return nil, err
	}
	var results []scraper.ScrapeResult
	for _, m := range raw {
		r, ok := mapCatalogItemToScrapeResult(m, cfg)
		if ok {
			results = append(results, r)
		}
	}
	return results, nil
}
