---
name: cheerio element type fix
overview: Fix the cheerio v1.2.0 type error in the Revel Bikes parser and add a scraper type-check step to CI so this class of failure can't slip through to Render again.
todos:
  - id: fix-revel
    content: Replace cheerio.Element[] with cheerio.Cheerio<any>[] (storing wrappers) in apps/scraper/src/parsers/revelbikes.ts and update push/remove sites accordingly
    status: completed
  - id: ci-typecheck
    content: Add a 'Build scraper' step to .github/workflows/ci.yml that runs pnpm --filter @mtb-aggregator/scraper run build
    status: completed
  - id: verify
    content: Run scraper build + tests locally to confirm clean compile and unchanged behavior
    status: completed
isProject: false
---

## Why it broke

`cheerio@1.2.0` no longer re-exports DOM node types from its public entry. From `node_modules/.pnpm/cheerio@1.2.0/.../cheerio/dist/esm/index.d.ts`, the only re-exported types are `Cheerio`, `CheerioAPI`, `CheerioOptions`, `HTMLParser2Options` plus the type-only `* from './types.js'` (selector/filter helpers). `Element` now lives only in `domhandler` — cheerio's own files import it from there. So `cheerio.Element` fails to resolve.

Only [apps/scraper/src/parsers/revelbikes.ts](apps/scraper/src/parsers/revelbikes.ts) uses `cheerio.Element` (line 126). The other parsers (`worldwidecyclery.ts`, `ridebicycles.ts`, `backcountry.ts`) use `cheerio.Cheerio<any>` and still compile.

## Why CI missed it

[.github/workflows/ci.yml](.github/workflows/ci.yml) lines 73–74 run only vitest against the scraper:

```yaml
- name: Scraper tests
  run: pnpm --filter @mtb-aggregator/scraper run test
```

Vitest transforms TS via esbuild, which strips types without checking them. The web app gets a real `tsc --noEmit` step (line 48-49) and Go gets `go vet` / `staticcheck` / `go build`, but the scraper has no `tsc` step. Render's Docker build runs `pnpm run build` (which is literally `tsc` per [apps/scraper/package.json](apps/scraper/package.json) line 8) — that's the first place type-checking actually happens.

## Fix

### 1. [apps/scraper/src/parsers/revelbikes.ts](apps/scraper/src/parsers/revelbikes.ts)

Change line 126 to track the cheerio wrappers (consistent with how the other parsers in this repo type cheerio nodes) instead of raw `Element`s, then call `.remove()` on the wrapper directly. This avoids pulling `domhandler` in as a new direct dependency.

Around the existing block:

```114:152:apps/scraper/src/parsers/revelbikes.ts
export function parseRevelProductBodyHtml(bodyHtml: string): {
  raw_specs: Record<string, string> | null;
  description?: string;
} {
  ...
    const specs: Record<string, string> = {};
    const specParagraphEls: cheerio.Element[] = [];

    $("p").each((_, el) => {
      const p = $(el);
      ...
      specs[key] = value;
      specParagraphEls.push(el);
    });

    for (const el of specParagraphEls) {
      $(el).remove();
    }
```

becomes:

- declare `const specParagraphs: cheerio.Cheerio<any>[] = []`
- inside `.each`, push `p` (the wrapper) instead of `el`
- in the cleanup loop, iterate `for (const p of specParagraphs) p.remove();`

Behavior is identical (`cheerio.Cheerio.remove()` removes those exact nodes from the doc), and the `cheerio.Cheerio<any>` style matches the existing convention used in [apps/scraper/src/parsers/worldwidecyclery.ts](apps/scraper/src/parsers/worldwidecyclery.ts) (e.g. `function collectFromTable(table: cheerio.Cheerio<any>)`).

### 2. [.github/workflows/ci.yml](.github/workflows/ci.yml)

Add a scraper build step before (or right after) `Scraper tests` so CI runs the same `tsc` invocation Render does:

```yaml
- name: Build scraper
  run: pnpm --filter @mtb-aggregator/scraper run build
```

This catches type errors and also produces the `dist/` output, mirroring Render's Docker build. Placing it before `Scraper tests` means a type regression fails fast.

## Verification (post-approval)

- Run `pnpm --filter @mtb-aggregator/scraper run build` locally — should compile clean.
- Run `pnpm --filter @mtb-aggregator/scraper run test` — existing vitest suite (including [apps/scraper/src/parsers/revelbikes.test.ts](apps/scraper/src/parsers/revelbikes.test.ts)) should still pass; behavior didn't change.
- The new CI step will guard future regressions in any scraper parser, not just Revel.

## Out of scope

- Bumping/pinning cheerio (we stay on `^1.2.0`).
- Adding `domhandler` as a direct dep — not needed once we drop the `cheerio.Element` reference.
- Touching the other parsers — they already compile under cheerio 1.2.0.
