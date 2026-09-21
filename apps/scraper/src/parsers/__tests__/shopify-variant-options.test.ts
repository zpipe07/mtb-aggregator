import { describe, expect, it } from "vitest";
import {
  buildVariantOptions,
  type ShopifyProductWithOptions,
  type ShopifyVariantWithOptions,
} from "../shopify-helpers.js";

function product(
  options: ShopifyProductWithOptions["options"],
  variant: Partial<ShopifyVariantWithOptions> = {},
): {
  product: ShopifyProductWithOptions;
  variant: ShopifyVariantWithOptions;
} {
  const v: ShopifyVariantWithOptions = {
    id: 1,
    sku: "EP1213",
    price: "27.90",
    compare_at_price: "42.00",
    available: true,
    ...variant,
  };
  return {
    product: {
      id: 10,
      title: "Bosch COBI.Bike iPhone Case",
      handle: "bosch-cobi-bike-iphone-case",
      vendor: "Bosch",
      product_type: "Accessories",
      variants: [v],
      options,
    },
    variant: v,
  };
}

describe("buildVariantOptions", () => {
  it("omits Shopify Title / Default Title placeholders (ZAC-278)", () => {
    const { product: p, variant } = product(
      [{ name: "Title" }],
      { option1: "Default Title", title: "Default Title" },
    );
    expect(buildVariantOptions(p, variant)).toBeNull();
  });

  it("omits schema.org stock option names (ZAC-281)", () => {
    const { product: p, variant } = product(
      [{ name: "Schema Stock Status" }, { name: "Color" }],
      { option1: "https://schema.org/InStock", option2: "Black" },
    );
    expect(buildVariantOptions(p, variant)).toEqual({ Color: "Black" });
  });

  it("keeps real Size and Color options", () => {
    const { product: p, variant } = product(
      [{ name: "Size" }, { name: "Color" }],
      { option1: "Medium", option2: "Black" },
    );
    expect(buildVariantOptions(p, variant)).toEqual({
      Size: "Medium",
      Color: "Black",
    });
  });
});
