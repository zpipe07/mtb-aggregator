import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

import { BROWSER_USER_AGENT, SCRAPER_MAX_PRODUCTS } from "../config.js";
import type { ScrapeResult } from "../types.js";

export const UC_ORIGIN = "https://www.universalcycles.com";

const PRODUCT_BOX_RE =
  /<div class="col-xs-12 col-sm-4 col-md-3 col-lg-3 text-center product-box"[\s\S]*?<div class="visible-xs"><br><br><\/div><\/div>/g;

const USD_AMOUNT = String.raw`([\d,]+(?:\.\d{1,2})?)`;

function parsePriceToken(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseUsdPrice(text: string): number | null {
  const trimmed = text.trim();
  const fromMatch = new RegExp(String.raw`from\s*:?\s*\$?\s*${USD_AMOUNT}`, "i").exec(
    trimmed,
  );
  if (fromMatch) return parsePriceToken(fromMatch[1]);
  const m = new RegExp(String.raw`\$?\s*${USD_AMOUNT}`).exec(trimmed);
  return parsePriceToken(m?.[1]);
}

export function parseMsrpFromText(text: string): number | null {
  const m = new RegExp(String.raw`MSRP\s*:\s*\$?\s*${USD_AMOUNT}`, "i").exec(text);
  return parsePriceToken(m?.[1]);
}

/** Prefer overstock sale price when both regular and overstock lines exist. */
export function parseSalePricesFromBoxText(text: string): {
  currentPrice: number | null;
  originalPrice: number | null;
} {
  const overstockMatch = new RegExp(
    String.raw`Overstock Item From:\s*\$?\s*${USD_AMOUNT}`,
    "i",
  ).exec(text);
  const fromMatch = new RegExp(String.raw`From:\s*\$?\s*${USD_AMOUNT}`, "i").exec(text);
  let currentPrice: number | null = null;
  if (overstockMatch) {
    currentPrice = parsePriceToken(overstockMatch[1]);
  } else if (fromMatch) {
    currentPrice = parsePriceToken(fromMatch[1]);
  }
  return {
    currentPrice,
    originalPrice: parseMsrpFromText(text),
  };
}

export function splitCategoryHeader(header: string): string[] | null {
  const t = header.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.includes(" - ")) {
    const [a, b] = t.split(" - ", 2).map((s) => s.trim());
    if (a && b) return [a, b];
  }
  const words = t.split(/\s+/);
  if (words.length >= 3) {
    if (/^\d/.test(words[1] ?? "")) {
      return [words[0], words.slice(1).join(" ")];
    }
    return [words.slice(0, 2).join(" "), words.slice(2).join(" ")];
  }
  if (words.length === 2) return [words[0], words[1]];
  return [t];
}

export function extractBrandFromProductName(name: string): string | null {
  const t = name.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const words = t.split(/\s+/);
  if (words.length >= 2 && /^[A-Z0-9]/.test(words[1])) {
    if (/^(Racing|Creek|Face|Ten|Stop|Swiss|Garneau|Industries|Components|Bicycles|Designs|Concepts|Wheels|Tool|Izumi)$/i.test(words[1])) {
      return `${words[0]} ${words[1]}`;
    }
  }
  return words[0] ?? null;
}

export function parseProductIdFromUrl(href: string): string | null {
  const m = /product_details\.php\?id=(\d+)/i.exec(href);
  return m?.[1] ?? null;
}

export function buildSpecialsPageUrl(baseUrl: string, page: number): string {
  const u = new URL(baseUrl, UC_ORIGIN);
  if (page <= 1) {
    u.searchParams.delete("resultpage");
    return u.toString();
  }
  u.searchParams.set("resultpage", String(page));
  return u.toString();
}

export function parseMaxResultPage(html: string): number {
  let max = 1;
  const re = /specials\.php\?resultpage=(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function parseProductBoxHtml(
  boxHtml: string,
  category_path: string[] | null,
): ScrapeResult | null {
  const $ = cheerio.load(boxHtml);
  const link = $('a[href*="product_details.php?id="]').first();
  const href = link.attr("href");
  if (!href) return null;
  const productId = parseProductIdFromUrl(href);
  if (!productId) return null;

  const title = (link.attr("title") ?? link.text()).replace(/\s+/g, " ").trim();
  const subtitle = $("i.text-muted").first().text().replace(/\s+/g, " ").trim();
  const product_name = subtitle ? `${title} — ${subtitle}` : title;
  if (!product_name) return null;

  const text = $.root().text();
  const { currentPrice, originalPrice } = parseSalePricesFromBoxText(text);
  if (currentPrice === null) return null;

  const img = $('img[src*="/images/products/small/"]').first().attr("src");
  const image_url = img
    ? img.startsWith("http")
      ? img
      : `${UC_ORIGIN}${img.startsWith("/") ? img : `/${img}`}`
    : `${UC_ORIGIN}/images/products/small/${productId}.jpg`;

  const brand = extractBrandFromProductName(title);
  const product_url = href.startsWith("http")
    ? href
    : `${UC_ORIGIN}${href.startsWith("/") ? href : `/${href}`}`;

  return {
    store_sku: productId,
    product_name,
    current_price: currentPrice,
    original_price: originalPrice,
    product_url,
    image_url,
    brand,
    category_path,
    is_in_stock: true,
    product_group_key: productId,
  };
}

export function parseUniversalCyclesSpecialsHtml(html: string): ScrapeResult[] {
  const results: ScrapeResult[] = [];
  const seenSku = new Set<string>();

  const sections = html.split(/<h4 id="sortName\d+" class="well well-sm"[^>]*>/i);
  for (let si = 1; si < sections.length; si++) {
    const section = sections[si];
    const headerClose = section.indexOf("</h4>");
    if (headerClose < 0) continue;
    const headerInner = section.slice(0, headerClose);
    const headerText = cheerio.load(`<span>${headerInner}</span>`)("span")
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const category_path = splitCategoryHeader(headerText);
    const body = section.slice(headerClose + 5);

    const boxes = body.match(PRODUCT_BOX_RE) ?? [];
    for (const boxHtml of boxes) {
      const row = parseProductBoxHtml(boxHtml, category_path);
      if (!row || seenSku.has(row.store_sku)) continue;
      seenSku.add(row.store_sku);
      results.push(row);
    }
  }

  return results;
}

export function loadUniversalCyclesFixture(name: string): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    join(dir, "__fixtures__", "universalcycles", name),
    "utf8",
  );
}

async function fetchSpecialsPage(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": BROWSER_USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`Universal Cycles specials ${res.status}: ${res.statusText}`);
  }
  return res.text();
}

export async function scrapeUniversalCyclesSalePl(
  url: string,
): Promise<ScrapeResult[]> {
  const firstHtml = await fetchSpecialsPage(buildSpecialsPageUrl(url, 1));
  const maxPage = parseMaxResultPage(firstHtml);
  const all: ScrapeResult[] = [];
  const seenSku = new Set<string>();

  for (let page = 1; page <= maxPage; page++) {
    const html =
      page === 1 ? firstHtml : await fetchSpecialsPage(buildSpecialsPageUrl(url, page));
    for (const row of parseUniversalCyclesSpecialsHtml(html)) {
      if (seenSku.has(row.store_sku)) continue;
      seenSku.add(row.store_sku);
      all.push(row);
      if (SCRAPER_MAX_PRODUCTS > 0 && all.length >= SCRAPER_MAX_PRODUCTS) {
        return all;
      }
    }
  }

  console.log(
    `[scraper] Universal Cycles: ${all.length} products from ${maxPage} page(s)`,
  );
  return all;
}
