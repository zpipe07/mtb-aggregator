# MTB Giveaways & raffles directory (ZAC-47)

Spec: [docs/specs/mtb-giveaways-zac-47.md](../specs/mtb-giveaways-zac-47.md)

## Problem Statement

How might we help riders notice legitimate MTB giveaways **and raffles** before they expire, while they’re already shopping deals on The Dropper — without running the promotion or mixing this with our own sweepstakes?

## Recommended Direction

Ship a **manually curated directory** at **`/giveaways`**. Header nav label **Giveaways**. Page H1 / title **Giveaways & raffles**.

Each row has `kind: giveaway | raffle`. **Giveaway** = free to enter (email, IG follow, form). **Raffle** = ticket or other payment to enter. Paid raffles must be visually distinct (badge + ticket price when known) so they cannot look like a free drop.

List **open** rows and **recently ended** rows (**30 days** after `ends_at`). CTA is outbound only: **Enter on [host]** (giveaway) or **Get tickets on [host]** (raffle). Ended rows have no enter/tickets button.

Public status is **derived from timestamps**, not a status enum to flip. A compact **Home “Open entries” strip** shows if ≥1 row is currently open.

We aggregate other people’s promotions. We do not host entry forms, collect PII, or run a Dropper giveaway in this work.

## Key Assumptions to Validate

- [ ] Zack can keep enough published rows that the header link does not go to an empty page — check published row count monthly
- [ ] Shoppers click out to enter — PostHog `giveaway_outbound_click` with `kind` and `status`
- [ ] Return visits show up as `/giveaways` views, not a one-time novelty
- [ ] Filtering giveaway vs raffle is useful — if almost everything is one kind, chips are noise
- [ ] Email signup waits on a real Friday Drop — do not validate signup conversion until a provider exists

## MVP Scope

**In**

- `giveaways` table + migration (`kind`, prize/host/urls/dates/eligibility/requirements, optional `ticket_price` + `ticket_currency`, optional `beneficiary`, `published`)
- Admin CRUD at `/admin/giveaways`
- Public `GET /giveaways` (published and `ends_at` within last 30 days)
- `/giveaways` list page with All / Giveaways / Raffles chips
- Header + footer nav link
- Home strip if any rows are open
- Upcoming rows (`starts_at` in the future) with “Opens {date}” and no CTA
- Legal line: we are not the sponsor; official rules on the host site
- PostHog: page view + outbound click; kind filter via `filter_applied`
- Publish the three live examples (Pinkbike / Muc-Off / Norco) as the first content (giveaways)

**Out**

- Collecting entries, emails, or Instagram handles
- Our own Dropper giveaway
- Winner names / awarded archive
- Bot / scrape of contest pages (schema stays ingest-friendly: unique `entry_url`)
- Per-contest `/giveaways/[slug]` routes
- Newsletter product / working signup form
- Mapping prizes to `store_listings`
- Third `contest` kind (skill-based photo/video) until we have examples

## Not Doing (and Why)

- **Product named “Raffles”** — Muc-Off/Norco-style promotions are giveaways; raffle is a **type** on the same page
- **Hiding at the second `ends_at` passes** — would empty the page; 30-day recency keeps it populated
- **Winner tracking** — hosts often don’t publish a usable name; extra lifecycle for no user job
- **Contest operator features / judging whether a raffle is a lawful charity raffle** — we disclose cost and link rules; we are a directory
- **Fake email capture** — The Friday Drop has no list backend yet
- **Slug pages in v1** — a handful of contests belong on one index; add `/giveaways/[slug]` later if Search Console shows query-level demand

## Open Questions (locked for spec)

- **Recently-ended window:** 30 days
- **Header nav in v1:** yes
- **Ticket price on raffles:** optional (price often only lives on the host page)
- **Beneficiary:** optional text field in v1 (trail-org raffles)
- **Upcoming:** show with “Opens {date}” and no CTA
- **Official rules URL:** required
- **Email:** copy hook only; no form until a provider exists
