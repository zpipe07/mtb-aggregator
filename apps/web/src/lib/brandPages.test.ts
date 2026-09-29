import { describe, expect, it } from "vitest";
import { uniqueBrandSitemapCandidates } from "./brandPages";

describe("uniqueBrandSitemapCandidates", () => {
  it("drops thin brands and duplicate slugs", () => {
    expect(
      uniqueBrandSitemapCandidates([
        { value: "SRAM", count: 20 },
        { value: "Sram", count: 4 },
        { value: "Tiny", count: 2 },
      ]),
    ).toEqual([{ value: "SRAM", slug: "sram", count: 20 }]);
  });
});
