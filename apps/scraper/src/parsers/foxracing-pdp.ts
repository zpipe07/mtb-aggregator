import * as cheerio from "cheerio";

import { BROWSER_USER_AGENT, ENRICH_DELAY_MS } from "../config.js";
import type { EnrichResult } from "./jensonusa.js";
import {
  parseProductGroupKey,
} from "./foxracing-plp.js";
import type { PdpEnrichVariant } from "./jensonusa-pdp.js";

function cleanText(t: string | null | undefined): string {
  return (t || "").replace(/\s+/g, " ").trim();
}

/** Current variant pid from PDP wrapper (`data-pid`). */
export function parseFoxProductPid(html: string): string | null {
  const $ = cheerio.load(html);
  return $(".product-detail.product-wrapper[data-pid]").attr("data-pid")?.trim() ?? null;
}

function isSwatchSelectable($: cheerio.CheerioAPI, btn: cheerio.Cheerio<any>): boolean {
  const swatch = btn.find(".swatch-value").first();
  return swatch.hasClass("selectable") && !swatch.hasClass("unselectable");
}

/** Color swatches on PDP → one variant per color SKU (`VG-29354-579`). */
export function parseFoxColorVariantsFromHtml(
  html: string,
  currentPid?: string | null,
): PdpEnrichVariant[] {
  const $ = cheerio.load(html);
  const pid = currentPid ?? parseFoxProductPid(html);
  const baseStyle = pid ? parseProductGroupKey(pid) : null;
  if (!baseStyle) return [];

  const variants: PdpEnrichVariant[] = [];
  const seen = new Set<string>();

  $("button.color-attribute").each((_, el) => {
    const btn = $(el);
    const colorCode = btn.find("[data-attr-value]").attr("data-attr-value")?.trim();
    if (!colorCode) return;

    const label =
      btn
        .attr("aria-label")
        ?.replace(/^Select Color\s*/i, "")
        .trim() || colorCode;
    const code = `${baseStyle}-${colorCode}`;
    if (seen.has(code)) return;
    seen.add(code);

    variants.push({
      code,
      dimensions: { Color: label },
      is_orderable: isSwatchSelectable($, btn),
    });
  });

  return variants;
}

/** Selectable sizes for the currently viewed color. */
export function parseFoxSelectableSizes(html: string): string[] {
  const $ = cheerio.load(html);
  const sizes: string[] = [];
  $("button.size-attribute").each((_, el) => {
    const btn = $(el);
    const value = btn.find("[data-attr-value]").attr("data-attr-value")?.trim();
    if (!value || !isSwatchSelectable($, btn)) return;
    sizes.push(value);
  });
  return sizes;
}

/** Breadcrumbs from schema.org microdata on Fox PDPs. */
export function extractFoxBreadcrumbsFromHtml(html: string): string[] | null {
  const $ = cheerio.load(html);
  const items: string[] = [];

  $('.breadcrumb[itemscope][itemtype*="BreadcrumbList"] [itemprop="name"]').each(
    (_, el) => {
      const name = cleanText($(el).text());
      if (name) items.push(name);
    },
  );

  if (items.length >= 2) {
    let trimmed = items.slice(0, -1);
    if (/^home$/i.test(trimmed[0] ?? "")) trimmed = trimmed.slice(1);
    trimmed = trimmed.filter((p) => !/^legacy drops$/i.test(p));
    if (trimmed.length > 0) return trimmed;
  }

  return null;
}

function accordionSectionText(
  $: cheerio.CheerioAPI,
  headerPattern: RegExp,
): string | null {
  let text = "";
  $(".accordion-item").each((_, item) => {
    const header = cleanText($(item).find(".accordion-header").text());
    if (!headerPattern.test(header)) return;
    const content = cleanText($(item).find(".accordion-content").text());
    if (content) text = content;
  });
  return text.length > 0 ? text : null;
}

function accordionListItems(
  $: cheerio.CheerioAPI,
  headerPattern: RegExp,
  keyPrefix: string,
): Record<string, string> {
  const specs: Record<string, string> = {};
  $(".accordion-item").each((_, item) => {
    const header = cleanText($(item).find(".accordion-header").text());
    if (!headerPattern.test(header)) return;
    $(item)
      .find(".accordion-content li")
      .each((i, li) => {
        const value = cleanText($(li).text());
        if (value) specs[`${keyPrefix} ${i + 1}`] = value;
      });
  });
  return specs;
}

export function extractFoxDomSpecs(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  return {
    ...accordionListItems($, /key features/i, "Feature"),
    ...accordionListItems($, /specifications/i, "Specification"),
    ...accordionListItems($, /materials/i, "Materials"),
  };
}

export function enrichFoxRacingPdpFromHtml(html: string): EnrichResult {
  const $ = cheerio.load(html);
  const pid = parseFoxProductPid(html);
  const category_path = extractFoxBreadcrumbsFromHtml(html);
  const headline = cleanText($(".product-headline-description").text());
  const description =
    accordionSectionText($, /description/i) ?? (headline || null);

  const domSpecs = extractFoxDomSpecs(html);
  const sizes = parseFoxSelectableSizes(html);
  if (sizes.length > 0) {
    domSpecs["Available sizes"] = sizes.join(", ");
  }

  const variants = parseFoxColorVariantsFromHtml(html, pid);
  const currentVariant = variants.find((v) => v.code === pid);
  const hasSizePicker = $("button.size-attribute").length > 0;
  const unavailable =
    (currentVariant != null && !currentVariant.is_orderable) ||
    (hasSizePicker && sizes.length === 0);

  const raw_specs = Object.keys(domSpecs).length > 0 ? domSpecs : null;

  return {
    category_path,
    raw_specs,
    variants: variants.length > 0 ? variants : undefined,
    ...(unavailable ? { unavailable: true } : {}),
    ...(description && description.length >= 20 ? { description } : {}),
  };
}

export async function enrichFoxRacingPdp(productUrl: string): Promise<EnrichResult> {
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
    const result = enrichFoxRacingPdpFromHtml(html);
    await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
    return result;
  } catch (err) {
    console.error("[scraper] Fox Racing PDP enrich failed:", err);
    return { category_path: null, raw_specs: null };
  }
}
