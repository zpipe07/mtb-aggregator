import { describe, it, expect } from "vitest";
import { buildDealsBrowseHref } from "./dealsBrowseHref";

describe("buildDealsBrowseHref", () => {
  it("drops offset when navigating to a category", () => {
    const params = new URLSearchParams("offset=48&brand=SRAM");
    expect(buildDealsBrowseHref("components-brakes", params)).toBe(
      "/deals/c/components/brakes?brand=SRAM",
    );
  });

  it("drops offset when navigating to a parent category", () => {
    const params = new URLSearchParams("offset=24&sort=value");
    expect(buildDealsBrowseHref("components", params)).toBe(
      "/deals/c/components?sort=value",
    );
  });

  it("drops offset when clearing category to all deals", () => {
    const params = new URLSearchParams("offset=48");
    expect(buildDealsBrowseHref("", params)).toBe("/deals");
  });

  it("does not emit offset=0 when already on page 1", () => {
    const params = new URLSearchParams("offset=0&brand=SRAM");
    expect(buildDealsBrowseHref("components-brakes", params)).toBe(
      "/deals/c/components/brakes?brand=SRAM",
    );
  });

  it("omits category query param (path carries category)", () => {
    const params = new URLSearchParams("category=legacy&offset=48");
    expect(buildDealsBrowseHref("components", params)).toBe("/deals/c/components");
  });
});
