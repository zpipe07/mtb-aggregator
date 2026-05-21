import * as cheerio from "cheerio";

import { BROWSER_USER_AGENT, ENRICH_DELAY_MS } from "../config.js";
import type { EnrichResult } from "./jensonusa.js";

function cleanText(t: string | null | undefined): string {
  return (t || "").replace(/\s+/g, " ").trim();
}

/** Breadcrumbs from Trek PDP static HTML (#breadcrumbs). */
export function extractTrekBreadcrumbsFromHtml(html: string): string[] | null {
  const $ = cheerio.load(html);
  const items: string[] = [];
  $("#breadcrumbs a, .breadcrumb__item a").each((_, el) => {
    const name = cleanText($(el).text());
    if (name) items.push(name);
  });
  if (items.length < 2) return null;
  let trimmed = items.slice(0, -1);
  if (/^home$/i.test(trimmed[0] ?? "")) trimmed = trimmed.slice(1);
  return trimmed.length > 0 ? trimmed : null;
}

export function extractTrekDescription(html: string): string | null {
  const $ = cheerio.load(html);
  const og = cleanText($('meta[property="og:description"]').attr("content"));
  if (og.length >= 20) return og;
  const meta = cleanText($('meta[name="description"]').attr("content"));
  return meta.length >= 20 ? meta : null;
}

export function enrichTrekPdpFromHtml(html: string): EnrichResult {
  const category_path = extractTrekBreadcrumbsFromHtml(html);
  const description = extractTrekDescription(html);

  return {
    category_path,
    raw_specs: null,
    ...(description ? { description } : {}),
  };
}

export async function enrichTrekPdp(productUrl: string): Promise<EnrichResult> {
  try {
    const res = await fetch(productUrl, {
      redirect: "follow",
      headers: {
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": BROWSER_USER_AGENT,
      },
    });
    if (!res.ok) {
      throw new Error(`fetch ${res.status}: ${res.statusText}`);
    }
    const html = await res.text();
    const result = enrichTrekPdpFromHtml(html);
    await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
    return result;
  } catch (err) {
    console.error("[scraper] Trek PDP enrich failed:", err);
    return { category_path: null, raw_specs: null };
  }
}
