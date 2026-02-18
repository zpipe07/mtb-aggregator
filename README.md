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

# Apply database schema
make db-migrate       # If using Docker
make db-migrate-local # If using local Postgres
```

**Without Docker:** If you have PostgreSQL installed locally (e.g. via Homebrew), use `make db-up-local` and `make db-migrate-local`. The API will connect via `postgres://$(whoami)@localhost:5432/mtb_deals`.

### Development

```bash
# Terminal 1: Keep database running
make db-up

# Terminal 2: Run scraper (placeholder for Phase 2)
pnpm --filter @mtb-aggregator/scraper run dev

# Terminal 3: Run API
cd apps/api && go run main.go
```

### Docker

```bash
# Build and run all services
docker compose up --build
```

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
| `make db-migrate-local` | Apply schema (local)   |
| `make dev`     | Start db (see dev workflow)  |
| `make build-all` | Build scraper + API          |
