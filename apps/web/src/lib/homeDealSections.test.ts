import { describe, expect, it } from "vitest";
import {
  HOME_DEAL_SECTIONS,
  HOME_PRICE_DROPS_VIEW_ALL_HREF,
  HOME_PRICE_DROPS_VIEW_ALL_LABEL,
} from "./homeDealSections";

describe("home deal section view-all copy", () => {
  it("gives every category rail a View all label", () => {
    expect(
      HOME_DEAL_SECTIONS.map((section) => [section.id, section.viewAllLabel]),
    ).toEqual([
      ["mtb", "View all mountain bikes"],
      ["emtb", "View all eMTBs"],
      ["components", "View all components"],
      ["gear", "View all gear"],
    ]);
  });

  it("sends price drops to the price-drop sort on /deals", () => {
    expect(HOME_PRICE_DROPS_VIEW_ALL_LABEL).toBe("View all price drops");
    expect(HOME_PRICE_DROPS_VIEW_ALL_HREF).toBe("/deals?sort=price_drop");
  });
});
