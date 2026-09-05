# Publishing the Dropper blog

MDX posts live in the Next.js app at [`apps/web/content/blog/`](../apps/web/content/blog/). There is no CMS. A post is published when it is merged to `main` and deployed.

Cadence target: **about one post every 1–2 weeks**. Keep the format repeatable — checklists and weekly drops that deep-link live `/deals` inventory. Do not stand up a magazine.

UI microcopy (buttons, nav) stays in [DESIGN.md](DESIGN.md). Longform follows the voice below.

## Voice

**Reference:** [Pinkbike](https://www.pinkbike.com/) editorial — shop-counter talk, skeptical of marketing, specific about what actually happens on trail. We are **shorter**. We are not a travel feature and we are not an affiliate landing page.

**Who is speaking:** A veteran rider who has wrenching hours and has watched people overspend. First or close second person is fine. “We” is The Dropper only when we are literally aggregating shops — not a brand chorus.

**Cadence:** Short paragraphs. One idea per graf. A parenthetical aside is fine if it earns it. Cut the third sentence.

### Do

- Name the failure mode (unknown crash history, walking a roll-in, shin vs pins).
- Say what to skip. A “not yet” list is more useful than another must-have.
- Use rider words where they are the accurate ones: lid, flats, clip, insertion, casing.
- Date the advice. Inventory moves; the prose should admit that.
- Match deal rails to the audience (see [Deal embeds](#deal-embeds)).

### Don’t

- Superlatives and catalog copy: *best*, *must-have*, *elevate*, *unlock*, *dream build* as a recommendation.
- Hardcoded current prices (the cards carry those).
- CTA stacking (“Shop now”, “Snag this”, three outbound buttons in a row).
- SEO sludge (“In this article we will cover…”).
- Compete with a money page. Do not write “best mountain bikes under $3,000” — that hub already exists.

### Tone check (rewrite until it sounds like a rider, not a PDP)

| Avoid | Use instead |
| :--- | :--- |
| Every section links to current Dropper sale inventory so you can shop the latest markdowns. | The rails below are live sale prices, cheapest first. Confirm on the retailer. |
| Elevate your first ride with a complete starter kit. | You need a bike that fits and a helmet you will wear. |
| Our expert-curated list of must-have upgrades. | This is the short list. The rest is shops selling you a lifestyle. |

## Add a post

1. Copy an existing file in `apps/web/content/blog/` (start from [`mtb-starter-kit.mdx`](../apps/web/content/blog/mtb-starter-kit.mdx)).
2. Name it `kebab-case-slug.mdx`. The filename **is** the URL: `/blog/your-slug`.
3. Fill frontmatter:

   ```yaml
   ---
   title: "Short, search-shaped title"
   description: "One or two sentences for Google and the index card."
   date: "2026-09-18"
   updated: "2026-09-18"
   ---
   ```

   - `date` / `updated` are `YYYY-MM-DD` (UTC calendar dates).
   - Set `draft: true` to keep the file in git but off `/blog`, the sitemap, and the public slug (404).
4. Write the body in MDX. Use normal Markdown plus the live-deal component:

   ```mdx
   <DealEmbed
     categorySlug="gear-helmets"
     title="Helmets under $150"
     sort="price_asc"
     maxPrice="150"
     seeAllLabel="Helmets under $150 →"
   />
   ```

   Optional props: `q` (full-text), `href` (override the “see all” path), `limit` (default 4), `sort` (default `value`), `maxPrice` (inclusive current-price cap). Pass `maxPrice` as a quoted string (`maxPrice="150"`) — `next-mdx-remote` does not always evaluate `{150}` expressions. “See all” inherits `sort` / `max_price` / `q` so the category page matches the rail.

   Prefer **category and hub URLs** (`/deals/c/...`, `/deals/hub/...`) over a pinned SKU. Inventory moves; the checklist should not.
5. Date the advice in prose (“prices as of …”). The post template already prints `updated` in the byline.
6. Commit, open a PR, merge. After production deploy, request indexing on the new URL (see [ZAC-262](https://linear.app/zacks-personal-projects/issue/ZAC-262)).

## Deal embeds

Match the rail to the reader.

- **Beginner / budget posts** — `sort="price_asc"` plus a `maxPrice` so a $9k demo does not sit on a first-bike page. Caps are editorial (real trail kit, not department-store toys). The starter kit uses $2,000 bikes, $150 lids/shoes, $80 pedals, $200 droppers, $70 tires, $50 tools, $80 bags.
- **General / “what’s on sale” posts** — default `sort="value"` (biggest dollar savings) is fine. Do not cap unless the piece is about a price band.

## Checklist before you merge

- [ ] Frontmatter title + description are unique and not clickbait
- [ ] At least one live `/deals` or `/deals/c/...` / `/deals/hub/...` link
- [ ] `DealEmbed` category slugs match the tree (`gear-helmets`, `bikes-mountain`, …)
- [ ] No hardcoded current prices in the copy (the cards carry those)
- [ ] Affiliate tone stays honest — we do not sell the product
- [ ] Voice matches [Voice](#voice) (succinct, not salesy, veteran rider — not a PDP)
- [ ] Deal rails match the audience (`price_asc` + `maxPrice` on beginner posts)
- [ ] You are not competing with an existing money page (e.g. do not write “best mountain bikes under $3000”; that hub already exists)

## Preview locally

```bash
PORT=3001 pnpm --filter @mtb-aggregator/web run dev
```

Open `http://localhost:3001/blog` and the post slug. Deal embeds need the API (`API_URL` / default proxy to `:8080`). Empty rails still show the category link.

## What not to do

- Do not add a headless CMS for the first few posts.
- Do not invent a new article format every week. Next recurring format: [ZAC-261](https://linear.app/zacks-personal-projects/issue/ZAC-261) (“This week’s drops”).
- Do not compile user-submitted MDX. `next-mdx-remote` only reads git-reviewed files under `content/blog/`.
