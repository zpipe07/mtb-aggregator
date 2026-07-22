package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
)

// PipelineStoreBacklog is per-store enrichment backlog for admin insights.
type PipelineStoreBacklog struct {
	StoreID   int    `json:"store_id"`
	Name      string `json:"name"`
	StoreType string `json:"store_type"`
	Count     int    `json:"count"`
}

// PipelineBacklog summarizes listings that need enrichment.
type PipelineBacklog struct {
	Total            int                    `json:"total"`
	StaleSinceScrape int                    `json:"stale_since_scrape"`
	NeverEnriched    int                    `json:"never_enriched"`
	ByStore          []PipelineStoreBacklog `json:"by_store"`
}

// PipelineFreshness buckets in-stock visible listings by last_enriched_at age.
type PipelineFreshness struct {
	InStockTotal  int `json:"in_stock_total"`
	NeverEnriched int `json:"never_enriched"`
	Lt24h         int `json:"lt_24h"`
	D1to7         int `json:"d1_7"`
	D7to30        int `json:"d7_30"`
	Gt30d         int `json:"gt_30d"`
}

// PipelineMetrics aggregates scrape/enrich pipeline health for admin visualization.
type PipelineMetrics struct {
	Backlog          PipelineBacklog `json:"backlog"`
	Freshness        PipelineFreshness `json:"freshness"`
	RecentScrapeJobs []ScrapeJob       `json:"recent_scrape_jobs"`
	RecentEnrichJobs []EnrichJob       `json:"recent_enrich_jobs"`
	Days             int               `json:"days"`
}

const pipelineListingScope = `is_in_stock = true AND hidden = false`

// GetPipelineMetrics returns backlog, freshness, and recent job history for admin insights.
func (db *DB) GetPipelineMetrics(ctx context.Context, days int) (PipelineMetrics, error) {
	if days <= 0 {
		days = 30
	}
	if days > 90 {
		days = 90
	}

	var out PipelineMetrics
	out.Days = days

	err := db.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT
			COUNT(*) FILTER (WHERE last_enriched_at IS NULL OR last_scraped > last_enriched_at)::int,
			COUNT(*) FILTER (WHERE last_enriched_at IS NOT NULL AND last_scraped > last_enriched_at)::int,
			COUNT(*) FILTER (WHERE last_enriched_at IS NULL)::int
		FROM store_listings
		WHERE %s
	`, pipelineListingScope)).Scan(
		&out.Backlog.Total,
		&out.Backlog.StaleSinceScrape,
		&out.Backlog.NeverEnriched,
	)
	if err != nil {
		return PipelineMetrics{}, err
	}

	rows, err := db.pool.Query(ctx, `
		SELECT s.id, s.name, COALESCE(s.store_type, ''), COUNT(l.id)::int
		FROM stores s
		LEFT JOIN store_listings l ON l.store_id = s.id
			AND l.is_in_stock = true AND l.hidden = false
			AND (l.last_enriched_at IS NULL OR l.last_scraped > l.last_enriched_at)
		GROUP BY s.id, s.name, s.store_type
		ORDER BY COUNT(l.id) DESC, s.name
	`)
	if err != nil {
		return PipelineMetrics{}, err
	}
	defer rows.Close()

	for rows.Next() {
		var row PipelineStoreBacklog
		if err := rows.Scan(&row.StoreID, &row.Name, &row.StoreType, &row.Count); err != nil {
			return PipelineMetrics{}, err
		}
		out.Backlog.ByStore = append(out.Backlog.ByStore, row)
	}
	if err := rows.Err(); err != nil {
		return PipelineMetrics{}, err
	}
	if out.Backlog.ByStore == nil {
		out.Backlog.ByStore = []PipelineStoreBacklog{}
	}

	err = db.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT
			COUNT(*)::int,
			COUNT(*) FILTER (WHERE last_enriched_at IS NULL)::int,
			COUNT(*) FILTER (WHERE last_enriched_at >= NOW() - INTERVAL '24 hours')::int,
			COUNT(*) FILTER (WHERE last_enriched_at < NOW() - INTERVAL '24 hours'
				AND last_enriched_at >= NOW() - INTERVAL '7 days')::int,
			COUNT(*) FILTER (WHERE last_enriched_at < NOW() - INTERVAL '7 days'
				AND last_enriched_at >= NOW() - INTERVAL '30 days')::int,
			COUNT(*) FILTER (WHERE last_enriched_at < NOW() - INTERVAL '30 days')::int
		FROM store_listings
		WHERE %s
	`, pipelineListingScope)).Scan(
		&out.Freshness.InStockTotal,
		&out.Freshness.NeverEnriched,
		&out.Freshness.Lt24h,
		&out.Freshness.D1to7,
		&out.Freshness.D7to30,
		&out.Freshness.Gt30d,
	)
	if err != nil {
		return PipelineMetrics{}, err
	}

	scrapeJobs, err := db.getScrapeJobsSince(ctx, days)
	if err != nil {
		return PipelineMetrics{}, err
	}
	out.RecentScrapeJobs = scrapeJobs

	enrichJobs, err := db.getEnrichJobsSince(ctx, days)
	if err != nil {
		return PipelineMetrics{}, err
	}
	out.RecentEnrichJobs = enrichJobs

	return out, nil
}

func (db *DB) getScrapeJobsSince(ctx context.Context, days int) ([]ScrapeJob, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, store_id, store_name, status, started_at::text, completed_at::text,
			listings_found, listings_upserted, COALESCE(errors, '{}'), COALESCE(warnings, '{}'), triggered_by
		FROM scrape_jobs
		WHERE started_at >= NOW() - ($1::int * INTERVAL '1 day')
		ORDER BY started_at ASC
	`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []ScrapeJob
	for rows.Next() {
		var j ScrapeJob
		var completedAt *string
		var errArr, warnArr pgtype.FlatArray[string]
		if err := rows.Scan(&j.ID, &j.StoreID, &j.StoreName, &j.Status, &j.StartedAt, &completedAt, &j.ListingsFound, &j.ListingsUpserted, &errArr, &warnArr, &j.TriggeredBy); err != nil {
			return nil, err
		}
		j.CompletedAt = completedAt
		j.Errors = []string(errArr)
		j.Warnings = []string(warnArr)
		jobs = append(jobs, j)
	}
	if jobs == nil {
		jobs = []ScrapeJob{}
	}
	return jobs, rows.Err()
}

func (db *DB) getEnrichJobsSince(ctx context.Context, days int) ([]EnrichJob, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, store_type, COALESCE(job_type, 'enrich'), status, started_at::text, completed_at::text,
			listings_processed, listings_enriched, COALESCE(errors, '{}'), triggered_by, force_mode
		FROM enrich_jobs
		WHERE started_at >= NOW() - ($1::int * INTERVAL '1 day')
		ORDER BY started_at ASC
	`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []EnrichJob
	for rows.Next() {
		var j EnrichJob
		var completedAt *string
		var errArr pgtype.FlatArray[string]
		if err := rows.Scan(&j.ID, &j.StoreType, &j.JobType, &j.Status, &j.StartedAt, &completedAt, &j.ListingsProcessed, &j.ListingsEnriched, &errArr, &j.TriggeredBy, &j.ForceMode); err != nil {
			return nil, err
		}
		j.CompletedAt = completedAt
		j.Errors = []string(errArr)
		jobs = append(jobs, j)
	}
	if jobs == nil {
		jobs = []EnrichJob{}
	}
	return jobs, rows.Err()
}
