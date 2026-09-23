/**
 * Shared Shopify collection JSON shapes for variant options (products.json).
 */

import * as cheerio from "cheerio";

export interface ShopifyVariantWithOptions {
  id: number;
  sku: string | null;
  price: string;
  compare_at_price: string | null;
  available: boolean;
  featured_image?: { src: string } | null;
  title?: string;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
}

export interface ShopifyProductOption {
  name: string;
  position?: number;
}

export interface ShopifyProductWithOptions {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  variants: ShopifyVariantWithOptions[];
  images?: { src: string }[];
  options?: ShopifyProductOption[];
}

const SCHEMA_ORG_URL = /^https?:\/\/schema\.org\//i;

/** Shopify dummy "Title" / "Default Title" and schema.org feed leftovers (ZAC-278, ZAC-281). */
export function isPlaceholderVariantOption(
  name: string,
  value: string,
): boolean {
  const n = name.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  const compact = name.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const v = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n || !v) return true;
  if (n === "title" || v === "default title") return true;
  if (n === "schema stock status" || n.startsWith("schema ") || compact.startsWith("schema")) {
    return true;
  }
  return SCHEMA_ORG_URL.test(value.trim());
}

/**
 * Map Shopify option1/2/3 to option names from product.options.
 * Falls back to generic "Option 1"… when `product.options` is missing but values exist,
 * then to `variant.title` (e.g. "Small / Black") when options are still empty — some
 * stores/API responses omit option names on the product but still send variant fields.
 * Placeholder options (`Title`/`Default Title`, schema.org stock) are omitted.
 */
export function buildVariantOptions(
  product: ShopifyProductWithOptions,
  variant: ShopifyVariantWithOptions,
): Record<string, string> | null {
  const names = product.options?.map((o) => o.name) ?? [];
  const vals = [variant.option1, variant.option2, variant.option3];
  const out: Record<string, string> = {};
  for (let i = 0; i < names.length && i < 3; i++) {
    const v = vals[i];
    if (v != null && String(v).trim() !== "") {
      const name = names[i];
      const value = String(v).trim();
      if (!isPlaceholderVariantOption(name, value)) out[name] = value;
    }
  }
  if (Object.keys(out).length === 0) {
    const fallbackNames = ["Option 1", "Option 2", "Option 3"];
    for (let i = 0; i < 3; i++) {
      const v = vals[i];
      if (v != null && String(v).trim() !== "") {
        const value = String(v).trim();
        if (!isPlaceholderVariantOption(fallbackNames[i], value)) {
          out[fallbackNames[i]] = value;
        }
      }
    }
  }
  if (Object.keys(out).length === 0 && variant.title != null) {
    const t = String(variant.title).trim();
    if (t !== "" && !isPlaceholderVariantOption("Variant", t)) {
      out.Variant = t;
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Ride Bicycles (and similar) use this Shopify product_type as a junk default
 * for pads, tools, locks, and analog MTBs (ZAC-273). It is also a collection
 * nav label, not a shoppable product category.
 */
const UNTRUSTED_SHOPIFY_PRODUCT_TYPES = new Set([
  "electric commuter & urban bikes",
]);

/** True when Shopify product_type is non-empty and not a known catch-all. */
export function isTrustedShopifyProductType(
  productType: string | undefined | null,
): boolean {
  const t = productType?.replace(/\s+/g, " ").trim();
  if (!t) return false;
  return !UNTRUSTED_SHOPIFY_PRODUCT_TYPES.has(t.toLowerCase());
}

/**
 * Prefer Shopify `product_type` from `/products/{handle}.json` for category_path.
 * HTML breadcrumbs are a fallback when product_type is missing or untrusted
 * (JSON-LD, DOM, collection links).
 */
export function resolveShopifyCategoryPath(
  productType: string | undefined | null,
  html: string | null,
): string[] | null {
  if (isTrustedShopifyProductType(productType)) {
    return [productType!.trim()];
  }
  return html ? extractBreadcrumbsFromHtml(html) : null;
}

/**
 * Reject collection H1s / marketing sentences that are not shoppable category labels.
 * Bikes Online ingested "Hardtail Mountain Bikes Conquer Every Trail with a Lightweight…"
 * as category_path (ZAC-234); bare "light" then mapped that to Accessories › Lights.
 */
export function isPlausibleCategoryLabel(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 60) return false;
  const words = t.split(" ").filter(Boolean);
  if (words.length > 8) return false;
  if (/conquer every|with a lightweight|dream ride|sale ends/i.test(t))
    return false;
  // Ride Bicycles catch-all collection / product_type (ZAC-273).
  if (/^electric commuter\s*(&|and)\s*urban bikes$/i.test(t)) return false;
  return true;
}

function plausibleCategoryLabels(items: string[]): string[] {
  return items.filter(isPlausibleCategoryLabel);
}

/**
 * Extract category breadcrumbs from product page HTML.
 * Tries: (1) JSON-LD BreadcrumbList, (2) DOM breadcrumb links, (3) Collection links section.
 */
export function extractBreadcrumbsFromHtml(html: string): string[] | null {
  const $ = cheerio.load(html);
  const clean = (text: string | null | undefined): string =>
    (text || "").replace(/\s+/g, " ").trim();

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
        if (
          json?.["@type"] === "BreadcrumbList" &&
          Array.isArray(json.itemListElement)
        ) {
          const items: string[] = [];
          for (const el2 of json.itemListElement) {
            const name = el2.name ?? el2.item?.name;
            if (name) items.push(clean(String(name)));
          }
          if (items.length >= 2) {
            let trimmed = items.slice(0, -1);
            if (trimmed[0] && /^home$/i.test(trimmed[0]))
              trimmed = trimmed.slice(1);
            trimmed = plausibleCategoryLabels(trimmed);
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

  const breadcrumbSelectors = [
    'nav[aria-label="Breadcrumb"] a',
    'nav[aria-label="breadcrumb"] a',
    ".breadcrumb a",
    ".breadcrumbs a",
    "[class*='breadcrumb'] a",
    "ol[class*='breadcrumb'] li a",
  ];
  for (const sel of breadcrumbSelectors) {
    const items: string[] = [];
    $(sel).each((_, el) => {
      const t = clean($(el).text());
      if (t) items.push(t);
    });
    if (items.length >= 2) {
      let trimmed = items.slice(0, -1);
      if (trimmed[0] && /^home$/i.test(trimmed[0])) trimmed = trimmed.slice(1);
      trimmed = plausibleCategoryLabels(trimmed);
      if (trimmed.length > 0) return trimmed;
    }
  }

  const collectionsLabel = $('*:contains("Collections:")').first();
  if (collectionsLabel.length) {
    const container = collectionsLabel.closest("div, section, p");
    const links = (container.length ? container : collectionsLabel).find(
      "a[href*='/collections/']",
    );
    const items: string[] = [];
    links.each((_, el) => {
      const t = clean($(el).text());
      if (t && isPlausibleCategoryLabel(t)) items.push(t);
    });
    if (items.length > 0) {
      const best = items.reduce((a, b) => (a.length <= b.length ? a : b));
      const parts = best
        .split(/\s*\/\s*/)
        .map((p) => clean(p))
        .filter((p) => isPlausibleCategoryLabel(p));
      return parts.length > 0 ? parts : [best];
    }
  }

  return null;
}
