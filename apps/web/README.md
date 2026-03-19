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

## Development

```bash
pnpm run dev          # Next.js dev server (port 3000)
pnpm run storybook    # Storybook (port 6006)
pnpm run build        # Production build
```

The API must be running for data. Configure `NEXT_PUBLIC_API_URL` (client) or `API_URL` (server) or use the default proxy (`/api` → `http://localhost:8080`).

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
