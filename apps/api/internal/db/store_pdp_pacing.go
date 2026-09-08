package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/lib/pq"
)

// StorePDPPacing holds per-store PDP drainer state.
type StorePDPPacing struct {
	StoreType           string
	ConsecutiveFailures int
	CooldownUntil       *time.Time
	LastFetchAt         *time.Time
}

// GetStorePDPPacing returns pacing fields for a store_type (first matching store row).
func (db *DB) GetStorePDPPacing(ctx context.Context, storeType string) (*StorePDPPacing, error) {
	row := db.pool.QueryRow(ctx, `
		SELECT store_type, pdp_consecutive_failures, pdp_cooldown_until, pdp_last_fetch_at
		FROM stores
		WHERE store_type = $1
		LIMIT 1
	`, storeType)
	var p StorePDPPacing
	err := row.Scan(&p.StoreType, &p.ConsecutiveFailures, &p.CooldownUntil, &p.LastFetchAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &p, nil
}

// IsStoreInPDPCooldown reports whether the store is in a persistent PDP cooldown window.
func (db *DB) IsStoreInPDPCooldown(ctx context.Context, storeType string, now time.Time) (bool, error) {
	p, err := db.GetStorePDPPacing(ctx, storeType)
	if err != nil || p == nil {
		return false, err
	}
	if p.CooldownUntil == nil {
		return false, nil
	}
	return p.CooldownUntil.After(now), nil
}

// CanStoreFetchPDP reports whether the drainer may fetch PDP for this store (cooldown + min interval).
func (db *DB) CanStoreFetchPDP(ctx context.Context, storeType string, now time.Time, minInterval time.Duration) (bool, error) {
	p, err := db.GetStorePDPPacing(ctx, storeType)
	if err != nil || p == nil {
		return true, err
	}
	if p.CooldownUntil != nil && p.CooldownUntil.After(now) {
		return false, nil
	}
	if minInterval > 0 && p.LastFetchAt != nil && now.Sub(*p.LastFetchAt) < minInterval {
		return false, nil
	}
	return true, nil
}

// RecordStorePDPFetch updates pdp_last_fetch_at for all rows with this store_type.
func (db *DB) RecordStorePDPFetch(ctx context.Context, storeType string, now time.Time) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE stores SET pdp_last_fetch_at = $2 WHERE store_type = $1
	`, storeType, now)
	return err
}

// RecordStorePDPSuccess clears consecutive failures and cooldown for the store type.
func (db *DB) RecordStorePDPSuccess(ctx context.Context, storeType string) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE stores
		SET pdp_consecutive_failures = 0,
		    pdp_cooldown_until = NULL
		WHERE store_type = $1
	`, storeType)
	return err
}

// RecordStorePDPFailure increments consecutive failures; trips cooldown at threshold.
// Returns true when cooldown was newly set.
func (db *DB) RecordStorePDPFailure(ctx context.Context, storeType string, threshold int, cooldown time.Duration, now time.Time) (tripped bool, err error) {
	if threshold <= 0 {
		_, err = db.pool.Exec(ctx, `
			UPDATE stores SET pdp_consecutive_failures = pdp_consecutive_failures + 1 WHERE store_type = $1
		`, storeType)
		return false, err
	}
	var failures int
	err = db.pool.QueryRow(ctx, `
		UPDATE stores
		SET pdp_consecutive_failures = pdp_consecutive_failures + 1
		WHERE store_type = $1
		RETURNING pdp_consecutive_failures
	`, storeType).Scan(&failures)
	if err != nil {
		return false, err
	}
	if failures < threshold {
		return false, nil
	}
	coolUntil := now.Add(cooldown)
	tag, err := db.pool.Exec(ctx, `
		UPDATE stores
		SET pdp_cooldown_until = $2
		WHERE store_type = $1 AND (pdp_cooldown_until IS NULL OR pdp_cooldown_until <= $3)
	`, storeType, coolUntil, now)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// ListEnricherStoreTypes returns distinct store_type values for enricher stores.
func (db *DB) ListEnricherStoreTypes(ctx context.Context) ([]string, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT DISTINCT store_type FROM stores
		WHERE store_type = ANY($1)
		ORDER BY store_type
	`, pq.Array(StoreTypesWithEnrichers))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var st string
		if err := rows.Scan(&st); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

// StorePDPPacer implements enrichstate.StorePDPPacer on *DB.
type StorePDPPacer struct {
	DB *DB
}

func (p StorePDPPacer) ShouldSkipPDP(ctx context.Context, storeType string, bypassMinInterval, force bool, now time.Time, minInterval time.Duration) (bool, error) {
	if force {
		return false, nil
	}
	inCooldown, err := p.DB.IsStoreInPDPCooldown(ctx, storeType, now)
	if err != nil {
		return false, err
	}
	if inCooldown {
		return true, nil
	}
	if bypassMinInterval {
		return false, nil
	}
	can, err := p.DB.CanStoreFetchPDP(ctx, storeType, now, minInterval)
	if err != nil {
		return false, err
	}
	return !can, nil
}

func (p StorePDPPacer) CanDrainerFetch(ctx context.Context, storeType string, now time.Time, minInterval time.Duration) (bool, error) {
	return p.DB.CanStoreFetchPDP(ctx, storeType, now, minInterval)
}

func (p StorePDPPacer) RecordPDPFetch(ctx context.Context, storeType string, now time.Time) error {
	return p.DB.RecordStorePDPFetch(ctx, storeType, now)
}

func (p StorePDPPacer) RecordPDPSuccess(ctx context.Context, storeType string) error {
	return p.DB.RecordStorePDPSuccess(ctx, storeType)
}

func (p StorePDPPacer) RecordPDPFailure(ctx context.Context, storeType string, threshold int, cooldown time.Duration, now time.Time) (bool, error) {
	return p.DB.RecordStorePDPFailure(ctx, storeType, threshold, cooldown, now)
}

// ErrUnknownStoreType is returned when no store row exists for a store_type.
var ErrUnknownStoreType = fmt.Errorf("unknown store_type")