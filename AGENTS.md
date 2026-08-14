# AGENTS.md

## Cursor Cloud specific instructions

Cloud agents use [`.cursor/environment.json`](.cursor/environment.json) and [`.cursor/Dockerfile`](.cursor/Dockerfile): Ubuntu 24.04, Node 20, pnpm 9.14.2, Go 1.26.5 at `/usr/local/go`. The install script runs `pnpm install --frozen-lockfile`, builds `@mtb-aggregator/logging`, and `go mod download` in `apps/api`. Do not start Postgres, Playwright, or Docker Compose unless the task needs them.

Sentry → draft PR automation (ZAC-210) is specified in [docs/ideas/sentry-to-pr-automation.md](docs/ideas/sentry-to-pr-automation.md). Create/edit that automation in the Agents Window (`/automate`). For web changes run `pnpm --filter @mtb-aggregator/web exec tsc --noEmit` and `pnpm --filter @mtb-aggregator/web run test`. For API changes run `cd apps/api && go test ./...` (and `go vet ./...` if cheap). If those cannot run, do not open a PR.

### Prerequisites on the VM

- **Go 1.26+** is required (`apps/api/go.mod` pins `go 1.26.0`). Prefer `/usr/local/go/bin` from the cloud Dockerfile (1.26.5). If you are on a VM without that image, install Go 1.26.5 if missing.
- **Docker** runs Postgres via `docker-compose.yml`. In this environment, start `dockerd` manually if needed and use `sudo docker compose` (or `sudo chmod 666 /var/run/docker.sock`) when the socket is root-only.
- **Playwright Chromium** must be installed once for the scraper: `pnpm --filter @mtb-aggregator/scraper exec playwright install chromium --with-deps`. Not part of the default cloud install (Sentry autofix v1 does not touch the scraper).

### Workspace package build

`@mtb-aggregator/logging` must be compiled before scraper/web start or build (otherwise `ERR_MODULE_NOT_FOUND` / Vercel `pnpm run build` exit 1). The web and scraper packages run **`prebuild` → `build:deps`** automatically on `pnpm run build`; for dev servers, build logging once if needed:

```bash
pnpm --filter @mtb-aggregator/logging run build
```

### Port allocation (important)

Scraper and Next.js both default to **port 3000**. Start **scraper first**, then web with an explicit port:

```bash
# Terminal: scraper (3000)
pnpm --filter @mtb-aggregator/scraper run dev

# Terminal: API (8080)
cd apps/api && DATABASE_URL=postgres://mtb:mtb@localhost:5432/mtb_deals go run main.go

# Terminal: web (3001)
PORT=3001 pnpm --filter @mtb-aggregator/web run dev
```

Web proxies `/api/*` → `http://localhost:8080` via `apps/web/next.config.ts` rewrites.

### Database bootstrap (first time or fresh volume)

```bash
sudo docker compose up -d db
# schema + seed + incremental migrations (see Makefile)
cat packages/shared/schema.sql | sudo docker compose exec -T db psql -U mtb -d mtb_deals -f -
cat packages/shared/seed.sql | sudo docker compose exec -T db psql -U mtb -d mtb_deals -f -
for f in packages/shared/migrations/*.sql; do cat "$f" | sudo docker compose exec -T db psql -U mtb -d mtb_deals -f -; done
```

Or use `make db-up db-migrate db-seed db-migrate-docker` when Docker socket permissions allow non-sudo `docker compose`.

### Standard commands (see also `CLAUDE.md`, `README.md`)

| Task | Command |
|------|---------|
| Install deps | `make install` |
| Web lint | `pnpm --filter @mtb-aggregator/web run lint` |
| Scraper tests | `pnpm --filter @mtb-aggregator/scraper run test` |
| Go vet | `cd apps/api && go vet ./...` |
| Trigger scrape | `curl -X POST 'http://localhost:8080/scrape-now?store=worldwidecyclery'` |
| API health | `curl http://localhost:8080/health` |
| Scraper health | `curl http://localhost:3000/health` |

### Hello-world E2E check

1. Postgres + API + scraper + web running (ports above).
2. `curl -X POST 'http://localhost:8080/scrape-now?store=worldwidecyclery'` — scrape runs in background (~1–3 min).
3. `curl 'http://localhost:8080/deals?limit=5'` — should return listings.
4. Browser: `http://localhost:3001/deals` — deal cards with filters and pagination.
