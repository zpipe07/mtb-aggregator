# AGENTS.md

## Cursor Cloud specific instructions

Cloud agents use [`.cursor/environment.json`](.cursor/environment.json) and [`.cursor/Dockerfile`](.cursor/Dockerfile): Ubuntu 24.04, Node 20, pnpm 9.14.2, Go 1.26.6 at `/usr/local/go`. The install script runs `pnpm install --frozen-lockfile`, builds `@mtb-aggregator/logging`, `go mod download` in `apps/api`, and **builds the CodeGraph index** (`.cursor/codegraph-setup.sh`). `start` refreshes that index for the checked-out revision. Do not start Postgres, Playwright, or Docker Compose unless the task needs them.

**CodeGraph on this VM:** the CLI is installed during the environment Build (`codegraph` on PATH). Cloud agents usually do **not** get the desktop MCP server from [`.cursor/mcp.json`](.cursor/mcp.json). For any “how does X work / what calls Y / blast radius” question, run this **before** Grep or opening large files (`db.go`, `scheduler.go`, `handlers.go`):

```bash
codegraph explore "<symbol names or question>"
```

If `codegraph` is missing or `codegraph status` is empty, run `bash .cursor/codegraph-setup.sh` (installs to `~/.local` when `/usr/local` is not writable). Do not skip CodeGraph and fall back to reading 30–100 KB files first.

Sentry → draft PR automation (ZAC-210) is specified in [docs/ideas/sentry-to-pr-automation.md](docs/ideas/sentry-to-pr-automation.md). Create/edit that automation in the Agents Window (`/automate`). For web changes run `pnpm --filter @mtb-aggregator/web exec tsc --noEmit` and `pnpm --filter @mtb-aggregator/web run test`. For API changes run `cd apps/api && go test ./...` (and `go vet ./...` if cheap). If those cannot run, do not open a PR.

### Prerequisites on the VM

- **Go 1.26+** is required (`apps/api/go.mod` pins `go 1.26.0`). Prefer `/usr/local/go/bin` from the cloud Dockerfile (1.26.6). If you are on a VM without that image, install Go 1.26.6 if missing.
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
| CodeGraph index | `bash .cursor/codegraph-setup.sh` (or `make codegraph-init` if CLI is on PATH). See [docs/ideas/codegraph-zac-290.md](docs/ideas/codegraph-zac-290.md) |

### Hello-world E2E check

1. Postgres + API + scraper + web running (ports above).
2. `curl -X POST 'http://localhost:8080/scrape-now?store=worldwidecyclery'` — scrape runs in background (~1–3 min).
3. `curl 'http://localhost:8080/deals?limit=5'` — should return listings.
4. Browser: `http://localhost:3001/deals` — deal cards with filters and pagination.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

This repo adopted CodeGraph (ZAC-290). If `.codegraph/codegraph.db` is missing, run `bash .cursor/codegraph-setup.sh` rather than skipping.
<!-- CODEGRAPH_END -->
