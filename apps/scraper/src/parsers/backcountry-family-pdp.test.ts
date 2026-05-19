import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  extractBackcountryFamilyBreadcrumbs,
  extractBackcountryFamilyDescription,
  extractBackcountryFamilySpecs,
} from "./backcountry-family-pdp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FIXTURE_HTML = readFileSync(
  join(__dirname, "__fixtures__/backcountry-family-pdp.html"),
  "utf8",
);

describe("backcountry-family-pdp helpers", () => {
  it("extracts breadcrumbs from JSON-LD, excluding current product crumb", () => {
    expect(extractBackcountryFamilyBreadcrumbs(FIXTURE_HTML)).toEqual(["Bikes"]);
  });

  it("extracts specs from table under Specs heading", () => {
    const specs = extractBackcountryFamilySpecs(FIXTURE_HTML);
    expect(specs).not.toBeNull();
    expect(specs!["Frame Material"]).toBe("Carbon");
    expect(specs!.Wheels).toBe("29 in");
  });

  it("extracts description from product-description section", () => {
    const desc = extractBackcountryFamilyDescription(FIXTURE_HTML);
    expect(desc).not.toBeNull();
    expect(desc!.length).toBeGreaterThanOrEqual(50);
    expect(desc).toContain("trail chassis");
  });
});
