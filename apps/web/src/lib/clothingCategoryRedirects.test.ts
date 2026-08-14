import { describe, it, expect } from "vitest";
import {
  redirectClothingCategorySlug,
  redirectClothingDealsPath,
} from "./clothingCategoryRedirects";

describe("redirectClothingCategorySlug", () => {
  it("redirects old Tops/Bottoms slugs to Clothing parent", () => {
    expect(redirectClothingCategorySlug("gear-clothing-tops")).toBe("gear-clothing");
    expect(redirectClothingCategorySlug("gear-clothing-bottoms")).toBe("gear-clothing");
  });

  it("redirects old leaf slugs to flattened slugs", () => {
    expect(redirectClothingCategorySlug("gear-clothing-tops-jerseys")).toBe(
      "gear-clothing-jerseys",
    );
    expect(redirectClothingCategorySlug("gear-clothing-bottoms-shorts")).toBe(
      "gear-clothing-shorts",
    );
  });

  it("returns null for current slugs", () => {
    expect(redirectClothingCategorySlug("gear-clothing-jerseys")).toBeNull();
    expect(redirectClothingCategorySlug("gear-clothing")).toBeNull();
  });
});

describe("redirectClothingDealsPath", () => {
  it("redirects old category URL paths", () => {
    expect(redirectClothingDealsPath("/deals/c/gear/clothing/tops/jerseys")).toBe(
      "/deals/c/gear/clothing/jerseys",
    );
    expect(redirectClothingDealsPath("/deals/c/gear/clothing/bottoms/shorts")).toBe(
      "/deals/c/gear/clothing/shorts",
    );
    expect(redirectClothingDealsPath("/deals/c/gear/clothing/tops")).toBe(
      "/deals/c/gear/clothing",
    );
  });

  it("returns null for current paths", () => {
    expect(redirectClothingDealsPath("/deals/c/gear/clothing/jerseys")).toBeNull();
    expect(redirectClothingDealsPath("/deals/c/bikes/mountain")).toBeNull();
  });
});
