.PHONY: dev db-up db-down db-migrate db-migrate-docker db-seed db-up-local db-migrate-local db-migrate-remote db-seed-remote backfill-brands backfill-canonical-categories backfill-llm-specs backfill-field-library backfill-variant-options backfill-jenson-variants scrape scrape-now scrape-now-wwc scrape-now-revel scrape-now-competitivecyclist scrape-now-ridebicycles scrape-now-thundermountainbikes enrich-now enrich-now-revel enrich-now-thundermountainbikes build-all install impact-catalog-probe

# Ensure Make can find docker (Docker Desktop CLI locations)
export PATH := /Applications/Docker.app/Contents/Resources/bin:/usr/local/bin:/opt/homebrew/bin:$(PATH)

# Use "docker compose" (v2) or "docker-compose" (v1) - override if needed
DOCKER_COMPOSE ?= docker compose

# Database connection for local Postgres (override if needed: make db-migrate-local DB_USER=myuser)
DB_NAME ?= mtb_deals
DB_USER ?= $(shell whoami)

# Start all services for local development
dev:
	@echo "Starting development environment..."
	@echo "  - Database: make db-up (Docker) or make db-up-local (local Postgres)"
	@echo "  - Scraper: pnpm --filter @mtb-aggregator/scraper run dev"
	@echo "  - API: cd apps/api && go run main.go"
	@echo ""
	@echo "Run 'make db-up' or 'make db-up-local' first, then start scraper and api in separate terminals."

# Start PostgreSQL via Docker (requires Docker)
db-up:
	$(DOCKER_COMPOSE) up -d db
	@echo "Waiting for Postgres to be ready..."
	@sleep 3
	@echo "Database is up. Run 'make db-migrate' to apply schema."

# Stop PostgreSQL (Docker)
db-down:
	$(DOCKER_COMPOSE) down

# Apply database schema via Docker (requires make db-up first)
db-migrate:
	@cat packages/shared/schema.sql | $(DOCKER_COMPOSE) exec -T db psql -U mtb -d mtb_deals -f - || \
		(echo "Error: Run 'make db-up' first to start the database."; exit 1)
	@echo "Run 'make db-seed' to seed stores. Then run 'make db-migrate-docker' for incremental migrations."

# Run incremental migrations (004_currency, 005_scraper_health, etc.) against Docker DB. Run after db-migrate.
db-migrate-docker:
	@for f in $$(ls -1 packages/shared/migrations/*.sql 2>/dev/null | sort); do \
		echo "Running $$f..."; \
		cat $$f | $(DOCKER_COMPOSE) exec -T db psql -U mtb -d mtb_deals -f - || exit 1; \
	done
	@echo "Migrations complete."

# Seed stores (Docker) - run after db-migrate
db-seed:
	@cat packages/shared/seed.sql | $(DOCKER_COMPOSE) exec -T db psql -U mtb -d mtb_deals -f - || \
		(echo "Error: Run 'make db-up' and 'make db-migrate' first."; exit 1)

# Use local Postgres (no Docker) - ensure Postgres is running (e.g. brew services start postgresql)
db-up-local:
	@echo "Using local Postgres. Ensure it's running (e.g. brew services start postgresql)"
	@createdb $(DB_NAME) 2>/dev/null || echo "Database '$(DB_NAME)' may already exist."
	@echo "Run 'make db-migrate-local' to apply schema."

# Apply schema to local Postgres
db-migrate-local:
	@psql -d $(DB_NAME) -f packages/shared/schema.sql
	@psql -d $(DB_NAME) -f packages/shared/seed.sql
	@echo "Schema and seed applied. Connection: postgres://$(DB_USER)@localhost:5432/$(DB_NAME)"

# Run migrations against DATABASE_URL (Neon, etc.). Set DATABASE_URL in .env at repo root.
db-migrate-remote:
	cd apps/api && go run ./cmd/migrate

# Seed stores on remote DB (run after schema/migrations). Uses DATABASE_URL from .env.
db-seed-remote:
	cd apps/api && go run ./cmd/seed

# Normalize existing listing brands using packages/shared/brand_aliases.json (run once after adding brand normalization)
backfill-brands:
	cd apps/api && go run ./cmd/backfill-brands

# Set canonical_category on existing listings from category_path using category_taxonomy.json (run once or after updating mappings)
backfill-canonical-categories:
	cd apps/api && go run ./cmd/backfill-canonical-categories

# Populate metadata.llm_specs from metadata.specs for listings enriched before the llm_specs split (run once after migration 016)
backfill-llm-specs:
	cd apps/api && go run ./cmd/backfill-llm-specs

# Rename ambiguous extraction keys, seed llm_extraction_field_defs, fill llm_prompt_profile_fields (run once after migration 019)
backfill-field-library:
	cd apps/api && go run ./cmd/backfill-field-library

# Populate variant_options from Shopify product JSON for listings missing it (run once after migration 021)
backfill-variant-options:
	cd apps/api && go run ./cmd/backfill-variant-options

# JensonUSA: PDP enrich once per product_group_key, fan out variant_options + is_in_stock (requires scraper service)
backfill-jenson-variants:
	cd apps/api && go run ./cmd/backfill-jenson-variants

# Run scraper manually (for testing)
scrape:
	pnpm --filter @mtb-aggregator/scraper run dev

# Trigger scrape job manually (requires API running). Optional: store=worldwidecyclery to scrape one store.
scrape-now:
	@curl -s -X POST http://localhost:8080/scrape-now

# Scrape only Worldwide Cyclery (requires API running)
scrape-now-wwc:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=worldwidecyclery"

# Scrape only Revel Bikes (requires API running)
scrape-now-revel:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=revelbikes"

# Scrape only Competitive Cyclist (requires API; ingest uses Impact Partner catalog on the API when configured)
scrape-now-competitivecyclist:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=competitivecyclist"

# Scrape only Ride Bicycles (requires API running)
scrape-now-ridebicycles:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=ridebicycles"

# Scrape only Thunder Mountain Bikes (requires API running)
scrape-now-thundermountainbikes:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=thundermountainbikes"

# Trigger enrichment job manually (requires API and scraper running)
# Add force=1 to re-enrich all listings: make enrich-now FORCE=1
enrich-now:
	@curl -s -X POST "http://localhost:8080/enrich-now$(if $(FORCE),?force=1,)"

# Enrich only Revel Bikes (requires API and scraper running). Optional: FORCE=1
enrich-now-revel:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=revelbikes$(if $(FORCE),&force=1,)"

enrich-now-thundermountainbikes:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=thundermountainbikes$(if $(FORCE),&force=1,)"

# Discover Impact catalogs and sample CC catalog items (requires IMPACT_ACCOUNT_SID + IMPACT_AUTH_TOKEN in .env)
impact-catalog-probe:
	cd apps/api && go run ./cmd/impact-catalog-probe

# Build all apps
build-all:
	pnpm --filter @mtb-aggregator/scraper run build
	cd apps/api && go build -o ../../dist/api .

# Install all dependencies
install:
	pnpm install
	cd apps/api && go mod download
