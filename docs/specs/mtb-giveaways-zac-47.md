# Spec: MTB Giveaways & raffles (ZAC-47)

Idea one-pager: [docs/ideas/mtb-giveaways-zac-47.md](../ideas/mtb-giveaways-zac-47.md)

## Objective

Give The Dropper shoppers a curated place to see **open MTB giveaways and raffles** (and recently ended ones) without leaving the deals site — then send them to the **host** to enter. Success is outbound clicks and return visits to `/giveaways`, not running contests ourselves.

**Users**

- **Rider:** scanning deals, notices an open entry, clicks through before it closes.
- **Admin (Zack):** pastes a Pinkbike / brand / shop raffle URL into admin, publishes, unpublishes when needed.

**Job:** “Don’t miss a free bike (or a ticketed raffle) while shopping deals.” SEO/traffic is a bonus of an indexable `/giveaways` page, not a slug farm.

## Tech Stack

Unchanged: Go API (`net/http` + pgx), Next.js 15 App Router public UI, existing admin (TanStack Query + `AdminRequired` Bearer), Postgres via numbered migrations in `packages/shared/migrations/`.

No new runtime dependencies. No image upload (ephemeral filesystem; `image_url` is an https URL). No scraper/parser work.

## Commands

```bash
# Migration (local Docker / remote Neon)
make db-migrate-docker
make db-migrate-remote

# API
cd apps/api && go test ./internal/db ./internal/api -count=1
cd apps/api && go vet ./...

# Web
pnpm --filter @mtb-aggregator/web exec tsc --noEmit
pnpm --filter @mtb-aggregator/web run test
pnpm --filter @mtb-aggregator/web run lint
```

## Project Structure

```
packages/shared/migrations/048_giveaways.sql
apps/api/internal/db/giveaways.go          # queries + Giveaway model
apps/api/internal/api/handlers_giveaways.go
apps/api/internal/api/giveaway_status.go   # derived status (testable, no DB)
apps/api/main.go                           # route registration

apps/web/src/api.ts                        # fetchGiveaways
apps/web/src/lib/giveawayStatus.ts         # client/server status from timestamps
apps/web/src/app/(public)/giveaways/page.tsx
apps/web/src/views/GiveawaysPageContent.tsx
apps/web/src/components/GiveawayCard.tsx
apps/web/src/components/GiveawayCard.stories.tsx
apps/web/src/components/HomeGiveawaysStrip.tsx
apps/web/src/admin/GiveawayManager.tsx
apps/web/src/admin/api.ts                  # admin CRUD client
apps/web/src/app/admin/giveaways/page.tsx
```

## Code Style

Match existing handlers: stdlib mux in `main.go`, JSON in/out, `http.Error` for 4xx/5xx, `sentry.CaptureException` on unexpected 5xx. Admin routes wrapped in `api.AdminRequired`.

```go
const giveawayRecentEndedWindow = 30 * 24 * time.Hour

type GiveawayStatus string

const (
	GiveawayStatusUpcoming GiveawayStatus = "upcoming"
	GiveawayStatusOpen     GiveawayStatus = "open"
	GiveawayStatusEnded    GiveawayStatus = "ended"
)

func DeriveGiveawayStatus(now, startsAt, endsAt time.Time, startsAtSet bool) GiveawayStatus {
	if !endsAt.IsZero() && !now.Before(endsAt) {
		return GiveawayStatusEnded
	}
	if startsAtSet && now.Before(startsAt) {
		return GiveawayStatusUpcoming
	}
	return GiveawayStatusOpen
}
```

Web: semantic tokens, `Button` / `Card` / `Input` primitives, `Link` from `next/link` for internal routes, outbound `<a>` with `rel="noopener noreferrer"` (and `nofollow` on entry CTAs — we do not vouch for the host). New cards get a Storybook story.

## Testing Strategy

| Layer | What | Where |
|-------|------|--------|
| Unit | Status derivation (open / upcoming / ended / window boundary), slugify, URL allowlist (`http`/`https` only) | `giveaway_status_test.go`, `giveawayStatus.test.ts` |
| API | Public list excludes drafts, old ended (>30d), unpublished; sort order; kind filter; validation 400s; unique `slug` / `entry_url` 409 | `handlers_giveaways_test.go` (table-driven; httptest + DB if existing store tests do, otherwise query tests in `internal/db`) |
| Web | Card CTA: Enter vs Get tickets vs Ended vs Opens; raffle price visible; empty state | Vitest on status helper; Storybook states |
| Manual | Admin create three live examples → public page + Home strip + header | Browser after implementation |

No Playwright scraper tests. Coverage: every derived status branch and every public visibility rule.

## Boundaries

**Always**

- Derive `status` from timestamps at **read time** (API) **and** again in the UI from `starts_at` / `ends_at` so ISR/stale HTML cannot show Enter after close.
- Require `official_rules_url` and `entry_url` (`https` preferred; `http` allowed).
- Label raffles distinctly; never use a giveaway CTA on a raffle.
- Report unexpected 5xx to Sentry when DSN is set.
- Update docs listed under [Docs to update on implementation](#docs-to-update-on-implementation).

**Ask first**

- Adding `/giveaways/[slug]` detail routes
- Bot / ingest from Pinkbike or brand pages
- Email capture / Friday Drop provider
- File uploads for prize images
- Third `kind` (`contest`)
- Changing the 30-day window or hiding ended rows entirely

**Never**

- Host entry forms or store entrant PII
- Wrap entry links in affiliate templates by default (not a deal SKU)
- Name the product/nav “Raffles”
- Scrape contest sites in this issue
- Ship a signup form that posts nowhere

## Success Criteria

- [ ] Published open/upcoming/recently-ended giveaways and raffles appear on `GET /giveaways` and `/giveaways`
- [ ] Drafts and rows ended >30 days ago do not appear on the public API
- [ ] Header **GIVEAWAYS** and footer link exist; Home strip renders only when ≥1 **open** row
- [ ] Giveaway CTA is **Enter on {host}**; raffle CTA is **Get tickets on {host}**; ended/upcoming have no enter CTA
- [ ] Raffle cards show ticket price when set; optional beneficiary line when set
- [ ] Admin can create, edit, unpublish, delete without touching SQL
- [ ] Stale cached Home/list HTML still shows Ended once `ends_at` has passed (client/server derivation)
- [ ] PostHog: `giveaway_page_viewed`, `giveaway_outbound_click` (`id`, `kind`, `status`, `host_name`), kind chips use `filter_applied` (`filter_type: giveaway_kind`)
- [ ] `/giveaways` is in the sitemap; unique title/description; conservative JSON-LD (`CollectionPage` + `ItemList` only — no `Event` / `Offer`)
- [ ] Empty state is designed (no fake contests)
- [ ] `go test ./...`, web `tsc` + `vitest` pass

---

## Data model

Migration **`048_giveaways.sql`** (next number after `047`). Additive only.

```sql
CREATE TABLE IF NOT EXISTS giveaways (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(120) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('giveaway', 'raffle')),
  title VARCHAR(300) NOT NULL,
  summary TEXT NOT NULL,
  prize_name VARCHAR(300) NOT NULL,
  prize_description TEXT,
  image_url TEXT,
  host_name VARCHAR(120) NOT NULL,
  entry_url TEXT NOT NULL,
  official_rules_url TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ NOT NULL,
  eligibility TEXT,
  entry_requirements TEXT,
  ticket_price NUMERIC(10, 2),
  ticket_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  beneficiary TEXT,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slug),
  UNIQUE (entry_url)
);

CREATE INDEX IF NOT EXISTS idx_giveaways_public_list
  ON giveaways (published, ends_at DESC)
  WHERE published = true;
```

| Column | Rules |
|--------|--------|
| `slug` | URL-safe, unique. Admin-editable. Used as in-page `id` on the list (`/giveaways#{slug}`). |
| `kind` | `giveaway` (no purchase to enter) or `raffle` (ticket/payment). File by **how you enter**, not the host headline. A “raffle” that is actually free-to-enter is `giveaway`. |
| `summary` | 1–3 sentences for the card. Required. |
| `prize_name` | Short prize label (“Custom Norco Rampage”). |
| `official_rules_url` | Required. |
| `starts_at` | Nullable. Null means already open (as of `created_at`). |
| `ends_at` | Required. End of entry (inclusive of “open” until this instant). `now >= ends_at` → ended. |
| `ticket_price` | Optional. **Reject on create/update if `kind=giveaway` and price is non-null.** Raffles may omit it. Must be `> 0` when set. |
| `beneficiary` | Optional. e.g. trail org. Display on raffle cards when present. |
| `published` | Draft vs live. Public queries require `true`. |
| `entry_url` | Unique so a later bot can upsert without dupes. |

**Do not store** a status column. **Do not store** winner fields.

### Derived `status`

Computed with `now` (UTC):

| Condition | `status` |
|-----------|----------|
| `now >= ends_at` | `ended` |
| `starts_at` set and `now < starts_at` | `upcoming` |
| else | `open` |

Public list additionally requires:

- `published = true`
- `ends_at >= now() - interval '30 days'`

Admin list: all rows, including drafts and old ended.

### Sort (public)

1. `open` first, then `upcoming`, then `ended`
2. Open: `ends_at ASC` (closing soon first)
3. Upcoming: `starts_at ASC`
4. Ended: `ends_at DESC` (most recently ended first)

---

## API contract

Follow existing JSON + `http.Error` style (`invalid json`, `not found`, `unauthorized`).

### Public

`GET /giveaways`

Query:

- `kind` (optional): `giveaway` \| `raffle`
- No pagination in v1 (volume is small; hard cap 100 in SQL)

Response `200`:

```json
{
  "giveaways": [
    {
      "id": 1,
      "slug": "norco-whistler-rampage",
      "kind": "giveaway",
      "title": "Win a custom Norco Rampage",
      "summary": "Norco and Bicycle Nightmares are giving away a one-of-one Rampage.",
      "prize_name": "Custom Norco Rampage",
      "prize_description": "...",
      "image_url": "https://...",
      "host_name": "Norco",
      "entry_url": "https://www.norco.com/whistler-contest/",
      "official_rules_url": "https://...",
      "starts_at": null,
      "ends_at": "2026-09-15T23:59:59Z",
      "eligibility": "US & Canada, 18+",
      "entry_requirements": "Form + follow @norcobicycles and @bicyclenightmares",
      "ticket_price": null,
      "ticket_currency": "USD",
      "beneficiary": null,
      "status": "open"
    }
  ],
  "open_count": 1,
  "upcoming_count": 0,
  "ended_count": 0
}
```

Do **not** return `published` on the public payload. Counts are after the kind filter.

### Admin (Bearer)

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/admin/giveaways` | All rows; optional `published=true\|false`, `kind=` |
| `POST` | `/admin/giveaways` | Create; `201` `{"id": n}` |
| `GET` | `/admin/giveaways/:id` | One row including `published`, timestamps |
| `PUT` | `/admin/giveaways/:id` | Full replace of editable fields |
| `DELETE` | `/admin/giveaways/:id` | Hard delete (`204`) |

Create/update body: all editable columns. Server trims strings, lowercases `kind`, generates `slug` from `title` if omitted (then suffix `-2` on collision). `updated_at` set on write.

Validation (`400`):

- `kind` not in `giveaway` \| `raffle`
- missing `title`, `summary`, `prize_name`, `host_name`, `entry_url`, `official_rules_url`, `ends_at`
- `entry_url` / `official_rules_url` / `image_url` not `http`/`https`
- `ticket_price` set when `kind=giveaway`
- `ticket_price <= 0` when set
- `ends_at` not a valid RFC3339 timestamp
- `starts_at` after `ends_at`

`409` on unique `slug` or `entry_url`.

Register routes in `apps/api/main.go` next to other public GETs and admin CRUD. 5xx: log + `sentry.CaptureException`.

---

## Web — public

### Naming

| Surface | Copy |
|---------|------|
| Header nav | **GIVEAWAYS** (same uppercase treatment as Home) |
| Footer | Giveaways |
| `<title>` | Giveaways & raffles |
| H1 | Giveaways & raffles |
| Meta description | Active mountain bike giveaways and raffles — enter on the host site. The Dropper does not run these promotions. |

Route: `/giveaways` (not `/raffles`).

### `/giveaways` page

- ISR: use **`export const revalidate = 60`** on this route only (Home stays 4h). Status is still re-derived in the client from timestamps.
- After admin save, call existing `POST /admin/api/revalidate` for `/giveaways` and `/` (same pattern as Cache Manager) so new publishes are not stuck for 60s. Failure to revalidate is non-fatal (log + optional Sentry); the 60s ISR is the backstop.
- Intro: short workshop copy + **we are not the sponsor; official rules on the host site; entry happens there.**
- Chips: **All** (default) · **Giveaways** · **Raffles**. Client filter on the fetched list is fine (payload is small). Changing chips: `filter_applied` `{ filter_type: "giveaway_kind", value: "all"|"giveaway"|"raffle" }`.
- Sections or badges: Open / Opens {date} / Ended {date}.
- Empty: “No open giveaways or raffles right now. Check back, or browse deals.” + link to `/deals`.
- Card: image (or placeholder), kind badge, title, host, prize, eligibility snippet, ticket price + beneficiary for raffles, CTA.
- Ended: badge **Ended**, no primary CTA; optional text link to official rules only (not “enter”).
- Upcoming: **Opens {date}**, no primary CTA.
- `id={slug}` on each card for `/giveaways#slug` sharing.
- JSON-LD: `CollectionPage` + `ItemList` of names/urls (`absoluteUrl('/giveaways') + '#' + slug`). Do **not** emit `Event` or `Offer`.
- Sitemap: add `/giveaways` with `changeFrequency: "daily"`, priority `0.7`.
- `page_viewed`: `giveaway_page_viewed` once on the list (not per card).

### Home strip

- Fetch `GET /giveaways` in `page.tsx` alongside existing `Promise.all`.
- Render **only open** rows, max **3**, heading like `// 0x Open entries` matching home numbered eyebrows.
- Hide the whole section if `open_count === 0`.
- Cards can be compact; “See all” → `/giveaways`.
- Outbound click `list_surface: "home"` analog: property `surface: "home" | "giveaways"` on `giveaway_outbound_click`.

### Nav

`NavHeader`: add `{ href: "/giveaways", label: "Giveaways" }` next to Home (before Deals mega menu). Active when `pathname.startsWith("/giveaways")`. Mirror in mobile drawer.

`AffiliateDisclosure` footer: add Giveaways link beside Policies / Returns. Affiliate commission sentence stays; giveaway CTAs are not affiliate hops unless a future ticket URL happens to be one.

### Analytics

| Event | Properties | When |
|-------|------------|------|
| `giveaway_page_viewed` | — | List page mount |
| `giveaway_outbound_click` | `giveaway_id`, `kind`, `status`, `host_name`, `surface` | Primary CTA click |
| `filter_applied` | `filter_type: "giveaway_kind"`, `value` | Chip change |

Do not send `entry_url` or titles (cardinality / PII-ish). Reuse `filter_applied` rather than a new event name.

---

## Web — admin

- Nav item **Giveaways** in `AdminLayout` (with Stores / Data).
- `GiveawayManager`: list table (title, kind, status, ends_at, published) + create/edit form.
- Form fields match the table. `kind` select. Show ticket price / currency / beneficiary only when `kind === raffle` (clear price when switching to giveaway).
- `published` checkbox. Preview derived status from dates.
- Unpublish is the safe “take it down”; delete is available with confirm.
- TanStack Query keys `adminGiveawayKeys`; mutations invalidate list + call revalidate `/giveaways` and `/`.
- No image uploader — paste URL.

First content is **not** a SQL seed. After ship, publish the three examples from ZAC-47 as giveaways (Pinkbike Aggy, Muc-Off Specialized, Norco Whistler) with real `ends_at` if still known.

---

## Copy & legal

- We **list** promotions; we **do not** operate them.
- Primary CTA always names the host.
- Raffles: show cost when known (“$10 / ticket”). If price unknown, badge **Raffle** is still required so it does not look free.
- Do not legal-advise whether a raffle is a registered charity drawing.
- Policies page: optional one-line pointer in a follow-up; not required for v1 if `/giveaways` has the disclaimer.

Tone: trailhead, not “SAVE SAVE SAVE.” Avoid “Snag the Deal” on this surface.

---

## Docs to update on implementation

Per documentation-sync:

- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) — new editorial content type + `GET /giveaways`
- [apps/api/README.md](../../apps/api/README.md) — public + admin endpoints
- [apps/web/README.md](../../apps/web/README.md) — page, nav, ISR 60s exception, PostHog events
- [packages/shared/README.md](../../packages/shared/README.md) + [migrations/README.md](../../packages/shared/migrations/README.md) — table `048`
- [README.md](../../README.md) / [CLAUDE.md](../../CLAUDE.md) — mention `/giveaways` in public surface list
- [docs/DESIGN.md](../DESIGN.md) — only if we add standing giveaway microcopy to the language table

No scraper or taxonomy docs.

---

## Implementation order (for the next PR, not this one)

Vertical slices:

1. Migration + db + status helper + tests
2. Public `GET /giveaways` + admin CRUD + tests
3. Public page + nav + footer + cards + stories + analytics
4. Home strip + admin revalidate
5. Sitemap + metadata + JSON-LD + docs

Do not start this until this spec is accepted.

## Open Questions

None blocking. Fast-follows (out of this spec): slug pages, bot ingest, Friday Drop embed, `contest` kind.
