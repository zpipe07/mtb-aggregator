import * as cheerio from "cheerio";
import type { EnrichResult } from "./jensonusa.js";
import { ENRICH_DELAY_MS, BROWSER_USER_AGENT } from "../config.js";

export async function enrichBackcountryFamilyPdp(productUrl: string): Promise<EnrichResult> {
  try {
    const res = await fetch(productUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent": BROWSER_USER_AGENT,
      },
    });
    if (!res.ok) {
      throw new Error(`fetch ${res.status}: ${res.statusText}`);
    }
    const html = await res.text();
    const categoryPath = extractBackcountryFamilyBreadcrumbs(html);
    const rawSpecs = extractBackcountryFamilySpecs(html);
    const description = extractBackcountryFamilyDescription(html);

    await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));

    return {
      category_path: categoryPath,
      raw_specs: rawSpecs,
      description: description ?? undefined,
    };
  } catch (err) {
    console.error("[scraper] Backcountry-family PDP enrich failed:", err);
    return { category_path: null, raw_specs: null };
  }
}

export function extractBackcountryFamilyDescription(html: string): string | null {
  const $ = cheerio.load(html);
  const clean = (t: string | null | undefined) => (t || "").replace(/\s+/g, " ").trim();

  const descSelectors = [
    '[data-testid="product-description"]',
    ".product-description",
    "#product-description",
    '[id*="description"]',
    ".product-details",
    ".product-overview",
    "main [class*='description']",
  ];
  for (const sel of descSelectors) {
    const el = $(sel).first();
    if (el.length) {
      const clone = el.clone();
      clone.find("table, dl").remove();
      const text = clean(clone.text());
      if (text && text.length >= 50 && text.length < 12000) return text;
    }
  }

  const container = $("main").length ? $("main").first() : $("body").first();
  if (container.length) {
    const clone = container.clone();
    clone.find("table, dl").remove();
    const text = clean(clone.text());
    if (text && text.length >= 50) return text.length > 8000 ? text.slice(0, 8000) : text;
  }
  return null;
}

export function extractBackcountryFamilyBreadcrumbs(html: string): string[] | null {
  const $ = cheerio.load(html);
  const clean = (t: string | null | undefined) => (t || "").replace(/\s+/g, " ").trim();

  let result: string[] | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (result) return;
    try {
      const parsed = JSON.parse($(el).html() ?? "{}");
      const candidates = Array.isArray(parsed)
        ? parsed
        : parsed["@graph"]
          ? parsed["@graph"]
          : [parsed];
      for (const json of candidates) {
        if (json?.["@type"] === "BreadcrumbList" && Array.isArray(json.itemListElement)) {
          const items: string[] = [];
          for (const item of json.itemListElement) {
            const name = item.name ?? item.item?.name;
            if (name) items.push(clean(String(name)));
          }
          if (items.length >= 2) {
            let trimmed = items.slice(0, -1);
            if (/^home$/i.test(trimmed[0] ?? "")) trimmed = trimmed.slice(1);
            if (trimmed.length > 0) {
              result = trimmed;
              return;
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  });
  if (result) return result;

  const selectors = [
    'nav[aria-label="Breadcrumb"] a',
    'nav[aria-label="breadcrumb"] a',
    ".breadcrumb a",
    ".breadcrumbs a",
    "[class*='breadcrumb'] a",
    "ol[class*='breadcrumb'] li a",
  ];
  for (const sel of selectors) {
    const items: string[] = [];
    $(sel).each((_, el) => {
      const t = clean($(el).text());
      if (t) items.push(t);
    });
    if (items.length >= 2) {
      let trimmed = items.slice(0, -1);
      if (/^home$/i.test(trimmed[0] ?? "")) trimmed = trimmed.slice(1);
      if (trimmed.length > 0) return trimmed;
    }
  }

  return null;
}

export function extractBackcountryFamilySpecs(html: string): Record<string, string> | null {
  const $ = cheerio.load(html);
  const specs: Record<string, string> = {};
  const clean = (t: string | null | undefined) => (t || "").replace(/\s+/g, " ").trim();

  function collectFromTable(table: cheerio.Cheerio<any>) {
    table.find("tr").each((_, row) => {
      const cells = $(row).children("th,td");
      if (cells.length < 2) return;
      const key = clean($(cells[0]).text());
      const value = clean($(cells[1]).text());
      if (!key || !value || key.length > 80 || value.length > 200) return;
      specs[key] = value;
    });
  }

  function collectFromDl(dl: cheerio.Cheerio<any>) {
    dl.find("dt").each((_, el) => {
      const key = clean($(el).text());
      const value = clean($(el).next("dd").text());
      if (!key || !value || key.length > 80 || value.length > 200) return;
      specs[key] = value;
    });
  }

  $("table").each((_, el) => {
    const table = $(el);
    const heading = clean(table.prevAll("h1,h2,h3,h4,strong").first().text()).toLowerCase();
    if (heading.includes("spec") || heading.includes("details")) {
      collectFromTable(table);
    }
  });

  if (Object.keys(specs).length === 0) {
    $("table").each((_, el) => collectFromTable($(el)));
  }

  if (Object.keys(specs).length === 0) {
    $("dl").each((_, el) => {
      const dl = $(el);
      const heading = clean(dl.prevAll("h1,h2,h3,h4,strong").first().text()).toLowerCase();
      if (heading.includes("spec")) collectFromDl(dl);
    });
  }

  return Object.keys(specs).length > 0 ? specs : null;
}
