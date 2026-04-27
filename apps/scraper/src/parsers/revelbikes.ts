import type { ScrapeResult } from "../types.js";
import * as cheerio from "cheerio";
import { SCRAPER_MAX_PRODUCTS } from "../config.js";
import type { EnrichResult } from "./jensonusa.js";
import {
  buildVariantOptions,
  type ShopifyProductWithOptions,
  type ShopifyVariantWithOptions,
} from "./shopify-helpers.js";

const PER_PAGE = 250;

type ShopifyVariant = ShopifyVariantWithOptions;
type ShopifyProduct = ShopifyProductWithOptions;

interface ShopifyCollectionResponse {
  products: ShopifyProduct[];
}

interface ShopifyProductDetail {
  body_html?: string;
  product_type?: string;
}

interface ShopifyProductDetailResponse {
  product?: ShopifyProductDetail;
}

function fetchPage(collectionUrl: string, page: number): Promise<ShopifyProduct[]> {
  const url = new URL(collectionUrl);
  const origin = url.origin;
  const pathname = url.pathname.replace(/\/$/, "");
  const jsonUrl = `${origin}${pathname}/products.json?limit=${PER_PAGE}&page=${page}`;

  return fetch(jsonUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MTBDealBot/1.0 (+https://github.com/mtb-aggregator)",
    },
  }).then(async (res) => {
    if (!res.ok) throw new Error(`products.json ${res.status}: ${res.statusText}`);
    const data = (await res.json()) as ShopifyCollectionResponse;
    return data.products ?? [];
  });
}

/**
 * Scrape Revel Bikes "The Boneyard" sale collection via Shopify's products.json API.
 * No browser required; uses fetch + JSON.
 */
export async function scrapeRevelBikes(collectionUrl: string): Promise<ScrapeResult[]> {
  const url = new URL(collectionUrl);
  const origin = url.origin;
  const results: ScrapeResult[] = [];
  let page = 1;

  while (true) {
    const products = await fetchPage(collectionUrl, page);
    if (products.length === 0) break;

    for (const product of products) {
      if (!product.variants?.length) continue;

      for (const variant of product.variants) {
        const currentPrice = parseFloat(variant.price);
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;

        const originalPrice = variant.compare_at_price
          ? parseFloat(variant.compare_at_price)
          : null;
        if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice <= 0)) continue;

        const productUrl = `${origin}/products/${product.handle}`;
        const imageUrl = variant.featured_image?.src ?? product.images?.[0]?.src ?? null;
        const storeSku = variant.sku?.trim() || `v${variant.id}`;
        const categoryPath = product.product_type ? [product.product_type] : null;
        const variantOpts = buildVariantOptions(product, variant);

        results.push({
          store_sku: storeSku,
          product_name: product.title,
          current_price: currentPrice,
          original_price: originalPrice ?? null,
          product_url: productUrl,
          image_url: imageUrl,
          brand: product.vendor || null,
          category_path: categoryPath,
          is_in_stock: variant.available,
          product_group_key: product.handle,
          ...(variantOpts ? { variant_options: variantOpts } : {}),
        });
        if (SCRAPER_MAX_PRODUCTS > 0 && results.length >= SCRAPER_MAX_PRODUCTS)
          break;
      }
      if (SCRAPER_MAX_PRODUCTS > 0 && results.length >= SCRAPER_MAX_PRODUCTS)
        break;
    }

    if (products.length < PER_PAGE) break;
    if (SCRAPER_MAX_PRODUCTS > 0 && results.length >= SCRAPER_MAX_PRODUCTS)
      break;
    page++;
  }

  const deduped = results.filter((r, i, arr) => arr.findIndex((x) => x.store_sku === r.store_sku) === i);
  console.log(`[scraper] Revel Bikes: ${deduped.length} listings (${page} page(s))`);
  return deduped;
}

/**
 * Parse Revel PDP `body_html`: spec blocks are `<p><strong>KEY:</strong><br>value</p>`.
 * Exported for unit tests.
 */
export function parseRevelProductBodyHtml(bodyHtml: string): {
  raw_specs: Record<string, string> | null;
  description?: string;
} {
  const trimmed = bodyHtml.trim();
  if (!trimmed) {
    return { raw_specs: null };
  }

  try {
    const $ = cheerio.load(trimmed);
    const specs: Record<string, string> = {};
    const specParagraphEls: cheerio.Element[] = [];

    $("p").each((_, el) => {
      const p = $(el);
      const strong = p.find("strong").first();
      if (!strong.length) return;
      const strongText = strong.text().replace(/\s+/g, " ").trim();
      if (!/:\s*$/.test(strongText)) return;
      const key = strongText.replace(/:\s*$/, "").trim();
      if (!key || key.length > 80) return;

      const innerHtml = p.html() ?? "";
      const brIdx = innerHtml.search(/<br\s*\/?\s*>/i);
      const valueHtml = brIdx >= 0 ? innerHtml.slice(brIdx) : "";
      const value = cheerio
        .load(`<div>${valueHtml}</div>`)("div")
        .text()
        .replace(/\s+/g, " ")
        .trim();
      if (!value || value.length > 400) return;
      specs[key] = value;
      specParagraphEls.push(el);
    });

    for (const el of specParagraphEls) {
      $(el).remove();
    }

    const text = $.root().text().replace(/\s+/g, " ").trim();
    let description: string | undefined;
    if (text.length >= 50) {
      description = text.length > 8000 ? text.slice(0, 8000) : text;
    }

    return {
      raw_specs: Object.keys(specs).length > 0 ? specs : null,
      ...(description ? { description } : {}),
    };
  } catch {
    return { raw_specs: null };
  }
}

async function fetchRevelProductDetail(productUrl: string): Promise<ShopifyProductDetail> {
  const url = new URL(productUrl);
  const origin = url.origin;
  const parts = url.pathname.split("/").filter(Boolean);
  const handle = parts[parts.length - 1];
  const jsonUrl = `${origin}/products/${handle}.json`;

  const res = await fetch(jsonUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MTBDealBot/1.0 (+https://github.com/mtb-aggregator)",
    },
  });
  if (!res.ok) {
    throw new Error(`product.json ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as ShopifyProductDetailResponse;
  return data.product ?? {};
}

/**
 * Enrich a Revel Bikes PDP via Shopify `/products/{handle}.json`.
 * Extracts `raw_specs` from strong+br paragraphs in `body_html` and a prose description
 * (remaining text after removing spec paragraphs). LLM canonical classification runs in the API.
 */
export async function enrichRevelBikes(productUrl: string): Promise<EnrichResult> {
  try {
    const detail = await fetchRevelProductDetail(productUrl);
    const categoryPath =
      detail.product_type && detail.product_type.trim()
        ? [detail.product_type.trim()]
        : null;

    if (!detail.body_html) {
      return { category_path: categoryPath, raw_specs: null };
    }

    const { raw_specs, description } = parseRevelProductBodyHtml(detail.body_html);
    return {
      category_path: categoryPath,
      raw_specs,
      ...(description ? { description } : {}),
    };
  } catch (err) {
    console.error("[scraper] Revel Bikes enrich failed:", err);
    return {
      category_path: null,
      raw_specs: null,
    };
  }
}
