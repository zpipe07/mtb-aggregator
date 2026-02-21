# Database Migrations

For initial setup, run `schema.sql` and `seed.sql` from the parent directory.

## Running Migrations (local or remote)

From repo root, with `DATABASE_URL` in `.env` (or in the environment):

```bash
make db-migrate-remote
```

This runs all `*.sql` files in this directory in sorted order using the API’s Go/pgx stack, so it works with Neon and other Postgres (no `psql`/SNI required).

Override the migrations directory: `MIGRATIONS_DIR=path/to/migrations make db-migrate-remote`

## Adding New Migrations

1. Create a new file: `NNN_description.sql` (e.g. `004_add_foo.sql`)
2. Use additive SQL only: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc.
3. Run `make db-migrate-remote` to apply (or run the new file manually)
