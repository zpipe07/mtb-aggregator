# MTB Aggregator Web

React frontend for the MTB deal aggregator. Built with Vite, Tailwind v4, TanStack Query, and shadcn/ui.

## Tech Stack

- **React 18** + React Router
- **Vite** — build tool
- **Tailwind v4** — styling (CSS variables, semantic tokens)
- **shadcn/ui** — Button, Input, Select, Card primitives
- **TanStack Query** — server state
- **Storybook 8** — component development and docs

## Development

```bash
pnpm run dev          # Vite dev server (port 5173)
pnpm run storybook    # Storybook (port 6006)
pnpm run build        # Production build
```

The API must be running for data. Configure `VITE_API_URL` or use the default proxy (`/api` → `http://localhost:8080`).

## Component Library

### Primitives (`src/components/ui/`)

Use shadcn primitives for new UI:

- **Button** — `variant`, `size`, `asChild`
- **Input** — text, search, number, password
- **Select** — native select styled to match Input (border, focus ring, height)
- **Card** — CardHeader, CardTitle, CardDescription, CardContent, CardFooter

Add more: `pnpm dlx shadcn@latest add <component>`

### Composed Components (`src/components/`)

DealCard, CategoryCard, Pagination, SearchBar, FilterInput, etc. — built from primitives.

### Storybook

- Run `pnpm run storybook` to develop components in isolation
- Add `*.stories.tsx` for new components (CSF3 format)
- Theme toolbar for light/dark palette iteration

See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#component-library) for details. Visual identity and copy: [docs/DESIGN.md](../../docs/DESIGN.md).
