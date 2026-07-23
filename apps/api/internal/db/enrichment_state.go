package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/lib/pq"
	"github.com/mtb-aggregator/api/internal/enrichstate"
)

// EnrichmentStateStore implements enrichstate.StateStore on *DB.
type EnrichmentStateStore struct {
	DB *DB
}

func (s EnrichmentStateStore) EnsureRow(ctx context.Context, listingID int) error {
	_, err := s.DB.pool.Exec(ctx, `
		INSERT INTO listing_enrichment (listing_id)
		VALUES ($1)
		ON CONFLICT (listing_id) DO NOTHING
	`, listingID)
	return err
}

func (s EnrichmentStateStore) GetState(ctx context.Context, listingID int) (*enrichstate.ListingState, error) {
	row := s.DB.pool.QueryRow(ctx, `
		SELECT listing_id,
			pdp_fetched_at, COALESCE(pdp_hash, ''), pdp_attempts, COALESCE(pdp_error, ''), next_pdp_attempt_at, pdp_dead,
			classified_at, classify_attempts, COALESCE(classify_error, ''), next_classify_attempt_at, classify_dead,
			llm_confidence, prompt_profile_version,
			extracted_at, extract_attempts, COALESCE(extract_error, ''), next_extract_attempt_at, extract_dead
		FROM listing_enrichment
		WHERE listing_id = $1
	`, listingID)

	var st enrichstate.ListingState
	var pdpErr, classifyErr, extractErr string
	var llmConf pgtype.Float4
	var profileVer *time.Time
	err := row.Scan(
		&st.ListingID,
		&st.PDP.CompletedAt, &st.PDPHash, &st.PDP.Attempts, &pdpErr, &st.PDP.NextAttemptAt, &st.PDP.Dead,
		&st.Classify.CompletedAt, &st.Classify.Attempts, &classifyErr, &st.Classify.NextAttemptAt, &st.Classify.Dead,
		&llmConf, &profileVer,
		&st.Extract.CompletedAt, &st.Extract.Attempts, &extractErr, &st.Extract.NextAttemptAt, &st.Extract.Dead,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	st.PDP.Error = pdpErr
	st.Classify.Error = classifyErr
	st.Extract.Error = extractErr
	if llmConf.Valid {
		c := llmConf.Float32
		f := float64(c)
		st.LLMConfidence = &f
	}
	st.PromptProfileVersion = profileVer
	return &st, nil
}

func (s EnrichmentStateStore) ClaimForStep(ctx context.Context, step enrichstate.Step, filter enrichstate.ClaimFilter, limit int, force bool, now time.Time) ([]enrichstate.WorkItem, error) {
	if limit <= 0 {
		limit = 50
	}
	base := `
		SELECT l.id, l.store_id, COALESCE(s.store_type, 'jensonusa'), l.product_url, COALESCE(l.store_sku, '')
		FROM store_listings l
		JOIN stores s ON s.id = l.store_id
		LEFT JOIN listing_enrichment le ON le.listing_id = l.id
		LEFT JOIN pdp_snapshots ps ON ps.listing_id = l.id
		WHERE l.product_url IS NOT NULL AND l.product_url != ''` + listingVisibilityGate

	args := []interface{}{}
	argNum := 1

	if filter.StoreType != "" {
		base += fmt.Sprintf(" AND s.store_type = $%d", argNum)
		args = append(args, filter.StoreType)
		argNum++
	} else {
		base += fmt.Sprintf(" AND s.store_type = ANY($%d)", argNum)
		args = append(args, pq.Array(StoreTypesWithEnrichers))
		argNum++
	}
	if len(filter.CanonicalCategory) > 0 {
		base += fmt.Sprintf(" AND l.canonical_category = $%d", argNum)
		args = append(args, pq.Array(filter.CanonicalCategory))
		argNum++
	}
	if filter.LlmConfidenceBelow != nil {
		base += fmt.Sprintf(" AND (l.metadata->'llm_category'->>'confidence')::float < $%d", argNum)
		args = append(args, *filter.LlmConfidenceBelow)
		argNum++
	}

	switch step {
	case enrichstate.StepPDP:
		base += fmt.Sprintf(`
			AND COALESCE(le.pdp_dead, false) = false
			AND (le.next_pdp_attempt_at IS NULL OR le.next_pdp_attempt_at <= $%d)`, argNum)
		args = append(args, now)
		argNum++
		if !force {
			base += ` AND (le.pdp_fetched_at IS NULL OR le.pdp_fetched_at < NOW() - INTERVAL '7 days')`
		}
		base += `
			ORDER BY le.pdp_fetched_at NULLS FIRST, l.last_scraped DESC`
	case enrichstate.StepClassify:
		base += fmt.Sprintf(`
			AND le.pdp_fetched_at IS NOT NULL
			AND COALESCE(le.classify_dead, false) = false
			AND (le.next_classify_attempt_at IS NULL OR le.next_classify_attempt_at <= $%d)
			AND ps.listing_id IS NOT NULL
			AND COALESCE((ps.payload->>'unavailable')::boolean, false) = false`, argNum)
		args = append(args, now)
		argNum++
		if !force {
			base += `
			AND (
				le.classified_at IS NULL
				OR le.pdp_hash IS DISTINCT FROM ps.content_hash
				OR EXISTS (
					SELECT 1 FROM llm_prompt_profiles lp
					WHERE lp.category_id = l.category_id AND lp.enabled = true
						AND (le.prompt_profile_version IS NULL OR le.prompt_profile_version < lp.updated_at)
				)
			)`
		}
		base += `
			ORDER BY le.classified_at NULLS FIRST, l.last_scraped DESC`
	case enrichstate.StepExtract:
		base += fmt.Sprintf(`
			AND le.pdp_fetched_at IS NOT NULL
			AND l.canonical_category IS NOT NULL AND cardinality(l.canonical_category) > 0
			AND COALESCE(le.extract_dead, false) = false
			AND (le.next_extract_attempt_at IS NULL OR le.next_extract_attempt_at <= $%d)
			AND ps.listing_id IS NOT NULL
			AND COALESCE((ps.payload->>'unavailable')::boolean, false) = false`, argNum)
		args = append(args, now)
		argNum++
		if !force {
			base += `
			AND (
				le.extracted_at IS NULL
				OR le.pdp_hash IS DISTINCT FROM ps.content_hash
				OR EXISTS (
					SELECT 1 FROM llm_prompt_profiles lp
					WHERE lp.category_id = l.category_id AND lp.enabled = true
						AND (le.prompt_profile_version IS NULL OR le.prompt_profile_version < lp.updated_at)
				)
			)`
		}
		base += `
			ORDER BY le.extracted_at NULLS FIRST, l.last_scraped DESC`
	default:
		return nil, fmt.Errorf("unknown step %q", step)
	}

	base += fmt.Sprintf(" LIMIT $%d", argNum)
	args = append(args, limit)

	rows, err := s.DB.pool.Query(ctx, base, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []enrichstate.WorkItem
	for rows.Next() {
		var w enrichstate.WorkItem
		if err := rows.Scan(&w.ListingID, &w.StoreID, &w.StoreType, &w.ProductURL, &w.StoreSKU); err != nil {
			return nil, err
		}
		items = append(items, w)
	}
	return items, rows.Err()
}

func (s EnrichmentStateStore) RecordStepSuccess(ctx context.Context, listingID int, step enrichstate.Step, meta enrichstate.StepSuccessMeta, completedAt time.Time) error {
	switch step {
	case enrichstate.StepPDP:
		_, err := s.DB.pool.Exec(ctx, `
			UPDATE listing_enrichment SET
				pdp_fetched_at = $2,
				pdp_hash = $3,
				pdp_attempts = 0,
				pdp_error = NULL,
				next_pdp_attempt_at = NULL,
				pdp_dead = false,
				updated_at = NOW()
			WHERE listing_id = $1
		`, listingID, completedAt, nullIfEmpty(meta.PDPHash))
		return err
	case enrichstate.StepClassify:
		_, err := s.DB.pool.Exec(ctx, `
			UPDATE listing_enrichment SET
				classified_at = $2,
				classify_attempts = 0,
				classify_error = NULL,
				next_classify_attempt_at = NULL,
				classify_dead = false,
				pdp_hash = COALESCE($3, pdp_hash),
				llm_confidence = $4,
				prompt_profile_version = $5,
				updated_at = NOW()
			WHERE listing_id = $1
		`, listingID, completedAt, nullIfEmpty(meta.PDPHash), meta.LLMConfidence, meta.PromptProfileVersion)
		return err
	case enrichstate.StepExtract:
		_, err := s.DB.pool.Exec(ctx, `
			UPDATE listing_enrichment SET
				extracted_at = $2,
				extract_attempts = 0,
				extract_error = NULL,
				next_extract_attempt_at = NULL,
				extract_dead = false,
				pdp_hash = COALESCE($3, pdp_hash),
				prompt_profile_version = COALESCE($4, prompt_profile_version),
				updated_at = NOW()
			WHERE listing_id = $1
		`, listingID, completedAt, nullIfEmpty(meta.PDPHash), meta.PromptProfileVersion)
		return err
	default:
		return fmt.Errorf("unknown step %q", step)
	}
}

func (s EnrichmentStateStore) RecordStepFailure(ctx context.Context, listingID int, step enrichstate.Step, errMsg string, nextAttempt time.Time, dead bool) error {
	if err := s.EnsureRow(ctx, listingID); err != nil {
		return err
	}
	switch step {
	case enrichstate.StepPDP:
		_, err := s.DB.pool.Exec(ctx, `
			UPDATE listing_enrichment SET
				pdp_attempts = pdp_attempts + 1,
				pdp_error = $2,
				next_pdp_attempt_at = $3,
				pdp_dead = $4,
				updated_at = NOW()
			WHERE listing_id = $1
		`, listingID, errMsg, nextAttempt, dead)
		return err
	case enrichstate.StepClassify:
		_, err := s.DB.pool.Exec(ctx, `
			UPDATE listing_enrichment SET
				classify_attempts = classify_attempts + 1,
				classify_error = $2,
				next_classify_attempt_at = $3,
				classify_dead = $4,
				updated_at = NOW()
			WHERE listing_id = $1
		`, listingID, errMsg, nextAttempt, dead)
		return err
	case enrichstate.StepExtract:
		_, err := s.DB.pool.Exec(ctx, `
			UPDATE listing_enrichment SET
				extract_attempts = extract_attempts + 1,
				extract_error = $2,
				next_extract_attempt_at = $3,
				extract_dead = $4,
				updated_at = NOW()
			WHERE listing_id = $1
		`, listingID, errMsg, nextAttempt, dead)
		return err
	default:
		return fmt.Errorf("unknown step %q", step)
	}
}

func (s EnrichmentStateStore) ResetStep(ctx context.Context, listingID int, step enrichstate.Step) error {
	if err := s.EnsureRow(ctx, listingID); err != nil {
		return err
	}
	switch step {
	case enrichstate.StepPDP:
		_, err := s.DB.pool.Exec(ctx, `
			UPDATE listing_enrichment SET
				pdp_fetched_at = NULL, pdp_hash = NULL, pdp_attempts = 0, pdp_error = NULL,
				next_pdp_attempt_at = NULL, pdp_dead = false,
				classified_at = NULL, classify_attempts = 0, classify_error = NULL,
				next_classify_attempt_at = NULL, classify_dead = false,
				extracted_at = NULL, extract_attempts = 0, extract_error = NULL,
				next_extract_attempt_at = NULL, extract_dead = false,
				updated_at = NOW()
			WHERE listing_id = $1
		`, listingID)
		return err
	case enrichstate.StepClassify:
		_, err := s.DB.pool.Exec(ctx, `
			UPDATE listing_enrichment SET
				classified_at = NULL, classify_attempts = 0, classify_error = NULL,
				next_classify_attempt_at = NULL, classify_dead = false,
				updated_at = NOW()
			WHERE listing_id = $1
		`, listingID)
		return err
	case enrichstate.StepExtract:
		_, err := s.DB.pool.Exec(ctx, `
			UPDATE listing_enrichment SET
				extracted_at = NULL, extract_attempts = 0, extract_error = NULL,
				next_extract_attempt_at = NULL, extract_dead = false,
				updated_at = NOW()
			WHERE listing_id = $1
		`, listingID)
		return err
	default:
		return fmt.Errorf("unknown step %q", step)
	}
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// EnrichmentSnapshotStore implements enrichstate.SnapshotStore.
type EnrichmentSnapshotStore struct {
	DB *DB
}

func (s EnrichmentSnapshotStore) Save(ctx context.Context, snap enrichstate.Snapshot) error {
	payload, err := json.Marshal(snap.Payload)
	if err != nil {
		return err
	}
	_, err = s.DB.pool.Exec(ctx, `
		INSERT INTO pdp_snapshots (listing_id, payload, content_hash, fetched_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (listing_id) DO UPDATE SET
			payload = EXCLUDED.payload,
			content_hash = EXCLUDED.content_hash,
			fetched_at = EXCLUDED.fetched_at
	`, snap.ListingID, payload, snap.ContentHash, snap.FetchedAt)
	return err
}

func (s EnrichmentSnapshotStore) Get(ctx context.Context, listingID int) (*enrichstate.Snapshot, error) {
	var payload []byte
	var hash string
	var fetchedAt time.Time
	err := s.DB.pool.QueryRow(ctx, `
		SELECT payload, content_hash, fetched_at FROM pdp_snapshots WHERE listing_id = $1
	`, listingID).Scan(&payload, &hash, &fetchedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	var p enrichstate.SnapshotPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return nil, err
	}
	return &enrichstate.Snapshot{
		ListingID:   listingID,
		Payload:     p,
		ContentHash: hash,
		FetchedAt:   fetchedAt,
	}, nil
}

// EnrichmentEventRecorder implements enrichstate.EventRecorder.
type EnrichmentEventRecorder struct {
	DB *DB
}

func (r EnrichmentEventRecorder) Record(ctx context.Context, ev enrichstate.Event) error {
	_, err := r.DB.pool.Exec(ctx, `
		INSERT INTO enrichment_events (listing_id, step, status, error, model, confidence, duration_ms, job_id)
		VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6, $7, $8)
	`, ev.ListingID, string(ev.Step), string(ev.Status), ev.Error, ev.Model, ev.Confidence, ev.DurationMs, ev.JobID)
	return err
}

// EnrichmentStepMetrics is per-step pipeline health for admin.
type EnrichmentStepMetrics struct {
	Steps               []EnrichmentStepStat `json:"steps"`
	ConfidenceHistogram []ConfidenceBucket   `json:"confidence_histogram"`
	LowConfidenceCount  int                  `json:"low_confidence_count"`
	Days                int                  `json:"days"`
}

type EnrichmentStepStat struct {
	Step           string  `json:"step"`
	Backlog        int     `json:"backlog"`
	Dead           int     `json:"dead"`
	SuccessCount   int     `json:"success_count"`
	FailureCount   int     `json:"failure_count"`
	SkippedCount   int     `json:"skipped_count"`
	SuccessRatePct float64 `json:"success_rate_pct"`
}

type ConfidenceBucket struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

// GetEnrichmentStepMetrics aggregates step backlog and recent event outcomes.
func (db *DB) GetEnrichmentStepMetrics(ctx context.Context, days int) (EnrichmentStepMetrics, error) {
	if days <= 0 {
		days = 7
	}
	if days > 90 {
		days = 90
	}
	var out EnrichmentStepMetrics
	out.Days = days

	backlog, err := db.enrichmentStepBacklog(ctx)
	if err != nil {
		return out, err
	}
	out.Steps = backlog

	rows, err := db.pool.Query(ctx, `
		SELECT step,
			COUNT(*) FILTER (WHERE status = 'success')::int,
			COUNT(*) FILTER (WHERE status = 'failure')::int,
			COUNT(*) FILTER (WHERE status = 'skipped')::int
		FROM enrichment_events
		WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
		GROUP BY step
	`, days)
	if err != nil {
		return out, err
	}
	defer rows.Close()

	statsByStep := map[string]*EnrichmentStepStat{}
	for i := range out.Steps {
		statsByStep[out.Steps[i].Step] = &out.Steps[i]
	}
	for rows.Next() {
		var step string
		var success, failure, skipped int
		if err := rows.Scan(&step, &success, &failure, &skipped); err != nil {
			return out, err
		}
		st, ok := statsByStep[step]
		if !ok {
			st = &EnrichmentStepStat{Step: step}
			out.Steps = append(out.Steps, *st)
			statsByStep[step] = &out.Steps[len(out.Steps)-1]
			st = statsByStep[step]
		}
		st.SuccessCount = success
		st.FailureCount = failure
		st.SkippedCount = skipped
		total := success + failure
		if total > 0 {
			st.SuccessRatePct = float64(success) * 100 / float64(total)
		}
	}
	if err := rows.Err(); err != nil {
		return out, err
	}

	err = db.pool.QueryRow(ctx, `
		SELECT COUNT(*) FILTER (WHERE llm_confidence IS NOT NULL AND llm_confidence < 0.5)::int
		FROM listing_enrichment le
		JOIN store_listings l ON l.id = le.listing_id
		WHERE l.is_in_stock = true AND l.hidden = false AND le.classified_at IS NOT NULL
	`).Scan(&out.LowConfidenceCount)
	if err != nil && err != pgx.ErrNoRows {
		return out, err
	}

	histRows, err := db.pool.Query(ctx, `
		SELECT
			CASE
				WHEN llm_confidence >= 0.8 THEN 'high (>=0.8)'
				WHEN llm_confidence >= 0.5 THEN 'medium (0.5-0.8)'
				ELSE 'low (<0.5)'
			END AS bucket,
			COUNT(*)::int
		FROM listing_enrichment le
		JOIN store_listings l ON l.id = le.listing_id
		WHERE l.is_in_stock = true AND l.hidden = false
			AND le.llm_confidence IS NOT NULL
		GROUP BY 1
		ORDER BY 1
	`)
	if err != nil {
		return out, err
	}
	defer histRows.Close()
	for histRows.Next() {
		var b ConfidenceBucket
		if err := histRows.Scan(&b.Label, &b.Count); err != nil {
			return out, err
		}
		out.ConfidenceHistogram = append(out.ConfidenceHistogram, b)
	}
	if out.ConfidenceHistogram == nil {
		out.ConfidenceHistogram = []ConfidenceBucket{}
	}
	return out, histRows.Err()
}

func (db *DB) enrichmentStepBacklog(ctx context.Context) ([]EnrichmentStepStat, error) {
	type row struct {
		step    string
		backlog int
		dead    int
	}
	var stats []EnrichmentStepStat
	queries := []struct {
		step  string
		query string
	}{
		{
			step: string(enrichstate.StepPDP),
			query: `
				SELECT
					COUNT(*) FILTER (WHERE le.pdp_fetched_at IS NULL OR le.pdp_fetched_at < NOW() - INTERVAL '7 days')::int,
					COUNT(*) FILTER (WHERE le.pdp_dead)::int
				FROM store_listings l
				JOIN stores s ON s.id = l.store_id
				LEFT JOIN listing_enrichment le ON le.listing_id = l.id
				WHERE l.is_in_stock = true AND l.hidden = false
					AND l.product_url IS NOT NULL AND l.product_url != ''
					AND s.store_type = ANY($1)
					AND COALESCE(le.pdp_dead, false) = false
			`,
		},
		{
			step: string(enrichstate.StepClassify),
			query: `
				SELECT
					COUNT(*) FILTER (WHERE le.classified_at IS NULL OR le.pdp_hash IS DISTINCT FROM ps.content_hash)::int,
					COUNT(*) FILTER (WHERE le.classify_dead)::int
				FROM store_listings l
				JOIN stores s ON s.id = l.store_id
				JOIN listing_enrichment le ON le.listing_id = l.id
				LEFT JOIN pdp_snapshots ps ON ps.listing_id = l.id
				WHERE l.is_in_stock = true AND l.hidden = false
					AND le.pdp_fetched_at IS NOT NULL
					AND COALESCE((ps.payload->>'unavailable')::boolean, false) = false
					AND s.store_type = ANY($1)
			`,
		},
		{
			step: string(enrichstate.StepExtract),
			query: `
				SELECT
					COUNT(*) FILTER (WHERE le.extracted_at IS NULL OR le.pdp_hash IS DISTINCT FROM ps.content_hash)::int,
					COUNT(*) FILTER (WHERE le.extract_dead)::int
				FROM store_listings l
				JOIN stores s ON s.id = l.store_id
				JOIN listing_enrichment le ON le.listing_id = l.id
				LEFT JOIN pdp_snapshots ps ON ps.listing_id = l.id
				WHERE l.is_in_stock = true AND l.hidden = false
					AND le.pdp_fetched_at IS NOT NULL
					AND l.canonical_category IS NOT NULL AND cardinality(l.canonical_category) > 0
					AND COALESCE((ps.payload->>'unavailable')::boolean, false) = false
					AND s.store_type = ANY($1)
			`,
		},
	}
	for _, q := range queries {
		var backlog, dead int
		if err := db.pool.QueryRow(ctx, q.query, pq.Array(StoreTypesWithEnrichers)).Scan(&backlog, &dead); err != nil {
			return nil, err
		}
		stats = append(stats, EnrichmentStepStat{Step: q.step, Backlog: backlog, Dead: dead})
	}
	return stats, nil
}

// EnrichmentListingStore adapts *DB to enrichstate.ListingStore.
type EnrichmentListingStore struct {
	DB *DB
}

func (s EnrichmentListingStore) UpdateListingEnrichment(ctx context.Context, id int, categoryPath []string, rawSpecs map[string]string, unavailable bool, description *string) error {
	return s.DB.UpdateListingEnrichment(ctx, id, categoryPath, rawSpecs, unavailable, description)
}

func (s EnrichmentListingStore) GetListingForLLM(ctx context.Context, listingID int) (*enrichstate.ListingLLMView, error) {
	l, err := s.DB.GetListingForLLM(ctx, listingID)
	if err != nil || l == nil {
		return nil, err
	}
	return &enrichstate.ListingLLMView{CanonicalCategory: l.CanonicalCategory}, nil
}

func (s EnrichmentListingStore) GetListingForCategoryClassification(ctx context.Context, listingID int) (*enrichstate.ListingClassifyView, error) {
	l, err := s.DB.GetListingForCategoryClassification(ctx, listingID)
	if err != nil || l == nil {
		return nil, err
	}
	return &enrichstate.ListingClassifyView{Metadata: l.Metadata}, nil
}

func (s EnrichmentListingStore) GetPromptProfileUpdatedAt(ctx context.Context, canonicalCategory []string) (*time.Time, error) {
	p, err := s.DB.GetLLMPromptProfileForCategory(ctx, canonicalCategory)
	if err != nil || p == nil || p.UpdatedAt.IsZero() {
		return nil, err
	}
	ts := p.UpdatedAt
	return &ts, nil
}

// ResetListingEnrichmentStep clears step state for admin retry (idempotent).
func (db *DB) ResetListingEnrichmentStep(ctx context.Context, listingID int, step enrichstate.Step) error {
	store := EnrichmentStateStore{DB: db}
	return store.ResetStep(ctx, listingID, step)
}

// ListingExists reports whether a store_listings row exists.
func (db *DB) ListingExists(ctx context.Context, listingID int) (bool, error) {
	var n int
	err := db.pool.QueryRow(ctx, `SELECT 1 FROM store_listings WHERE id = $1`, listingID).Scan(&n)
	if err != nil {
		if err == pgx.ErrNoRows {
			return false, nil
		}
		return false, err
	}
	return true, nil
}
