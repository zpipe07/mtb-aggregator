package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/lib/pq"
	"github.com/mtb-aggregator/api/internal/enrichstate"
)

// PipelineLatency is scrape-to-extract success latency (p50/p95) for admin insights.
type PipelineLatency struct {
	P50Seconds  *float64 `json:"p50_seconds"`
	P95Seconds  *float64 `json:"p95_seconds"`
	SampleCount int      `json:"sample_count"`
}

// PipelineEventThroughputDay is daily successful enrichment events by step.
type PipelineEventThroughputDay struct {
	Date     string `json:"date"`
	PDP      int    `json:"pdp"`
	Classify int    `json:"classify"`
	Extract  int    `json:"extract"`
}

// PipelineStorePDP is per-store PDP drainer health for admin insights.
type PipelineStorePDP struct {
	StoreID                 int     `json:"store_id"`
	Name                    string  `json:"name"`
	StoreType               string  `json:"store_type"`
	PDPDue                  int     `json:"pdp_due"`
	PDPInFlight             int     `json:"pdp_in_flight"`
	PDPDead                 int     `json:"pdp_dead"`
	PDPLastFetchAt          *string `json:"pdp_last_fetch_at"`
	PDPCooldownUntil        *string `json:"pdp_cooldown_until"`
	PDPConsecutiveFailures  int     `json:"pdp_consecutive_failures"`
}

// PipelineFreshness buckets in-stock visible enricher listings by pdp_fetched_at age.
type PipelineFreshness struct {
	InStockTotal int `json:"in_stock_total"`
	NeverFetched int `json:"never_fetched"`
	Lt24h        int `json:"lt_24h"`
	D1to7        int `json:"d1_7"`
	D7to30       int `json:"d7_30"`
	Gt30d        int `json:"gt_30d"`
}

// PipelineMetrics aggregates scrape/enrich pipeline health for admin visualization.
type PipelineMetrics struct {
	Latency          PipelineLatency            `json:"latency"`
	EventThroughput  []PipelineEventThroughputDay `json:"event_throughput"`
	Freshness        PipelineFreshness          `json:"freshness"`
	Stores           []PipelineStorePDP         `json:"stores"`
	RecentScrapeJobs []ScrapeJob                `json:"recent_scrape_jobs"`
	Days             int                        `json:"days"`
}

const pipelineListingScope = `l.is_in_stock = true AND l.hidden = false`

// ClampPipelineMetricsDays bounds the metrics window (default 30, max 90).
func ClampPipelineMetricsDays(days int) int {
	if days <= 0 {
		return 30
	}
	if days > 90 {
		return 90
	}
	return days
}

// GetPipelineMetrics returns flow-centric pipeline health for admin insights.
func (db *DB) GetPipelineMetrics(ctx context.Context, days int) (PipelineMetrics, error) {
	days = ClampPipelineMetricsDays(days)

	var out PipelineMetrics
	out.Days = days
	out.EventThroughput = []PipelineEventThroughputDay{}
	out.Stores = []PipelineStorePDP{}

	staleCutoff := time.Now().Add(-enrichstate.DefaultConfig().PDPStaleAfter)

	if err := db.pipelineLatency(ctx, days, &out.Latency); err != nil {
		return PipelineMetrics{}, err
	}

	throughput, err := db.pipelineEventThroughput(ctx, days)
	if err != nil {
		return PipelineMetrics{}, err
	}
	out.EventThroughput = throughput

	if err := db.pipelinePDPFreshness(ctx, &out.Freshness); err != nil {
		return PipelineMetrics{}, err
	}

	stores, err := db.pipelineStorePDP(ctx, staleCutoff)
	if err != nil {
		return PipelineMetrics{}, err
	}
	out.Stores = stores

	scrapeJobs, err := db.getScrapeJobsSince(ctx, days)
	if err != nil {
		return PipelineMetrics{}, err
	}
	out.RecentScrapeJobs = scrapeJobs

	return out, nil
}

func (db *DB) pipelineLatency(ctx context.Context, days int, out *PipelineLatency) error {
	var p50, p95 pgtype.Float8
	err := db.pool.QueryRow(ctx, `
		SELECT
			percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (e.created_at - l.last_scraped))),
			percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (e.created_at - l.last_scraped))),
			COUNT(*)::int
		FROM enrichment_events e
		JOIN store_listings l ON l.id = e.listing_id
		WHERE e.step = 'extract' AND e.status = 'success'
			AND e.created_at >= NOW() - ($1::int * INTERVAL '1 day')
			AND l.last_scraped IS NOT NULL
			AND e.created_at >= l.last_scraped
	`, days).Scan(&p50, &p95, &out.SampleCount)
	if err != nil {
		return err
	}
	if out.SampleCount > 0 {
		if p50.Valid {
			v := p50.Float64
			out.P50Seconds = &v
		}
		if p95.Valid {
			v := p95.Float64
			out.P95Seconds = &v
		}
	}
	return nil
}

func (db *DB) pipelineEventThroughput(ctx context.Context, days int) ([]PipelineEventThroughputDay, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT
			to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD'),
			COUNT(*) FILTER (WHERE step = 'pdp' AND status = 'success')::int,
			COUNT(*) FILTER (WHERE step = 'classify' AND status = 'success')::int,
			COUNT(*) FILTER (WHERE step = 'extract' AND status = 'success')::int
		FROM enrichment_events
		WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
		GROUP BY 1
		ORDER BY 1
	`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PipelineEventThroughputDay
	for rows.Next() {
		var row PipelineEventThroughputDay
		if err := rows.Scan(&row.Date, &row.PDP, &row.Classify, &row.Extract); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []PipelineEventThroughputDay{}
	}
	return out, rows.Err()
}

func (db *DB) pipelinePDPFreshness(ctx context.Context, out *PipelineFreshness) error {
	return db.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT
			COUNT(*)::int,
			COUNT(*) FILTER (WHERE le.pdp_fetched_at IS NULL)::int,
			COUNT(*) FILTER (WHERE le.pdp_fetched_at >= NOW() - INTERVAL '24 hours')::int,
			COUNT(*) FILTER (WHERE le.pdp_fetched_at < NOW() - INTERVAL '24 hours'
				AND le.pdp_fetched_at >= NOW() - INTERVAL '7 days')::int,
			COUNT(*) FILTER (WHERE le.pdp_fetched_at < NOW() - INTERVAL '7 days'
				AND le.pdp_fetched_at >= NOW() - INTERVAL '30 days')::int,
			COUNT(*) FILTER (WHERE le.pdp_fetched_at < NOW() - INTERVAL '30 days')::int
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		LEFT JOIN listing_enrichment le ON le.listing_id = l.id
		WHERE %s
			AND s.store_type = ANY($1)
	`, pipelineListingScope), pq.Array(StoreTypesWithEnrichers)).Scan(
		&out.InStockTotal,
		&out.NeverFetched,
		&out.Lt24h,
		&out.D1to7,
		&out.D7to30,
		&out.Gt30d,
	)
}

func (db *DB) pipelineStorePDP(ctx context.Context, staleCutoff time.Time) ([]PipelineStorePDP, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT
			s.id,
			s.name,
			COALESCE(s.store_type, ''),
			COUNT(*) FILTER (WHERE
				COALESCE(le.pdp_dead, false) = false
				AND (le.next_pdp_attempt_at IS NULL OR le.next_pdp_attempt_at <= NOW())
				AND (le.pdp_fetched_at IS NULL OR le.pdp_fetched_at < $1)
			)::int,
			COUNT(*) FILTER (WHERE le.pdp_leased_until > NOW())::int,
			COUNT(*) FILTER (WHERE le.pdp_dead)::int,
			MAX(s.pdp_last_fetch_at)::text,
			MAX(s.pdp_cooldown_until)::text,
			MAX(s.pdp_consecutive_failures)::int
		FROM stores s
		LEFT JOIN store_listings l ON l.store_id = s.id
			AND l.is_in_stock = true AND l.hidden = false
			AND l.product_url IS NOT NULL AND l.product_url != ''
		LEFT JOIN listing_enrichment le ON le.listing_id = l.id
		WHERE s.store_type = ANY($2)
		GROUP BY s.id, s.name, s.store_type
		ORDER BY COUNT(*) FILTER (WHERE
			COALESCE(le.pdp_dead, false) = false
			AND (le.next_pdp_attempt_at IS NULL OR le.next_pdp_attempt_at <= NOW())
			AND (le.pdp_fetched_at IS NULL OR le.pdp_fetched_at < $1)
		) DESC, s.name
	`, staleCutoff, pq.Array(StoreTypesWithEnrichers))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PipelineStorePDP
	for rows.Next() {
		var row PipelineStorePDP
		if err := rows.Scan(
			&row.StoreID,
			&row.Name,
			&row.StoreType,
			&row.PDPDue,
			&row.PDPInFlight,
			&row.PDPDead,
			&row.PDPLastFetchAt,
			&row.PDPCooldownUntil,
			&row.PDPConsecutiveFailures,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []PipelineStorePDP{}
	}
	return out, rows.Err()
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
