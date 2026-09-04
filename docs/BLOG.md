# Publishing the Dropper blog

MDX posts live in the Next.js app at [`apps/web/content/blog/`](../apps/web/content/blog/). There is no CMS. A post is published when it is merged to `main` and deployed.

Cadence target: **about one post every 1–2 weeks**. Keep the format repeatable — checklists and weekly drops that deep-link live `/deals` inventory. Do not stand up a magazine.

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
     title="Helmets on sale"
     seeAllLabel="All helmet deals →"
   />
   ```

   Optional props: `q` (full-text), `href` (override the “see all” path), `limit` (default 4).

   Prefer **category and hub URLs** (`/deals/c/...`, `/deals/hub/...`) over a pinned SKU. Inventory moves; the checklist should not.
5. Date the advice in prose (“prices as of …”). The post template already prints `updated` in the byline.
6. Commit, open a PR, merge. After production deploy, request indexing on the new URL (see [ZAC-262](https://linear.app/zacks-personal-projects/issue/ZAC-262)).

## Checklist before you merge

- [ ] Frontmatter title + description are unique and not clickbait
- [ ] At least one live `/deals` or `/deals/c/...` / `/deals/hub/...` link
- [ ] `DealEmbed` category slugs match the tree (`gear-helmets`, `bikes-mountain`, …)
- [ ] No hardcoded current prices in the copy (the cards carry those)
- [ ] Affiliate tone stays honest — we do not sell the product
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
