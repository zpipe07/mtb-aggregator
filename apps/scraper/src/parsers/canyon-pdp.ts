import * as cheerio from "cheerio";

import { BROWSER_USER_AGENT, ENRICH_DELAY_MS } from "../config.js";
import type { EnrichResult } from "./jensonusa.js";

function cleanText(t: string | null | undefined): string {
  return (t || "").replace(/\s+/g, " ").trim();
}

export function parseJsonLdBlocks(html: string): unknown[] {
  const $ = cheerio.load(html);
  const blocks: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        blocks.push(...parsed);
      } else if (parsed && typeof parsed === "object" && Array.isArray(parsed["@graph"])) {
        blocks.push(...(parsed["@graph"] as unknown[]));
      } else {
        blocks.push(parsed);
      }
    } catch {
      /* ignore */
    }
  });
  return blocks;
}

function flattenLdTypes(block: unknown): unknown[] {
  if (!block || typeof block !== "object") return [];
  const obj = block as Record<string, unknown>;
  if (Array.isArray(obj["@graph"])) {
    return obj["@graph"] as unknown[];
  }
  return [block];
}

export function extractCanyonBreadcrumbsFromHtml(html: string): string[] | null {
  for (const block of parseJsonLdBlocks(html)) {
    for (const node of flattenLdTypes(block)) {
      const json = node as Record<string, unknown>;
      if (json["@type"] !== "BreadcrumbList") continue;
      const elements = json.itemListElement;
      if (!Array.isArray(elements)) continue;
      const items: string[] = [];
      for (const item of elements) {
        const entry = item as Record<string, unknown>;
        const name =
          (entry.name as string) ??
          ((entry.item as Record<string, unknown>)?.name as string);
        if (name) items.push(cleanText(String(name)));
      }
      if (items.length >= 2) {
        let trimmed = items.slice(0, -1);
        if (/^home$/i.test(trimmed[0] ?? "")) trimmed = trimmed.slice(1);
        if (trimmed.length > 0) return trimmed;
      }
    }
  }
  return categoryPathFromUrl(html);
}

function categoryPathFromUrl(html: string): string[] | null {
  const $ = cheerio.load(html);
  const canonical =
    $('link[rel="canonical"]').attr("href") ??
    $('meta[property="og:url"]').attr("content");
  if (!canonical) return null;
  try {
    const segments = new URL(canonical).pathname.split("/").filter(Boolean);
    const enIdx = segments.indexOf("en-us");
    const after = enIdx >= 0 ? segments.slice(enIdx + 1) : segments;
    const withoutFile = after.filter((s) => !/\.html$/i.test(s));
    if (withoutFile.length < 2) return null;
    return withoutFile.slice(0, -1).map((s) =>
      s
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    );
  } catch {
    return null;
  }
}

function collectAdditionalProperties(
  product: Record<string, unknown>,
): Record<string, string> {
  const specs: Record<string, string> = {};
  const additional = product.additionalProperty;
  const list = Array.isArray(additional)
    ? additional
    : additional
      ? [additional]
      : [];
  for (const prop of list) {
    const entry = prop as Record<string, unknown>;
    const name = entry.name ?? entry.propertyID;
    const value = entry.value;
    if (name && value) {
      specs[cleanText(String(name))] = cleanText(String(value));
    }
  }
  return specs;
}

export function extractCanyonProductFromJsonLd(html: string): {
  description: string | null;
  raw_specs: Record<string, string> | null;
} {
  for (const block of parseJsonLdBlocks(html)) {
    for (const node of flattenLdTypes(block)) {
      const json = node as Record<string, unknown>;
      const type = json["@type"];
      const isProduct =
        type === "Product" ||
        (Array.isArray(type) && type.includes("Product"));
      if (!isProduct) continue;

      const description =
        typeof json.description === "string"
          ? cleanText(json.description)
          : null;

      const specs = collectAdditionalProperties(json);
      return {
        description: description && description.length >= 20 ? description : null,
        raw_specs: Object.keys(specs).length > 0 ? specs : null,
      };
    }
  }
  return { description: null, raw_specs: null };
}

/** Key features / spec lists in Canyon PDP markup. */
export function extractCanyonDomSpecs(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const specs: Record<string, string> = {};

  $("dl").each((_, dl) => {
    const $dl = $(dl);
    $dl.find("dt").each((__, dt) => {
      const key = cleanText($(dt).text());
      const dd = $(dt).next("dd");
      const value = cleanText(dd.text());
      if (key && value && key.length < 80 && value.length < 500) {
        specs[key] = value;
      }
    });
  });

  $("[class*='keyFeatures'] li, [class*='KeyFeatures'] li").each((_, li) => {
    const text = cleanText($(li).text());
    if (text.length > 0 && text.length < 300) {
      specs[`Feature ${Object.keys(specs).length + 1}`] = text;
    }
  });

  return specs;
}

export function enrichCanyonPdpFromHtml(html: string): EnrichResult {
  const category_path = extractCanyonBreadcrumbsFromHtml(html);
  const { description, raw_specs: ldSpecs } = extractCanyonProductFromJsonLd(html);
  const domSpecs = extractCanyonDomSpecs(html);
  const mergedSpecs =
    ldSpecs || Object.keys(domSpecs).length > 0
      ? { ...(ldSpecs ?? {}), ...domSpecs }
      : null;

  return {
    category_path,
    raw_specs: mergedSpecs,
    ...(description ? { description } : {}),
  };
}

export async function enrichCanyonPdp(productUrl: string): Promise<EnrichResult> {
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
    const result = enrichCanyonPdpFromHtml(html);
    await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
    return result;
  } catch (err) {
    console.error("[scraper] Canyon PDP enrich failed:", err);
    return { category_path: null, raw_specs: null };
  }
}
