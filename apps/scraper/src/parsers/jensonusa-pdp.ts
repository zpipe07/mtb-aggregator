/**
 * PDP `serverSideViewModel.variants[]` — structured per-variant data (size, color, isOrderable).
 * Parsed from server-rendered HTML (no client hydration required).
 */

import {
  dimensionKeyToLabel,
  extractDimensionString,
} from "./jensonusa-dto.js";

/** Fields on PDP variant objects that are not facet dimensions. */
const FIXED_PDP_VARIANT_FIELDS = new Set([
  "code",
  "stockDetails",
  "mainImage",
  "images",
  "swatchUrl",
  "brandName",
  "skuName",
  "weight",
  "order",
  "displayName",
  "availableQuantity",
  "isInWishlist",
  "isBestPrice",
  "showJensonCaresBadge",
  "soldOutCode",
  "gtin",
  "mfgPartNumber",
  "id",
  "isOrderable",
  "price",
]);

export interface PdpEnrichVariant {
  code: string;
  dimensions: Record<string, string>;
  is_orderable: boolean;
  /** Universal Cycles per-attribute sale price (optional). */
  current_price?: number;
  /** Universal Cycles per-attribute MSRP (optional). */
  original_price?: number | null;
}

function extractPdpVariantDimensions(
  variant: Record<string, unknown>,
): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(variant)) {
    if (FIXED_PDP_VARIANT_FIELDS.has(k)) continue;
    const s = extractDimensionString(val);
    if (s == null) continue;
    const label = dimensionKeyToLabel(k);
    if (label) out[label] = s;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Bracket-match a JSON array starting at `startIdx` where `html[startIdx] === '['`. */
function sliceBalancedJsonArray(html: string, startIdx: number): string | null {
  if (startIdx < 0 || startIdx >= html.length || html[startIdx] !== "[")
    return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = startIdx; j < html.length; j++) {
    const c = html[j];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return html.slice(startIdx, j + 1);
    }
  }
  return null;
}

/** Find index of `[` starting a `variants` JSON array (`"variants"` then `:` then optional WS then `[`). */
function findVariantsArrayBracketIndex(html: string, searchFrom: number): number {
  const needle = '"variants"';
  let idx = html.indexOf(needle, searchFrom);
  while (idx >= 0) {
    let i = idx + needle.length;
    while (i < html.length && /\s/.test(html[i])) i++;
    if (html[i] !== ":") {
      idx = html.indexOf(needle, idx + 1);
      continue;
    }
    i++;
    while (i < html.length && /\s/.test(html[i])) i++;
    if (html[i] === "[") return i;
    idx = html.indexOf(needle, idx + 1);
  }
  return -1;
}

/**
 * Locate `variants` JSON array in HTML, preferring the occurrence inside `serverSideViewModel` when present.
 */
export function findVariantsArrayJsonSlice(html: string): string | null {
  const anchor = html.indexOf("serverSideViewModel");
  const bracketStart =
    anchor >= 0
      ? findVariantsArrayBracketIndex(html, anchor)
      : findVariantsArrayBracketIndex(html, 0);
  if (bracketStart < 0) return null;
  return sliceBalancedJsonArray(html, bracketStart);
}

/** Parse PDP HTML and return normalized variant rows for enrichment API. */
export function parsePdpVariantsFromHtml(html: string): PdpEnrichVariant[] {
  const slice = findVariantsArrayJsonSlice(html);
  if (!slice) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(slice);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const out: PdpEnrichVariant[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const codeRaw = v.code;
    if (typeof codeRaw !== "string" || !codeRaw.trim()) continue;
    const dims = extractPdpVariantDimensions(v);
    if (!dims) continue;
    out.push({
      code: codeRaw.trim(),
      dimensions: dims,
      is_orderable: v.isOrderable === true,
    });
  }
  return out;
}
