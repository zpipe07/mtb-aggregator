/**
 * Shared Shopify collection JSON shapes for variant options (products.json).
 */

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

/**
 * Map Shopify option1/2/3 to option names from product.options.
 * Falls back to generic "Option 1"… when `product.options` is missing but values exist,
 * then to `variant.title` (e.g. "Small / Black") when options are still empty — some
 * stores/API responses omit option names on the product but still send variant fields.
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
      out[names[i]] = String(v).trim();
    }
  }
  if (Object.keys(out).length === 0) {
    const fallbackNames = ["Option 1", "Option 2", "Option 3"];
    for (let i = 0; i < 3; i++) {
      const v = vals[i];
      if (v != null && String(v).trim() !== "") {
        out[fallbackNames[i]] = String(v).trim();
      }
    }
  }
  if (Object.keys(out).length === 0 && variant.title != null) {
    const t = String(variant.title).trim();
    if (t !== "" && t.toLowerCase() !== "default title") {
      out.Variant = t;
    }
  }
  return Object.keys(out).length ? out : null;
}
