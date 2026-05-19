/**
 * Competitive Cyclist PDP JSON-LD `hasVariant[]` — per-SKU size/color/availability.
 */

import * as cheerio from "cheerio";
import type { PdpEnrichVariant } from "./jensonusa-pdp.js";

const DIMENSION_KEYS: Record<string, string> = {
  size: "Size",
  color: "Color",
};

function jsonLdNodes(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj["@graph"])) return obj["@graph"];
    return [parsed];
  }
  return [];
}

function isProductType(t: unknown): boolean {
  if (typeof t === "string") {
    return t === "Product" || t === "ProductGroup";
  }
  if (Array.isArray(t)) {
    return t.some((x) => x === "Product" || x === "ProductGroup");
  }
  return false;
}

function cleanText(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function variantDimensions(v: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, label] of Object.entries(DIMENSION_KEYS)) {
    const val = cleanText(v[rawKey]);
    if (val) out[label] = val;
  }
  return out;
}

function offerAvailabilityInStock(offers: unknown): boolean {
  if (!offers || typeof offers !== "object") return true;
  const o = offers as Record<string, unknown>;
  const avail = cleanText(o.availability).toLowerCase();
  if (!avail) return true;
  return avail.includes("instock");
}

function parseHasVariantEntry(v: unknown): PdpEnrichVariant | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  const sku = cleanText(obj.sku);
  if (!sku) return null;
  const dimensions = variantDimensions(obj);
  return {
    code: sku,
    dimensions,
    is_orderable: offerAvailabilityInStock(obj.offers),
  };
}

/** Extract hasVariant rows from application/ld+json scripts in PDP HTML. */
export function parseHasVariantsFromHtml(html: string): PdpEnrichVariant[] {
  return debugHasVariantParse(html).variants;
}

export type HasVariantParseDebug = {
  ldJsonScriptCount: number;
  productNodesWithHasVariant: number;
  variants: PdpEnrichVariant[];
  /** Heuristics for bot/WAF pages that block JSON-LD. */
  htmlBytes: number;
  looksLikeWaf: boolean;
};

/** Parse stats for logging when variant grouping fails. */
export function debugHasVariantParse(html: string): HasVariantParseDebug {
  const $ = cheerio.load(html);
  const out: PdpEnrichVariant[] = [];
  const seen = new Set<string>();
  let ldJsonScriptCount = 0;
  let productNodesWithHasVariant = 0;

  const hay = html.slice(0, 120_000).toLowerCase();
  const looksLikeWaf =
    html.length < 500 ||
    hay.includes("human verification") ||
    hay.includes("gokuprops") ||
    hay.includes("aws-waf");

  $('script[type="application/ld+json"]').each((_, el) => {
    ldJsonScriptCount++;
    try {
      const parsed = JSON.parse($(el).html() ?? "{}");
      for (const node of jsonLdNodes(parsed)) {
        if (!node || typeof node !== "object") continue;
        const obj = node as Record<string, unknown>;
        if (!isProductType(obj["@type"])) continue;
        const raw = obj.hasVariant;
        if (!Array.isArray(raw)) continue;
        productNodesWithHasVariant++;
        for (const entry of raw) {
          const row = parseHasVariantEntry(entry);
          if (!row || seen.has(row.code)) continue;
          seen.add(row.code);
          out.push(row);
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  });

  return {
    ldJsonScriptCount,
    productNodesWithHasVariant,
    variants: out,
    htmlBytes: html.length,
    looksLikeWaf,
  };
}
