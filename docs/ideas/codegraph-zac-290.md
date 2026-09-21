# CodeGraph for Cursor agents (ZAC-290)

Spike: [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) on `mtb-aggregator` to cut Cursor token usage.

**Decision: adopt.** Local index + Cursor MCP. Do not commit the SQLite database.

## What it is

A **local** tree-sitter → SQLite knowledge graph of symbols, calls, imports, and (for this repo) framework routes. Agents query it over MCP (`codegraph_explore`) or the CLI (`codegraph explore`) instead of a grep → read → grep loop. No embeddings, no API keys, no code leaving the machine. Auto-syncs on file change when the MCP server is running.

This is **not** Cursor/Sourcegraph Code Graph.

## Spike (2026-09-21, CodeGraph v1.6.0)

Indexed this repo on a cloud agent VM:

| Metric | Result |
| --- | --- |
| Files | 503 (TS 181, Go 162, TSX 149) |
| Nodes / edges | 6,695 / 16,179 |
| DB size | ~21 MB (gitignored) |
| Fresh index | **588 ms** |
| Languages | TypeScript, Go, TSX (also a few YAML/JS files) |

Six typical agent questions (`codegraph explore`, default 12-file cap) each returned **~25 KB / ~6.2k tokens** in **one call**:

| Question | Graph quality | Without CodeGraph (typical) |
| --- | --- | --- |
| How does scrape ingest upsert listings? | Hit `ingestScrapeResults` + `listings_upsert.go`; some LLM-side noise | 3 files ≈ 55 KB / ~14k tokens (`scheduler.go` is 37 KB alone) |
| How does PDP enrichment claim a listing? | Hit `ClaimForStep`, pipeline, Go+scraper types | 4 files ≈ 145 KB / ~36k tokens (`db.go` is 99 KB) |
| How does `GET /deals` filter by spec facets? | Hit `dealsFilterSQL` / `GetFacets` / `DealFilters`; **also** matched `GET()` in the Google Shopping feed | 5 files ≈ 87 KB / ~22k tokens |
| DealCard in-stock variant chips | Excellent: `DealCard` → `VariantChips` + JSX call sites (DealGrid, carousel, hero) | 5 files ≈ 34 KB / ~8k tokens |
| Taxonomy `Map` / `RefineListing` | Relevant symbols + blast radius | Similar grep+read of `internal/taxonomy` |
| How do I add a new store parser? | **Missed** `parsers/index.ts`; returned PDP pacing instead | Grep `PARSERS` / `ENRICHERS` is still the right first move |

Payload comparison is **before** counting round-trips. Vendor benches (Claude Code, Opus 4.8, 2026-08) put architecture questions at **~62% fewer tokens processed** and **~88% fewer tool calls** because the file-reading arm spends 7–43 calls rediscovering structure. This repo (~500 source files, Go+TS) sits between their Gin and Excalidraw rows. Cursor already has a strong Grep, so the win here is **not** finding a string faster — it is **not opening `db.go` / `scheduler.go` / `handlers.go` whole**, plus call-graph hops Grep cannot follow.

**Estimate for this repo:** discovery-heavy sessions (the usual “how does X work / what does changing Y break” agent work) should use **roughly 40–70% fewer tokens processed**. Narrow “edit this one file I already named” tasks will be near-even or slightly worse (MCP + dense payload overhead).

### Other benefits (not the decision bar, still real)

- **Call graph / blast radius** — `codegraph impact dealsFilterSQL` listed `GetDeals`, `getDealsGrouped`, and the filter test in one shot.
- **Cross-language** — PDP enrich query linked Go claim/pipeline types to scraper TS variant types.
- **Dynamic dispatch** — DealCard query listed JSX render sites Grep only finds if you already know the component name.
- **Always-fresh index** — watcher + connect-time catch-up; no manual re-index in normal use.
- **100% local** — fits a private repo; telemetry can be `codegraph telemetry off`.

### Caveats

1. **Residual context is larger.** Vendor: ~80% more retrieval text left in the window at session end (throughput down, occupancy up). Long chats can still balloon; start a new chat when the window is stuffed.
2. **Retrieval is not perfect.** Natural-language “add a store” missed `PARSERS`. Queries with exact symbol names work better. Keep Grep as fallback.
3. **MCP schema cost** on every Cursor request while the server is enabled. Worth it if the agent actually calls `codegraph_explore`; waste if it never does. The short `CLAUDE.md` / `AGENTS.md` block exists so subagents load the tool.
4. **CLI must be on PATH.** Cursor MCP is configured as `codegraph serve --mcp --path ${workspaceFolder}`. Install once per machine, then `make codegraph-init`.
5. **Cloud VMs** do not bake the CLI into the Dockerfile (keeps env snapshots small). Cloud agents can still `codegraph explore` via Shell after installing, or fall back to Grep.

## Adopted wiring

1. [`.cursor/mcp.json`](../../.cursor/mcp.json) — `codegraph` MCP server.
2. Marker-fenced instructions in [`CLAUDE.md`](../../CLAUDE.md) and [`AGENTS.md`](../../AGENTS.md) (official installer block; subagents never see MCP `initialize` text).
3. [`.codegraph/.gitignore`](../../.codegraph/.gitignore) — commit the dir, ignore `codegraph.db`.
4. `make codegraph-init`.

## Local setup (once per machine)

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh
# or: npm i -g @colbymchenry/codegraph

# new shell so `codegraph` is on PATH, then:
cd /path/to/mtb-aggregator
make codegraph-init
```

Restart Cursor so the MCP server starts. Confirm with `codegraph status` (files/nodes, “Index is up to date”).

To walk it back: `codegraph uninstall --target=cursor --keep-cli` (or remove the `codegraph` key from `.cursor/mcp.json`) and `codegraph uninit`.

## When not to use it

- Editing a file you already have open.
- Searching docs, SQL, or JSON config the graph barely indexes.
- “Add a new store” checklists — still follow [docs/SCRAPING.md](../SCRAPING.md) / [docs/specs/scrape-contract-zac-255.md](../specs/scrape-contract-zac-255.md).
