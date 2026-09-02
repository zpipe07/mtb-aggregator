package db

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const publicGiveawayCap = 100

type Giveaway struct {
	ID                int
	Slug              string
	Kind              string
	Title             string
	Summary           string
	PrizeName         string
	PrizeDescription  *string
	ImageURL          *string
	HostName          string
	EntryURL          string
	OfficialRulesURL  string
	StartsAt          *time.Time
	EndsAt            time.Time
	Eligibility       *string
	EntryRequirements *string
	TicketPrice       *float64
	TicketCurrency    string
	Beneficiary       *string
	Published         bool
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type GiveawayWrite struct {
	Slug              string
	Kind              string
	Title             string
	Summary           string
	PrizeName         string
	PrizeDescription  *string
	ImageURL          *string
	HostName          string
	EntryURL          string
	OfficialRulesURL  string
	StartsAt          *time.Time
	EndsAt            time.Time
	Eligibility       *string
	EntryRequirements *string
	TicketPrice       *float64
	TicketCurrency    string
	Beneficiary       *string
	Published         bool
}

const giveawaySelectCols = `
	id, slug, kind, title, summary, prize_name, prize_description, image_url,
	host_name, entry_url, official_rules_url, starts_at, ends_at, eligibility,
	entry_requirements, ticket_price, ticket_currency, beneficiary, published,
	created_at, updated_at`

func scanGiveaway(row interface{ Scan(dest ...any) error }) (Giveaway, error) {
	var g Giveaway
	err := row.Scan(
		&g.ID, &g.Slug, &g.Kind, &g.Title, &g.Summary, &g.PrizeName, &g.PrizeDescription, &g.ImageURL,
		&g.HostName, &g.EntryURL, &g.OfficialRulesURL, &g.StartsAt, &g.EndsAt, &g.Eligibility,
		&g.EntryRequirements, &g.TicketPrice, &g.TicketCurrency, &g.Beneficiary, &g.Published,
		&g.CreatedAt, &g.UpdatedAt,
	)
	return g, err
}

func (db *DB) ListPublicGiveaways(ctx context.Context, now time.Time, kind string) ([]Giveaway, error) {
	kind = strings.ToLower(strings.TrimSpace(kind))
	query := `
		SELECT ` + giveawaySelectCols + `
		FROM giveaways
		WHERE published = true
		  AND ends_at >= $1 - INTERVAL '30 days'
	`
	args := []any{now}
	if kind == "giveaway" || kind == "raffle" {
		query += ` AND kind = $2`
		args = append(args, kind)
	}
	query += `
		ORDER BY
		  CASE
		    WHEN ends_at <= $1 THEN 2
		    WHEN starts_at IS NOT NULL AND starts_at > $1 THEN 1
		    ELSE 0
		  END ASC,
		  CASE
		    WHEN ends_at > $1 AND (starts_at IS NULL OR starts_at <= $1) THEN ends_at
		  END ASC NULLS LAST,
		  CASE
		    WHEN starts_at IS NOT NULL AND starts_at > $1 AND ends_at > $1 THEN starts_at
		  END ASC NULLS LAST,
		  CASE
		    WHEN ends_at <= $1 THEN ends_at
		  END DESC NULLS LAST,
		  id ASC
		LIMIT ` + fmt.Sprintf("%d", publicGiveawayCap)

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Giveaway
	for rows.Next() {
		g, err := scanGiveaway(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	if out == nil {
		out = []Giveaway{}
	}
	return out, rows.Err()
}

type ListAdminGiveawaysParams struct {
	Kind      string
	Published *bool
}

func (db *DB) ListAdminGiveaways(ctx context.Context, p ListAdminGiveawaysParams) ([]Giveaway, error) {
	query := `SELECT ` + giveawaySelectCols + ` FROM giveaways WHERE 1=1`
	args := []any{}
	n := 1
	kind := strings.ToLower(strings.TrimSpace(p.Kind))
	if kind == "giveaway" || kind == "raffle" {
		query += fmt.Sprintf(` AND kind = $%d`, n)
		args = append(args, kind)
		n++
	}
	if p.Published != nil {
		query += fmt.Sprintf(` AND published = $%d`, n)
		args = append(args, *p.Published)
	}
	query += ` ORDER BY ends_at DESC, id DESC`

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Giveaway
	for rows.Next() {
		g, err := scanGiveaway(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	if out == nil {
		out = []Giveaway{}
	}
	return out, rows.Err()
}

func (db *DB) GetGiveawayByID(ctx context.Context, id int) (*Giveaway, error) {
	g, err := scanGiveaway(db.pool.QueryRow(ctx, `SELECT `+giveawaySelectCols+` FROM giveaways WHERE id = $1`, id))
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &g, nil
}

func (db *DB) GiveawaySlugTaken(ctx context.Context, slug string, excludeID int) (bool, error) {
	var n int
	err := db.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM giveaways WHERE slug = $1 AND ($2 = 0 OR id <> $2)
	`, slug, excludeID).Scan(&n)
	return n > 0, err
}

func (db *DB) CreateGiveaway(ctx context.Context, w GiveawayWrite) (int, error) {
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO giveaways (
			slug, kind, title, summary, prize_name, prize_description, image_url,
			host_name, entry_url, official_rules_url, starts_at, ends_at, eligibility,
			entry_requirements, ticket_price, ticket_currency, beneficiary, published,
			updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7,
			$8, $9, $10, $11, $12, $13,
			$14, $15, $16, $17, $18,
			NOW()
		) RETURNING id
	`, w.Slug, w.Kind, w.Title, w.Summary, w.PrizeName, w.PrizeDescription, w.ImageURL,
		w.HostName, w.EntryURL, w.OfficialRulesURL, w.StartsAt, w.EndsAt, w.Eligibility,
		w.EntryRequirements, w.TicketPrice, w.TicketCurrency, w.Beneficiary, w.Published,
	).Scan(&id)
	return id, err
}

func (db *DB) UpdateGiveaway(ctx context.Context, id int, w GiveawayWrite) error {
	tag, err := db.pool.Exec(ctx, `
		UPDATE giveaways SET
			slug = $1, kind = $2, title = $3, summary = $4, prize_name = $5,
			prize_description = $6, image_url = $7, host_name = $8, entry_url = $9,
			official_rules_url = $10, starts_at = $11, ends_at = $12, eligibility = $13,
			entry_requirements = $14, ticket_price = $15, ticket_currency = $16,
			beneficiary = $17, published = $18, updated_at = NOW()
		WHERE id = $19
	`, w.Slug, w.Kind, w.Title, w.Summary, w.PrizeName, w.PrizeDescription, w.ImageURL,
		w.HostName, w.EntryURL, w.OfficialRulesURL, w.StartsAt, w.EndsAt, w.Eligibility,
		w.EntryRequirements, w.TicketPrice, w.TicketCurrency, w.Beneficiary, w.Published, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (db *DB) DeleteGiveaway(ctx context.Context, id int) error {
	tag, err := db.pool.Exec(ctx, `DELETE FROM giveaways WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
