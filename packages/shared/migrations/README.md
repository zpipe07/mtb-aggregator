# Database Migrations

Migrations are applied manually. For initial setup, run `schema.sql` and `seed.sql` from the parent directory.

## Adding New Migrations

1. Create a new file: `NNN_description.sql` (e.g. `002_add_foo_column.sql`)
2. Use additive SQL only: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc.
3. Run manually: `psql $DATABASE_URL -f packages/shared/migrations/NNN_description.sql`
