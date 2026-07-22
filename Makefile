.PHONY: dev db-up db-down db-migrate db-migrate-docker db-seed db-up-local db-migrate-local db-migrate-remote db-seed-remote backfill-brands backfill-canonical-categories backfill-llm-specs backfill-field-library backfill-variant-options backfill-jenson-variants backfill-cc-variants scrape scrape-now scrape-now-wwc scrape-now-revel scrape-now-competitivecyclist scrape-now-ridebicycles scrape-now-thundermountainbikes scrape-now-canyon scrape-now-specialized scrape-now-mackcycle scrape-now-trek scrape-now-universalcycles scrape-now-n1bikes scrape-now-foxracing scrape-now-rideconcepts scrape-now-leatt scrape-now-chromag scrape-now-gravitycartel scrape-now-bell scrape-now-giro scrape-now-bikesonline scrape-now-evo scrape-now-cambriabikes scrape-now-365cycles enrich-now enrich-now-revel enrich-now-competitivecyclist enrich-now-thundermountainbikes enrich-now-canyon enrich-now-specialized enrich-now-mackcycle enrich-now-trek enrich-now-universalcycles enrich-now-n1bikes enrich-now-foxracing enrich-now-rideconcepts enrich-now-leatt enrich-now-chromag enrich-now-gravitycartel enrich-now-bell enrich-now-giro enrich-now-bikesonline enrich-now-evo enrich-now-cambriabikes enrich-now-365cycles build-all install impact-catalog-probe

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

# Clear last_enriched_at on listings whose metadata was wiped by scrape-after-enrich; then run enrich-now FORCE=1
requeue-wiped-enrichment:
	cd apps/api && go run ./cmd/requeue-wiped-enrichment

# Rename ambiguous extraction keys, seed llm_extraction_field_defs, fill llm_prompt_profile_fields (run once after migration 019)
backfill-field-library:
	cd apps/api && go run ./cmd/backfill-field-library

# Populate variant_options from Shopify product JSON for listings missing it (run once after migration 021)
backfill-variant-options:
	cd apps/api && go run ./cmd/backfill-variant-options

# JensonUSA: PDP enrich once per product_group_key, fan out variant_options + is_in_stock (requires scraper service)
backfill-jenson-variants:
	cd apps/api && go run ./cmd/backfill-jenson-variants

# Competitive Cyclist: PDP enrich once per product_url, fan out hasVariant grouping (requires scraper service)
backfill-cc-variants:
	cd apps/api && go run ./cmd/backfill-cc-variants

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

# Scrape only Canyon (requires API running)
scrape-now-canyon:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=canyon"

scrape-now-specialized:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=specialized"

# Scrape only Mack Cycle (requires API running)
scrape-now-mackcycle:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=mackcycle"

# Scrape only Trek (requires API running)
scrape-now-trek:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=trek"

# Scrape only Universal Cycles (requires API running)
scrape-now-universalcycles:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=universalcycles"

# Scrape only N+1 Bikes (requires API running)
scrape-now-n1bikes:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=n1bikes"

# Scrape only Fox Racing (requires API running)
scrape-now-foxracing:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=foxracing"

# Scrape only Ride Concepts (requires API running)
scrape-now-rideconcepts:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=rideconcepts"

# Scrape only Leatt (requires API running)
scrape-now-leatt:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=leatt"

# Scrape only Chromag (requires API running)
scrape-now-chromag:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=chromag"

# Scrape only The Gravity Cartel (requires API running)
scrape-now-gravitycartel:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=gravitycartel"

# Scrape only Bell (requires API running)
scrape-now-bell:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=bell"

# Scrape only Giro (requires API running)
scrape-now-giro:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=giro"

# Scrape only Bikes Online (requires API running)
scrape-now-bikesonline:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=bikesonline"

# Scrape only Evo (requires API running)
scrape-now-evo:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=evo"

# Scrape only Cambria Bikes (requires API running)
scrape-now-cambriabikes:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=cambriabikes"

# Scrape only 365 Cycles (requires API running)
scrape-now-365cycles:
	@curl -s -X POST "http://localhost:8080/scrape-now?store=365cycles"

# Trigger enrichment job manually (requires API and scraper running)
# Add force=1 to re-enrich all listings: make enrich-now FORCE=1
enrich-now:
	@curl -s -X POST "http://localhost:8080/enrich-now$(if $(FORCE),?force=1,)"

# Enrich only Revel Bikes (requires API and scraper running). Optional: FORCE=1
enrich-now-revel:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=revelbikes$(if $(FORCE),&force=1,)"

enrich-now-competitivecyclist:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=competitivecyclist$(if $(FORCE),&force=1,)"

enrich-now-thundermountainbikes:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=thundermountainbikes$(if $(FORCE),&force=1,)"

enrich-now-canyon:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=canyon$(if $(FORCE),&force=1,)"

enrich-now-specialized:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=specialized$(if $(FORCE),&force=1,)"

enrich-now-mackcycle:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=mackcycle$(if $(FORCE),&force=1,)"

enrich-now-trek:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=trek$(if $(FORCE),&force=1,)"

enrich-now-universalcycles:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=universalcycles$(if $(FORCE),&force=1,)"

enrich-now-n1bikes:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=n1bikes$(if $(FORCE),&force=1,)"

enrich-now-foxracing:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=foxracing$(if $(FORCE),&force=1,)"

enrich-now-rideconcepts:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=rideconcepts$(if $(FORCE),&force=1,)"

enrich-now-leatt:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=leatt$(if $(FORCE),&force=1,)"

enrich-now-chromag:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=chromag$(if $(FORCE),&force=1,)"

enrich-now-gravitycartel:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=gravitycartel$(if $(FORCE),&force=1,)"

enrich-now-bell:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=bell$(if $(FORCE),&force=1,)"

enrich-now-giro:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=giro$(if $(FORCE),&force=1,)"

enrich-now-bikesonline:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=bikesonline$(if $(FORCE),&force=1,)"

enrich-now-evo:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=evo$(if $(FORCE),&force=1,)"

enrich-now-cambriabikes:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=cambriabikes$(if $(FORCE),&force=1,)"

enrich-now-365cycles:
	@curl -s -X POST "http://localhost:8080/enrich-now?store=365cycles$(if $(FORCE),&force=1,)"

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
