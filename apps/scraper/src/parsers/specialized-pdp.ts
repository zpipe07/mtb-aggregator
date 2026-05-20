import * as cheerio from "cheerio";

import { BROWSER_USER_AGENT, ENRICH_DELAY_MS } from "../config.js";
import type { EnrichResult } from "./jensonusa.js";

function cleanText(t: string | null | undefined): string {
  return (t || "").replace(/\s+/g, " ").trim();
}

/** Breadcrumbs from microdata BreadcrumbList on Specialized PDPs. */
export function extractSpecializedBreadcrumbsFromHtml(html: string): string[] | null {
  const $ = cheerio.load(html);
  const items: string[] = [];
  $('ol[itemtype*="BreadcrumbList"] span[itemprop="name"]').each((_, el) => {
    const name = cleanText($(el).text());
    if (name) items.push(name);
  });
  if (items.length === 0) {
    $('[itemtype*="BreadcrumbList"] [itemprop="name"]').each((_, el) => {
      const name = cleanText($(el).text());
      if (name) items.push(name);
    });
  }
  if (items.length < 2) return null;
  let trimmed = items.slice(0, -1);
  if (/^home$/i.test(trimmed[0] ?? "")) trimmed = trimmed.slice(1);
  return trimmed.length > 0 ? trimmed : null;
}

export function extractSpecializedOgDescription(html: string): string | null {
  const $ = cheerio.load(html);
  const desc = $('meta[property="og:description"]').attr("content");
  const cleaned = cleanText(desc);
  return cleaned.length >= 20 ? cleaned : null;
}

/** Technical specifications accordion / SpecContainer blocks. */
export function extractSpecializedDomSpecs(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const specs: Record<string, string> = {};

  $('[id="technical-specifications"] h4, .SpecContainer_specNameContainer__7dPFc h4').each(
    (_, heading) => {
      const key = cleanText($(heading).text());
      if (!key || key.length > 120) return;
      const container = $(heading).closest(
        ".SpecContainer_container__euRcV, .SingleTechSpec_specsContainer__AmSh8",
      );
      const valueParts: string[] = [];
      container.find("p, li, dd, .SpecContainer_specValueContainer__V-PYE").each(
        (___, el) => {
          const v = cleanText($(el).text());
          if (v && v !== key) valueParts.push(v);
        },
      );
      const value = [...new Set(valueParts)].join("; ").trim();
      if (value && value.length < 800) {
        specs[key] = value;
      }
    },
  );

  $("#technical-specifications dl").each((_, dl) => {
    const $dl = $(dl);
    $dl.find("dt").each((__, dt) => {
      const key = cleanText($(dt).text());
      const value = cleanText($(dt).next("dd").text());
      if (key && value && key.length < 80 && value.length < 500) {
        specs[key] = value;
      }
    });
  });

  return specs;
}

export function enrichSpecializedPdpFromHtml(html: string): EnrichResult {
  const category_path = extractSpecializedBreadcrumbsFromHtml(html);
  const description = extractSpecializedOgDescription(html);
  const domSpecs = extractSpecializedDomSpecs(html);
  const raw_specs = Object.keys(domSpecs).length > 0 ? domSpecs : null;

  return {
    category_path,
    raw_specs,
    ...(description ? { description } : {}),
  };
}

export async function enrichSpecializedPdp(productUrl: string): Promise<EnrichResult> {
  try {
    const res = await fetch(productUrl, {
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
    const result = enrichSpecializedPdpFromHtml(html);
    await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
    return result;
  } catch (err) {
    console.error("[scraper] Specialized PDP enrich failed:", err);
    return { category_path: null, raw_specs: null };
  }
}
