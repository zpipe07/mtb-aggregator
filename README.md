# MTB Deal Aggregator

Mountain bike deals aggregator - scrapes deals from retailers and displays them in one place.

## Tech Stack

- **API/Scheduler**: Go
- **Scraper**: Node.js + Playwright
- **Frontend**: React + Vite (Phase 5)
- **Database**: PostgreSQL 16

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Go 1.22+
- Docker (or Docker Compose)

### Setup

```bash
# Install dependencies
make install

# Start the database (choose one)
make db-up        # Docker - requires Docker installed
make db-up-local  # Local Postgres - requires PostgreSQL installed (e.g. brew install postgresql)

# Apply database schema and seed stores
make db-migrate       # If using Docker
make db-seed          # Seed stores (Docker)
make db-migrate-local # If using local Postgres (includes seed)
```

**Without Docker:** If you have PostgreSQL installed locally (e.g. via Homebrew), use `make db-up-local` and `make db-migrate-local`. Set `DATABASE_URL=postgres://$(whoami)@localhost:5432/mtb_deals` when running the API.

### Development

```bash
# Terminal 1: Keep database running
make db-up

# Terminal 2: Run scraper
pnpm --filter @mtb-aggregator/scraper run dev

# Terminal 3: Run API (scheduler + health)
cd apps/api && go run main.go

# Terminal 4: Run web app
pnpm --filter @mtb-aggregator/web run dev
```
Then open http://localhost:5173

### Trigger a scrape manually

```bash
# With API running:
curl -X POST http://localhost:8080/scrape-now
# Or: make scrape-now
```

### Trigger enrichment manually

Enrichment visits product detail pages to extract category from breadcrumbs. Requires API and scraper running.

```bash
make enrich-now
# Or: curl -X POST http://localhost:8080/enrich-now
```

Runs up to 50 listings per batch. Enrichment also runs nightly at 2am (configurable via `ENRICH_CRON_SPEC`).

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /deals` | List deals (`?store=`, `?brand=`, `?min_discount=`, `?limit=`, `?offset=`) |
| `GET /deals/:id` | Single deal by ID |
| `GET /stores` | List stores with deal counts |
| `GET /status` | Health: last scrape per store, scraper reachable |
| `GET /brands` | List distinct brands |
| `POST /scrape-now` | Trigger scrape job |
| `POST /enrich-now` | Trigger enrichment job (PDP category extraction) |

### Testing the Scraper

```bash
# Start the scraper first, then:
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.jensonusa.com/clearance", "store": "jensonusa"}'
```

### Docker

```bash
# Build and run all services
docker compose up --build
```

## Database

### Initial Setup

Run once on a fresh database:

```bash
psql $DATABASE_URL -f packages/shared/schema.sql
psql $DATABASE_URL -f packages/shared/seed.sql
```

With Docker: `make db-migrate` then `make db-seed`.

### Migrations

Future schema changes go in `packages/shared/migrations/` as numbered files (e.g. `002_add_foo.sql`). Run them manually in order. See [packages/shared/migrations/README.md](packages/shared/migrations/README.md).

## Deployment

Deploy to Render (API + scraper), Vercel (web), and Neon (PostgreSQL). See [.cursor/plans/mtb_aggregator_deployment.plan.md](.cursor/plans/mtb_aggregator_deployment.plan.md) for the full plan.

### Quick Setup

1. **Neon** – Create project, run `schema.sql` + `seed.sql`, copy `DATABASE_URL`
2. **Render** – Create two Web Services (API, scraper), connect repo, set env vars:
   - API: `DATABASE_URL`, `SCRAPER_SERVICE_URL`, `SCRAPE_CRON_SPEC=disabled`, `ENRICH_CRON_SPEC=disabled`, `CRON_SECRET` (optional)
   - Scraper: `NODE_ENV=production`, `SCRAPER_MAX_PAGES=5` (or higher). Use **Render Standard** (2GB RAM, $25/mo) for the scraper so Chromium runs locally; see [Scraper: Render Standard](#scraper-render-standard) below.
3. **Vercel** – Connect repo, set `VITE_API_URL` to API URL
4. **External cron** – [cron-job.org](https://cron-job.org): POST `/scrape-now` every 4h, POST `/enrich-now` daily at 02:00 UTC. If `CRON_SECRET` is set, add header `X-Cron-Secret: <secret>`.

Copy `.env.example` to `.env` for local dev. Production secrets go in each platform's dashboard.

### Scraper: Render Standard

The scraper runs Playwright/Chromium to scrape JS-rendered sites (e.g. JensonUSA). Chromium needs ~300MB+ RAM, so the **scraper service should use Render Standard** (2GB, $25/mo), not the free tier (512MB). On Standard, leave `BROWSER_WS_ENDPOINT` unset so the scraper launches Chromium locally; set `SCRAPER_MAX_PAGES=5` or higher to scrape full catalogs. No remote browser service (Browserless/Browserbase) is required.

## Project Structure

```
mtb-aggregator/
├── apps/
│   ├── api/       # Go - scheduler + REST API
│   ├── scraper/   # Node + Playwright
│   └── web/      # React frontend (Phase 5)
├── packages/
│   └── shared/    # Schema, types
├── docker-compose.yml
└── Makefile
```

## Makefile Commands

| Command      | Description                    |
| ------------ | ------------------------------ |
| `make install` | Install all dependencies     |
| `make db-up`   | Start PostgreSQL (Docker)     |
| `make db-up-local` | Use local Postgres (no Docker) |
| `make db-down` | Stop PostgreSQL (Docker)      |
| `make db-migrate` | Apply schema (Docker)      |
| `make db-seed` | Seed stores (Docker)        |
| `make db-migrate-local` | Apply schema + seed (local) |
| `make scrape-now` | Trigger scrape (API must be running) |
| `pnpm --filter @mtb-aggregator/web run dev` | Start React dev server |
| `make dev`     | Start db (see dev workflow)  |
| `make build-all` | Build scraper + API          |
