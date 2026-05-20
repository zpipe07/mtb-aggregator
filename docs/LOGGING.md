# Logging

All services emit **one JSON object per line** to stdout. The format is shared across the API (Go), scraper (Node), and web (Next.js) so logs parse consistently in Render, Vercel, or any log drain.

## Schema

| Field | Required | Description |
|-------|----------|-------------|
| `ts` | yes | RFC3339 timestamp with milliseconds |
| `level` | yes | `debug`, `info`, `warn`, `error` |
| `service` | yes | `api`, `scraper`, or `web` |
| `component` | yes | Subsystem: `http`, `scheduler`, `enrichment`, `startup`, `parser`, etc. |
| `msg` | yes | Human-readable summary |
| `request_id` | when available | From `X-Request-ID` / Render request ID |
| `duration_ms` | timed ops | Elapsed milliseconds |
| `store` | scrape/enrich | Store slug |
| `listing_id` | enrichment | Listing primary key |
| `err` | errors | Error message string |
| `status` | HTTP | Response status code |
| `method` | HTTP | HTTP method |
| `path` | HTTP | Request path |
| `client_ip` | HTTP | Best-effort client IP |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Minimum level: `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | `json` | `json` or `text` (compact single-line for local tailing) |
| `LOG_HTTP_ACCESS` | `auto` | `auto` (off on Render/Vercel), `on`, or `off` |

Set these in the repo root `.env` for local dev; configure the same keys on Render/Vercel per service.

## HTTP access logs

**Do not duplicate platform access logs in production.**

- **Render (API):** Render already logs each request with `clientIP`, `requestID`, `responseTimeMS`, and `responseBytes`. App-level access logging is **off** when `LOG_HTTP_ACCESS=auto` and `RENDER=true`.
- **Vercel (web):** Vercel logs HTTP at the edge; the web app does not add access middleware.
- **Local dev:** With `LOG_HTTP_ACCESS=on` (or `auto` outside Render/Vercel), the API and scraper emit one structured access line per request. `/health` is always skipped.

## Examples

**Scheduler scrape completed:**

```json
{"ts":"2026-05-20T22:32:51.123Z","level":"info","service":"api","component":"scheduler","msg":"scrape saved listings","store":"jensonusa","count":142}
```

**Local API request (access logging on):**

```json
{"ts":"2026-05-20T22:32:51.123Z","level":"info","service":"api","component":"http","msg":"request","method":"GET","path":"/deals/7305","status":200,"duration_ms":200,"client_ip":"127.0.0.1","request_id":"355a99c1-94ed-4618"}
```

**Scraper route:**

```json
{"ts":"2026-05-20T22:32:51.123Z","level":"info","service":"scraper","component":"scraper","msg":"scrape completed","store":"worldwidecyclery","count":87,"duration_ms":12400}
```

## Render tips

- **App logs only:** search `service:api` or `"service":"api"` to skip Render's native access lines.
- **Errors:** `"level":"error"` or search `level:error`.
- **Jobs:** `"component":"scheduler"` or `"component":"enrichment"`.
- **Correlate:** match app `request_id` to Render's `requestID` when debugging a single request.
- **Reduce noise:** set `LOG_LEVEL=warn` on production if info-level scheduler logs are too verbose; per-listing enrichment detail is logged at `debug`.

## Implementation

| App | Package / module |
|-----|------------------|
| API | `apps/api/internal/logutil` (`log/slog`) |
| Scraper, web | `@mtb-aggregator/logging` (`packages/logging`, pino) |

Sentry remains the path for operational errors and alerts; stdout logs are for tailing, search, and job progress.
