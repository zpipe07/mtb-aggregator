/**
 * Parses JensonUSA product DTO into normalized fields.
 * Documented structure: { listPrice: { amount }, msrpPrice: { amount } } on selectedVariant or root.
 * This module is unit-tested to catch DTO structure changes.
 */

export interface JensonProductDto {
  name?: string;
  url?: string;
  code?: string;
  brand?: string;
  catalogNodeCodes?: string[];
  listPrice?: { amount?: number };
  msrpPrice?: { amount?: number };
  imageUrl?: string;
  selectedVariant?: {
    listPrice?: { amount?: number };
    msrpPrice?: { amount?: number };
    imageUrl?: string;
  };
}

export interface ParsedProduct {
  sku: string;
  name: string;
  url: string;
  currentPrice: number | null;
  originalPrice: number | null;
  imageUrl: string | null;
  brand: string | null;
  category_path: string[] | null;
}

function parsePriceFromText(text: string): number | null {
  const m = (text || "").replace(/,/g, "").match(/\$?([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function deriveCategory(codes: string[] | undefined, brand: string | null): string | null {
  if (!codes || !Array.isArray(codes)) return null;
  const brandLower = (brand || "").toLowerCase();
  for (const c of codes) {
    if (!c || typeof c !== "string") continue;
    if (c.toLowerCase() === brandLower) continue;
    if (c.toLowerCase().includes("sale")) continue;
    if (/^\d{8,}$/.test(c) || /^C\d{7}$/.test(c)) continue;
    const seg = c.split("-")[0];
    if (seg && seg.length > 2) return seg;
  }
  return null;
}

/**
 * Extract original_price (MSRP) from DTO. Uses msrpPrice - the actual JensonUSA field.
 * Fallback: parse "MSRP $X" from container text.
 */
function extractOriginalPrice(dto: JensonProductDto, containerText?: string): number | null {
  const sv = dto.selectedVariant;
  if (sv?.msrpPrice?.amount != null) return sv.msrpPrice.amount;
  if (dto.msrpPrice?.amount != null) return dto.msrpPrice.amount;
  if (containerText) {
    const msrpMatch = containerText.replace(/\s+/g, " ").match(/MSRP\s*\$?[\d,]+\.?\d*/);
    if (msrpMatch) return parsePriceFromText(msrpMatch[0]);
  }
  return null;
}

/**
 * Extract current_price from DTO. Uses listPrice - the sale/current price.
 */
function extractCurrentPrice(dto: JensonProductDto, fallbackText?: string): number | null {
  const sv = dto.selectedVariant;
  if (sv?.listPrice?.amount != null) return sv.listPrice.amount;
  if (dto.listPrice?.amount != null) return dto.listPrice.amount;
  if (fallbackText) return parsePriceFromText(fallbackText);
  return null;
}

/**
 * Parse a JensonUSA product DTO into normalized fields.
 * @param dto - Parsed JSON from data-product-result-dto
 * @param containerText - Optional card/container text for MSRP regex fallback
 * @param imageUrlFromDom - Optional image URL from DOM (img.src) when DTO has none
 */
export function parseProductDto(
  dto: JensonProductDto,
  containerText?: string,
  imageUrlFromDom?: string | null
): ParsedProduct | null {
  const name = dto.name;
  const urlPath = (dto.url || "").replace(/^\//, "");
  if (!name || !urlPath) return null;

  const baseUrl = "https://www.jensonusa.com";
  const url = urlPath.startsWith("http") ? urlPath : `${baseUrl}/${urlPath}`;
  const sku = dto.code || urlPath;

  const currentPrice = extractCurrentPrice(dto, containerText);
  if (!currentPrice || currentPrice <= 0 || currentPrice >= 100000) return null;

  const originalPrice = extractOriginalPrice(dto, containerText);

  const sv = dto.selectedVariant;
  let imageUrl: string | null =
    (sv?.imageUrl as string) || (dto.imageUrl as string) || null;
  if (imageUrl?.startsWith("data:")) imageUrl = null;
  if (!imageUrl && imageUrlFromDom && !imageUrlFromDom.startsWith("data:"))
    imageUrl = imageUrlFromDom;

  const brand =
    dto.brand && typeof dto.brand === "string" ? dto.brand.trim() : null;
  const cat = deriveCategory(dto.catalogNodeCodes, brand);
  const category_path = cat ? [cat] : null;

  return {
    sku,
    name,
    url,
    currentPrice,
    originalPrice,
    imageUrl,
    brand,
    category_path,
  };
}
