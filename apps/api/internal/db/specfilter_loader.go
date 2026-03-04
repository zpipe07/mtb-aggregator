package db

import (
	"context"

	"github.com/mtb-aggregator/api/internal/specfilter"
)

// specFilterConfigLoader adapts *DB to specfilter.ConfigLoader.
type specFilterConfigLoader struct {
	db *DB
}

// SpecFilterConfigLoader returns a ConfigLoader that loads from this DB.
func (db *DB) SpecFilterConfigLoader() specfilter.ConfigLoader {
	return &specFilterConfigLoader{db: db}
}

func (l *specFilterConfigLoader) ListSpecFilterConfigs(ctx context.Context) ([]specfilter.SpecFilterConfigRow, error) {
	rows, err := l.db.ListSpecFilterConfigs(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]specfilter.SpecFilterConfigRow, len(rows))
	for i, r := range rows {
		out[i] = specfilter.SpecFilterConfigRow{
			SpecKey:      r.SpecKey,
			Visible:      r.Visible,
			MergeInto:    r.MergeInto,
			DisplayLabel: r.DisplayLabel,
			SortOrder:    r.SortOrder,
		}
	}
	return out, nil
}

func (l *specFilterConfigLoader) ListSpecValueAliases(ctx context.Context, specKey string) ([]specfilter.SpecValueAliasRow, error) {
	rows, err := l.db.ListSpecValueAliases(ctx, specKey)
	if err != nil {
		return nil, err
	}
	out := make([]specfilter.SpecValueAliasRow, len(rows))
	for i, r := range rows {
		out[i] = specfilter.SpecValueAliasRow{
			SpecKey:      r.SpecKey,
			RawValue:     r.RawValue,
			DisplayValue: r.DisplayValue,
		}
	}
	return out, nil
}
