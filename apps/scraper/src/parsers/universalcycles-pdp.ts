import * as cheerio from "cheerio";

import { BROWSER_USER_AGENT, ENRICH_DELAY_MS } from "../config.js";
import type { EnrichResult } from "./jensonusa.js";
import type { PdpEnrichVariant } from "./jensonusa-pdp.js";
import {
  parseMsrpFromText,
  parseProductIdFromUrl,
  parseUsdPrice,
} from "./universalcycles-plp.js";

function cleanText(t: string | null | undefined): string {
  return (t || "").replace(/\s+/g, " ").trim();
}

export function parseProductIdFromPdpUrl(url: string): string | null {
  try {
    return parseProductIdFromUrl(new URL(url).pathname + new URL(url).search);
  } catch {
    return parseProductIdFromUrl(url);
  }
}

function parseSpecsFromPageContent(html: string): Record<string, string> | null {
  const $ = cheerio.load(html);
  const content = $("#PageContent").html();
  if (!content) return null;
  const specs: Record<string, string> = {};
  const $c = cheerio.load(content);
  $c("li").each((_, el) => {
    const line = cleanText($c(el).text());
    const m = /^([^:]+):\s*(.+)$/.exec(line);
    if (m) {
      specs[cleanText(m[1])] = cleanText(m[2]);
    }
  });
  return Object.keys(specs).length > 0 ? specs : null;
}

export function extractUniversalCyclesDescription(html: string): string | null {
  const $ = cheerio.load(html);
  const pageContent = cleanText($("#PageContent").text());
  if (pageContent.length >= 20) return pageContent;
  const og = cleanText($('meta[property="og:description"]').attr("content"));
  if (og.length >= 20) return og;
  const meta = cleanText($('meta[name="description"]').attr("content"));
  return meta.length >= 20 ? meta : null;
}

function attributeBlockIsOrderable(blockHtml: string): boolean {
  if (/Notify When[\s\S]*In Stock/i.test(blockHtml)) return false;
  if (/Currently Out of Stock/i.test(blockHtml)) return false;
  if (/Shipping Not Available/i.test(blockHtml) && !/Add to Cart/i.test(blockHtml)) {
    return false;
  }
  return /id="addToCart_\d+"[^>]*href="[^"]*cart_add\.php/i.test(blockHtml);
}

function parseAttributePrices(blockHtml: string): {
  currentPrice: number | null;
  originalPrice: number | null;
} {
  const $ = cheerio.load(blockHtml);
  const priceText = $("b.big").first().text();
  const currentPrice = parseUsdPrice(priceText);
  const originalPrice = parseMsrpFromText($.root().text());
  return { currentPrice, originalPrice };
}

function parseCompositeSku(
  blockHtml: string,
  productId: string,
  attributeId: string,
): string {
  const m = new RegExp(
    `(${productId}-${attributeId})`,
    "i",
  ).exec(blockHtml);
  if (m) return m[1];
  return `${productId}-${attributeId}`;
}

export function parseUniversalCyclesAttributesFromHtml(
  html: string,
  productUrl: string,
): PdpEnrichVariant[] {
  const productId = parseProductIdFromPdpUrl(productUrl);
  if (!productId) return [];

  const $ = cheerio.load(html);
  const variants: PdpEnrichVariant[] = [];

  $('[id^="attribute_"]').each((_, el) => {
    const idAttr = $(el).attr("id") ?? "";
    const attributeId = /^attribute_(\d+)$/.exec(idAttr)?.[1];
    if (!attributeId) return;

    const blockHtml = $.html(el);
    const label = cleanText($(el).find("h4.text-left").first().text());
    const dimensions = label ? { Option: label } : {};
    const { currentPrice, originalPrice } = parseAttributePrices(blockHtml);
    const code = parseCompositeSku(blockHtml, productId, attributeId);

    variants.push({
      code,
      dimensions,
      is_orderable: attributeBlockIsOrderable(blockHtml),
      ...(currentPrice != null ? { current_price: currentPrice } : {}),
      ...(originalPrice != null ? { original_price: originalPrice } : {}),
    });
  });

  return variants;
}

export function enrichUniversalCyclesPdpFromHtml(
  html: string,
  productUrl: string,
): EnrichResult {
  if (/404|not found|page cannot be found/i.test(html) && html.length < 5000) {
    return { category_path: null, raw_specs: null, unavailable: true };
  }

  const variants = parseUniversalCyclesAttributesFromHtml(html, productUrl);
  const description = extractUniversalCyclesDescription(html);
  const raw_specs = parseSpecsFromPageContent(html);

  return {
    category_path: null,
    raw_specs,
    ...(description ? { description } : {}),
    ...(variants.length > 0 ? { variants } : {}),
  };
}

export async function enrichUniversalCyclesPdp(
  productUrl: string,
): Promise<EnrichResult> {
  try {
    const res = await fetch(productUrl, {
      redirect: "follow",
      headers: {
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": BROWSER_USER_AGENT,
      },
    });
    if (res.status === 404) {
      return { category_path: null, raw_specs: null, unavailable: true };
    }
    if (!res.ok) {
      throw new Error(`fetch ${res.status}: ${res.statusText}`);
    }
    const html = await res.text();
    const result = enrichUniversalCyclesPdpFromHtml(html, productUrl);
    await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
    return result;
  } catch (err) {
    console.error("[scraper] Universal Cycles PDP enrich failed:", err);
    return { category_path: null, raw_specs: null };
  }
}
