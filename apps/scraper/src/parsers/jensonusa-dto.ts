/**
 * Parses JensonUSA product DTO into normalized fields.
 * Documented structure: { listPrice: { amount }, msrpPrice: { amount } } on selectedVariant or root.
 * Clearance cards also include `variants[]` (one row per variant for grouping and per-variant prices).
 * This module is unit-tested to catch DTO structure changes.
 */

/** Per-variant row from data-product-result-dto (hydrated DTO may add axes like size: { value, sortOrder }). */
export type JensonVariantDto = Record<string, unknown> & {
  code?: string;
  listPrice?: { amount?: number };
  msrpPrice?: { amount?: number };
  imageUrl?: string;
  swatchImageUrl?: string;
  mfgPartNumber?: string;
  gtin?: string;
  savingPercent?: number;
  order?: number;
};

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
  variants?: JensonVariantDto[];
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

export interface ParsedProductWithVariants extends ParsedProduct {
  /** Parent product code from dto.code; API may store as-is (same pattern as Shopify handle). */
  productGroupKey: string | null;
  variantOptions: Record<string, string> | null;
}

const FIXED_VARIANT_FIELDS = new Set([
  "code",
  "listPrice",
  "msrpPrice",
  "imageUrl",
  "swatchImageUrl",
  "mfgPartNumber",
  "gtin",
  "savingPercent",
  "order",
]);

function parsePriceFromText(text: string): number | null {
  const m = (text || "").replace(/,/g, "").match(/\$?([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

/** Turn API-style keys into display labels: color → Color, wheelSize → Wheel Size. */
export function dimensionKeyToLabel(raw: string): string {
  if (!raw) return raw;
  if (raw.includes("_")) {
    return raw
      .split("_")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  const spaced = raw.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function extractDimensionString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "object" && v !== null && "value" in v) {
    return extractDimensionString((v as { value?: unknown }).value);
  }
  return null;
}

/**
 * Any variant field outside the fixed price/image/id set is treated as a facet dimension
 * (e.g. color string, size { value, sortOrder }).
 */
export function extractVariantDimensions(
  variant: Record<string, unknown>,
): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(variant)) {
    if (FIXED_VARIANT_FIELDS.has(k)) continue;
    const s = extractDimensionString(val);
    if (s == null) continue;
    const label = dimensionKeyToLabel(k);
    if (label) out[label] = s;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Extract original_price (MSRP) from DTO. Uses msrpPrice - the actual JensonUSA field.
 * Fallback: parse "MSRP $X" from container text.
 */
function extractOriginalPrice(
  dto: JensonProductDto,
  containerText?: string,
): number | null {
  const sv = dto.selectedVariant;
  if (sv?.msrpPrice?.amount != null) return sv.msrpPrice.amount;
  if (dto.msrpPrice?.amount != null) return dto.msrpPrice.amount;
  if (containerText) {
    const msrpMatch = containerText
      .replace(/\s+/g, " ")
      .match(/MSRP\s*\$?[\d,]+\.?\d*/);
    if (msrpMatch) return parsePriceFromText(msrpMatch[0]);
  }
  return null;
}

/**
 * Extract current_price from DTO. Uses listPrice - the sale/current price.
 */
function extractCurrentPrice(
  dto: JensonProductDto,
  fallbackText?: string,
): number | null {
  const sv = dto.selectedVariant;
  if (sv?.listPrice?.amount != null) return sv.listPrice.amount;
  if (dto.listPrice?.amount != null) return dto.listPrice.amount;
  if (fallbackText) return parsePriceFromText(fallbackText);
  return null;
}

function extractVariantOriginalPrice(
  variant: JensonVariantDto,
  dto: JensonProductDto,
  containerText?: string,
): number | null {
  if (variant.msrpPrice?.amount != null) return variant.msrpPrice.amount;
  return extractOriginalPrice(dto, containerText);
}

function extractVariantCurrentPrice(
  variant: JensonVariantDto,
  dto: JensonProductDto,
  containerText?: string,
): number | null {
  if (variant.listPrice?.amount != null) return variant.listPrice.amount;
  return extractCurrentPrice(dto, containerText);
}

function buildParsedBase(
  dto: JensonProductDto,
  sku: string,
  currentPrice: number | null,
  originalPrice: number | null,
  imageUrlOverride: string | null | undefined,
  imageUrlFromDom?: string | null,
): Omit<ParsedProduct, "sku" | "currentPrice" | "originalPrice" | "imageUrl"> & {
  sku: string;
  currentPrice: number | null;
  originalPrice: number | null;
  imageUrl: string | null;
} {
  const name = dto.name;
  const urlPath = (dto.url || "").replace(/^\//, "");
  const baseUrl = "https://www.jensonusa.com";
  const url = urlPath.startsWith("http") ? urlPath : `${baseUrl}/${urlPath}`;

  let imageUrl: string | null =
    (typeof imageUrlOverride === "string" ? imageUrlOverride : null) ||
    (dto.imageUrl as string) ||
    null;
  if (imageUrl?.startsWith("data:")) imageUrl = null;
  if (!imageUrl && imageUrlFromDom && !imageUrlFromDom.startsWith("data:"))
    imageUrl = imageUrlFromDom;

  const brand =
    dto.brand && typeof dto.brand === "string" ? dto.brand.trim() : null;

  return {
    sku,
    name: name!,
    url,
    currentPrice,
    originalPrice,
    imageUrl,
    brand,
    category_path: null,
  };
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
  imageUrlFromDom?: string | null,
): ParsedProduct | null {
  const name = dto.name;
  const urlPath = (dto.url || "").replace(/^\//, "");
  if (!name || !urlPath) return null;

  const sku = (dto.code || urlPath).trim();
  if (!sku) return null;

  const currentPrice = extractCurrentPrice(dto, containerText);
  if (!currentPrice || currentPrice <= 0 || currentPrice >= 100000) return null;

  const originalPrice = extractOriginalPrice(dto, containerText);

  const sv = dto.selectedVariant;
  const imgFromVariant =
    typeof sv?.imageUrl === "string" ? sv.imageUrl : undefined;

  const base = buildParsedBase(
    dto,
    sku,
    currentPrice,
    originalPrice,
    imgFromVariant,
    imageUrlFromDom,
  );

  return {
    sku: base.sku,
    name: base.name,
    url: base.url,
    currentPrice: base.currentPrice,
    originalPrice: base.originalPrice,
    imageUrl: base.imageUrl,
    brand: base.brand,
    category_path: base.category_path,
  };
}

/**
 * Parse clearance DTO into one row per variant when `variants[]` is present and non-empty.
 * Otherwise falls back to {@link parseProductDto} (single row, no grouping key).
 */
export function parseProductDtoVariants(
  dto: JensonProductDto,
  containerText?: string,
  imageUrlFromDom?: string | null,
): ParsedProductWithVariants[] {
  const name = dto.name;
  const urlPath = (dto.url || "").replace(/^\//, "");
  if (!name || !urlPath) return [];

  const variants = dto.variants;
  if (!variants || variants.length === 0) {
    const one = parseProductDto(dto, containerText, imageUrlFromDom);
    if (!one) return [];
    return [
      {
        ...one,
        productGroupKey: null,
        variantOptions: null,
      },
    ];
  }

  const productGroupKey = dto.code?.trim() || null;
  const out: ParsedProductWithVariants[] = [];

  for (const v of variants) {
    if (!v || typeof v !== "object") continue;
    const variant = v as JensonVariantDto;
    const skuRaw = variant.code;
    const sku =
      typeof skuRaw === "string" ? skuRaw.trim() : String(skuRaw ?? "").trim();
    if (!sku) continue;

    const currentPrice = extractVariantCurrentPrice(
      variant,
      dto,
      containerText,
    );
    if (!currentPrice || currentPrice <= 0 || currentPrice >= 100000) continue;

    const originalPrice = extractVariantOriginalPrice(
      variant,
      dto,
      containerText,
    );

    const img =
      typeof variant.imageUrl === "string" ? variant.imageUrl : undefined;
    const base = buildParsedBase(
      dto,
      sku,
      currentPrice,
      originalPrice,
      img,
      imageUrlFromDom,
    );

    const variantOptions = extractVariantDimensions(
      variant as Record<string, unknown>,
    );

    out.push({
      ...base,
      productGroupKey,
      variantOptions,
    });
  }

  return out;
}
