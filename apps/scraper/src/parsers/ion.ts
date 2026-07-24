import type { ScrapeResult } from "../types.js";
import type { EnrichResult } from "./jensonusa.js";
import * as cheerio from "cheerio";
import { SCRAPER_MAX_PRODUCTS } from "../config.js";

const BASE_URL = "https://www.ion-products.com";
const ARTICLE_NUMBER_RE = /47\d{3}-\d{4}/g;
const USER_AGENT = "MTBDealBot/1.0 (+https://github.com/mtb-aggregator)";

interface ShopifyStoreConfig {
  domain: string;
  token: string;
}

interface IonVariant {
  ean?: string;
  price?: string;
  color?: string;
  size?: string;
  availableForSale?: boolean;
  image?: { filename?: string };
}

interface IonProduct {
  articleNumber: string;
  webname?: string;
  vendor?: string;
  category?: string;
  commonCategory?: string;
  handle?: string;
  fromPrice?: number;
  description?: string;
  descriptionShort?: string;
  keyFeatures?: string[];
  materials?: string[];
  harnessSpecs?: Record<string, string>;
  variants?: IonVariant[];
}

interface RegionalAvailability {
  region: string;
  language: string;
  handle?: string;
  path?: string;
}

interface ShopifyVariantNode {
  sku?: string;
  title?: string;
  price?: { amount: string };
  compareAtPrice?: { amount: string } | null;
  availableForSale?: boolean;
}

interface ShopifyProductResponse {
  data?: {
    product?: {
      title?: string;
      handle?: string;
      variants?: {
        edges?: Array<{ node: ShopifyVariantNode }>;
      };
    } | null;
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`${url} ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function extractArticleNumbers(html: string): string[] {
  const fromProducts = [
    ...html.matchAll(/\/en\/us\/products\/[^"?\s]*-(47\d{3}-\d{4})/g),
  ].map((m) => m[1]);
  const fromBody = [...html.matchAll(ARTICLE_NUMBER_RE)].map((m) => m[0]);
  return [...new Set([...fromProducts, ...fromBody])];
}

/** Public Shopify Storefront tokens are embedded in ION's Nuxt SSR config. */
export function parseShopifyStoresFromNuxtHtml(
  html: string,
): ShopifyStoreConfig[] {
  const stores: ShopifyStoreConfig[] = [];
  const seen = new Set<string>();
  const re = /\w+:\{domain:"([^"]+)",storefrontAccessToken:"([^"]+)"/g;
  for (const match of html.matchAll(re)) {
    const domain = match[1];
    const token = match[2];
    if (seen.has(domain)) continue;
    seen.add(domain);
    stores.push({ domain, token });
  }
  return stores.sort((a, b) => {
    const rank = (domain: string) =>
      domain.startsWith("secure-us.")
        ? 0
        : domain === "secure.ion-products.com"
          ? 1
          : 2;
    return rank(a.domain) - rank(b.domain);
  });
}

function extractArticleNumberFromUrl(productUrl: string): string | null {
  const match = productUrl.match(/(47\d{3}-\d{4})(?:[/?#]|$)/);
  return match?.[1] ?? null;
}

async function fetchRegionalAvailability(
  articleNumber: string,
): Promise<RegionalAvailability[]> {
  return fetchJson<RegionalAvailability[]>(
    `${BASE_URL}/api/product/regionalAvailability/${articleNumber}`,
  );
}

function usProductUrl(
  regional: RegionalAvailability[],
  articleNumber: string,
): string {
  const us = regional.find((r) => r.region === "us" && r.language === "en");
  if (us?.path) {
    return `${BASE_URL}${us.path}`;
  }
  return `${BASE_URL}/en/us/products/${articleNumber}`;
}

async function fetchShopifyVariants(
  handle: string,
  stores: ShopifyStoreConfig[],
): Promise<ShopifyVariantNode[]> {
  const query = `query($handle:String!){
    product(handle:$handle){
      variants(first:100){
        edges{ node{ sku title price{amount} compareAtPrice{amount} availableForSale } }
      }
    }
  }`;

  for (const store of stores) {
    const res = await fetch(
      `https://${store.domain}/api/2024-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": store.token,
        },
        body: JSON.stringify({ query, variables: { handle } }),
      },
    );
    if (!res.ok) continue;
    const data = (await res.json()) as ShopifyProductResponse;
    const edges = data.data?.product?.variants?.edges;
    if (edges && edges.length > 0) {
      return edges.map((e) => e.node);
    }
  }
  return [];
}

function shopifyBySku(
  variants: ShopifyVariantNode[],
): Map<string, ShopifyVariantNode> {
  const map = new Map<string, ShopifyVariantNode>();
  for (const v of variants) {
    if (v.sku) map.set(v.sku, v);
  }
  return map;
}

function capitalizeCategory(value: string): string {
  return value
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function buildCategoryPath(product: IonProduct): string[] | null {
  const raw = product.commonCategory ?? product.category;
  if (!raw) return null;
  return [capitalizeCategory(raw)];
}

function buildVariantOptions(
  variant: IonVariant,
): Record<string, string> | null {
  const opts: Record<string, string> = {};
  if (variant.color) opts.Color = variant.color;
  if (variant.size) opts.Size = variant.size;
  return Object.keys(opts).length > 0 ? opts : null;
}

/**
 * Scrape ION Bike sale listings.
 * ION uses a Nuxt storefront with Boards & More product APIs and Shopify checkout
 * (not standard /collections/.../products.json). Sale page SSR embeds article numbers;
 * per-variant USD pricing comes from the Shopify Storefront API.
 */
export async function scrapeIon(saleUrl: string): Promise<ScrapeResult[]> {
  const pageRes = await fetch(saleUrl, {
    headers: { Accept: "text/html", "User-Agent": USER_AGENT },
  });
  if (!pageRes.ok) {
    throw new Error(`sale page ${pageRes.status}: ${pageRes.statusText}`);
  }
  const html = await pageRes.text();
  const articleNumbers = extractArticleNumbers(html);
  const shopifyStores = parseShopifyStoresFromNuxtHtml(html);
  const results: ScrapeResult[] = [];

  for (const articleNumber of articleNumbers) {
    try {
      const [product, regional] = await Promise.all([
        fetchJson<IonProduct>(`${BASE_URL}/api/product/${articleNumber}`),
        fetchRegionalAvailability(articleNumber),
      ]);

      const usEntry = regional.find(
        (r) => r.region === "us" && r.language === "en",
      );
      const shopifyHandle = usEntry?.handle ?? product.handle;
      const productUrl = usProductUrl(regional, articleNumber);
      const shopifyVariants =
        shopifyHandle && shopifyStores.length > 0
          ? await fetchShopifyVariants(shopifyHandle, shopifyStores)
          : [];
      const shopifyMap = shopifyBySku(shopifyVariants);
      const categoryPath = buildCategoryPath(product);
      const brand = product.vendor?.trim() || "ION";

      for (const variant of product.variants ?? []) {
        const ean = variant.ean?.trim();
        const shopify = ean ? shopifyMap.get(ean) : undefined;
        const currentPrice = shopify?.price?.amount
          ? parseFloat(shopify.price.amount)
          : variant.price
            ? parseFloat(variant.price)
            : NaN;
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;

        let originalPrice: number | null = null;
        if (shopify?.compareAtPrice?.amount) {
          const compare = parseFloat(shopify.compareAtPrice.amount);
          if (Number.isFinite(compare) && compare > currentPrice) {
            originalPrice = compare;
          }
        }

        if (originalPrice === null) continue;

        const storeSku = ean || `${articleNumber}-${variant.color ?? ""}-${variant.size ?? ""}`;
        const variantOpts = buildVariantOptions(variant);
        const imageUrl = variant.image?.filename ?? null;
        const isInStock = shopify?.availableForSale ?? variant.availableForSale ?? false;

        results.push({
          store_sku: storeSku,
          product_name: product.webname ?? articleNumber,
          current_price: currentPrice,
          original_price: originalPrice,
          product_url: productUrl,
          image_url: imageUrl,
          brand,
          category_path: categoryPath,
          is_in_stock: isInStock,
          product_group_key: articleNumber,
          ...(variantOpts ? { variant_options: variantOpts } : {}),
        });

        if (SCRAPER_MAX_PRODUCTS > 0 && results.length >= SCRAPER_MAX_PRODUCTS) {
          break;
        }
      }
    } catch (err) {
      console.error(`[scraper] Ion: failed ${articleNumber}:`, err);
    }

    if (SCRAPER_MAX_PRODUCTS > 0 && results.length >= SCRAPER_MAX_PRODUCTS) {
      break;
    }
  }

  const deduped = dedupeBySku(results);
  console.log(
    `[scraper] Ion: ${deduped.length} listings (${articleNumbers.length} product(s))`,
  );
  return deduped;
}

function dedupeBySku(results: ScrapeResult[]): ScrapeResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.store_sku)) return false;
    seen.add(r.store_sku);
    return true;
  });
}

function extractSpecsFromProduct(product: IonProduct): Record<string, string> | null {
  const specs: Record<string, string> = {};

  if (product.materials?.length) {
    specs.Materials = product.materials.join(", ");
  }
  if (product.keyFeatures?.length) {
    specs["Key features"] = product.keyFeatures.join("; ");
  }
  if (product.harnessSpecs) {
    for (const [k, v] of Object.entries(product.harnessSpecs)) {
      if (k && v) specs[k] = v;
    }
  }

  return Object.keys(specs).length > 0 ? specs : null;
}

function stripHtml(html: string): string | null {
  const $ = cheerio.load(html);
  const text = $.text().replace(/\s+/g, " ").trim();
  if (!text || text.length < 20) return null;
  return text.length > 8000 ? text.slice(0, 8000) : text;
}

/**
 * Enrich an ION product via the public /api/product/{articleNumber} endpoint.
 */
export async function enrichIon(productUrl: string): Promise<EnrichResult> {
  try {
    const articleNumber = extractArticleNumberFromUrl(productUrl);
    if (!articleNumber) {
      return { category_path: null, raw_specs: null };
    }

    const product = await fetchJson<IonProduct>(
      `${BASE_URL}/api/product/${articleNumber}`,
    );
    const categoryPath = buildCategoryPath(product);
    const rawSpecs = extractSpecsFromProduct(product);
    const description =
      (product.description && stripHtml(product.description)) ||
      product.descriptionShort?.trim() ||
      undefined;

    return {
      category_path: categoryPath,
      raw_specs: rawSpecs,
      description,
    };
  } catch (err) {
    console.error("[scraper] Ion enrich failed:", err);
    return { category_path: null, raw_specs: null };
  }
}
