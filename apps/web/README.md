# MTB Aggregator Web

React frontend for the MTB deal aggregator. Built with Next.js 15 (App Router), Tailwind v4, TanStack Query, and shadcn/ui.

## Tech Stack

- **Next.js 15** — App Router, SSR/ISR
- **React 18** — UI
- **Tailwind v4** — styling (CSS variables, semantic tokens)
- **shadcn/ui** — Button, Input, Select, Card primitives
- **TanStack Query** — admin dashboard data fetching
- **Storybook 8** — component development and docs

## Features

- **SSR/ISR** — Home, deals list, and deal detail pages are server-rendered for SEO
- **Dark mode** — Toggle in nav header; defaults to system preference (`prefers-color-scheme`), persists choice in `localStorage`
- **Branding** — Primary logo is `public/logo.png` (admin UI). Favicons: `public/favicon.png` / `public/favicon-light.png` via `metadata.icons` in `src/app/layout.tsx` (paired with `prefers-color-scheme`). The public nav uses `logo-light.png` in dark mode (`NavHeader`). Other assets in `public/` are optional (e.g. alternate wordmarks).
- **Admin** — `/admin/llm-profiles`: LLM prompt profiles with a **Field library** tab (CRUD `llm_extraction_field_defs`) and a composition editor for profiles backed by migration `019` (`profile_fields`), including overrides and inline custom fields; legacy raw JSON editing remains for profiles without composition rows

## Development

```bash
pnpm run dev          # Next.js dev server (port 3000)
pnpm run storybook    # Storybook (port 6006)
pnpm run build        # Production build
```

The API must be running for data. Configure `NEXT_PUBLIC_API_URL` (client) or `API_URL` (server) or use the default proxy (`/api` → `http://localhost:8080`).

## Custom domain (Vercel + DNS at Porkbun or any registrar)

Use this when the site should load at your own domain (e.g. `https://example.com`) instead of only `*.vercel.app`.

1. **Vercel — add the domain**  
   In the project: **Settings → Domains → Add**. Enter the apex (`example.com`) and, if you want it, `www.example.com`. Vercel will show the exact **DNS records** to create (types, names, and values). Prefer those over generic instructions; Vercel may update recommended records over time.

2. **Registrar (e.g. Porkbun) — create matching DNS records**  
   In Porkbun: **Domain Management → your domain → DNS** (or **Authoritative DNS**). Add the records Vercel lists—commonly an **A** (or **ALIAS** if offered) for the apex and a **CNAME** for `www` pointing at Vercel’s host. Remove or replace any old **A** / **AAAA** / **CNAME** on `@` or `www` that would conflict (e.g. parking page, old host).

3. **Wait for DNS + TLS**  
   Propagation can take minutes to a few hours. Vercel issues HTTPS automatically once DNS verifies. The dashboard shows **Valid Configuration** when ready.

4. **Redirects**  
   In **Settings → Domains**, set one hostname as the primary (e.g. apex) and add a redirect from `www` → apex (or the reverse) so users only see one canonical URL.

5. **API URL**  
   `NEXT_PUBLIC_API_URL` should remain your **API origin** (e.g. Render `https://your-api.onrender.com`), not your new web domain, unless you put the API behind the same hostname via a reverse proxy.

6. **CORS (if the API restricts origins)**  
   If the Go API sets `CORS_ORIGINS` to a comma-separated allowlist (not `*`), add every origin where the browser loads the app, e.g. `https://example.com,https://www.example.com`. See [apps/api/README.md](../api/README.md).

## Sentry (error monitoring)

When `NEXT_PUBLIC_SENTRY_DSN` is set, the app loads Sentry on the client, server, and edge ([`@sentry/nextjs`](https://docs.sentry.io/platforms/javascript/guides/nextjs/)). Files: `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`, `src/app/global-error.tsx`.

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SENTRY_DSN` | Required to enable Sentry (same DSN in Sentry’s Next.js wizard) |
| `SENTRY_ENVIRONMENT` | e.g. `production`; client also gets `NEXT_PUBLIC_SENTRY_ENVIRONMENT` or mapped `VERCEL_ENV` via `next.config.ts` |
| `SENTRY_RELEASE` / `VERCEL_GIT_COMMIT_SHA` | Release grouping; client uses `NEXT_PUBLIC_SENTRY_RELEASE` populated at build from those |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Optional; enable source map upload on `next build` (e.g. Vercel env or CI) |

Without `SENTRY_AUTH_TOKEN`, builds skip source map upload (`sourcemaps.disable` in `next.config.ts`); errors still report, stacks are less readable.

**Convention:** With `NEXT_PUBLIC_SENTRY_DSN` set, do not rely on `console.error` alone for user-impacting failures—ensure they reach Sentry (Next defaults + `global-error.tsx`; in `try/catch` that handles fatally without rethrowing, call `Sentry.captureException`). See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#error-monitoring-sentry).

## Component Library

### Primitives (`src/components/ui/`)

Use shadcn primitives for new UI:

- **Button** — `variant`, `size`, `asChild`
- **Input** — text, search, number, password
- **Select** — native select styled to match Input (border, focus ring, height)
- **Card** — CardHeader, CardTitle, CardDescription, CardContent, CardFooter

Add more: `pnpm dlx shadcn@latest add <component>`

### Composed Components (`src/components/`)

DealCard, CategoryCard, Pagination, SearchBar, FilterInput, etc. — built from primitives. CategoryCard supports optional `imageSrc` for home page category imagery (`stock-bikes.jpg`, `stock-components.jpg`, etc. in `public/`).

### Storybook

- Run `pnpm run storybook` to develop components in isolation
- Add `*.stories.tsx` for new components (CSF3 format)
- Theme toolbar for light/dark palette iteration

See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#component-library) for details. Visual identity and copy: [docs/DESIGN.md](../../docs/DESIGN.md).
