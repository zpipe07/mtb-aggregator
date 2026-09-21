import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findVariantsArrayJsonSlice,
  parsePdpVariantsFromHtml,
} from "./jensonusa-pdp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(
  __dirname,
  "__fixtures__",
  "jensonusa-pdp-variants.html",
);

describe("parsePdpVariantsFromHtml", () => {
  it("parses four variants with Color, Size, and is_orderable from fixture", async () => {
    const html = await readFile(FIXTURE, "utf8");
    const rows = parsePdpVariantsFromHtml(html);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      code: "JE002563 CREAM S",
      dimensions: { Color: "Cream", Size: "Small" },
      is_orderable: true,
    });
    expect(rows[1]).toMatchObject({
      code: "JE002563 CREAM M",
      dimensions: { Color: "Cream", Size: "Medium" },
      is_orderable: false,
    });
    expect(rows[2]).toMatchObject({
      code: "JE002563 CREAM L",
      dimensions: { Color: "Cream", Size: "Large" },
      is_orderable: false,
    });
    expect(rows[3]).toEqual({
      code: "JE002563 CREAM XL",
      dimensions: { Color: "Cream", Size: "XLarge" },
      is_orderable: true,
    });
  });

  it("returns [] when variants array is absent", () => {
    expect(parsePdpVariantsFromHtml("<html><body>no model</body></html>")).toEqual(
      [],
    );
  });

  it("drops schemaStockStatus leftovers and keeps real facets (ZAC-281)", () => {
    const html = `
      <script>
      window.serverSideViewModel = {
        "variants": [
          {
            "code": "RS001370 00.4118.421.046",
            "schemaStockStatus": "https://schema.org/InStock",
            "color": { "value": "Black", "sortOrder": 1 },
            "isOrderable": true
          }
        ]
      };
      </script>`;
    const rows = parsePdpVariantsFromHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].dimensions).toEqual({ Color: "Black" });
  });

  it("maps unknown camelCase dimension keys to Title Case labels", () => {
    const html = `
      <script>
      window.serverSideViewModel = {
        "variants": [
          {
            "code": "TEST 1",
            "wheelDiameter": { "value": "29 in", "sortOrder": 1 },
            "isOrderable": true
          }
        ]
      };
      </script>`;
    const rows = parsePdpVariantsFromHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].dimensions).toEqual({ "Wheel Diameter": "29 in" });
    expect(rows[0].is_orderable).toBe(true);
  });

  it("skips variant when no facet dimensions parse (e.g. invalid color only)", () => {
    const html = `
      <script>
      window.serverSideViewModel = {
        "variants": [
          {
            "code": "BAD",
            "color": { "oops": true },
            "isOrderable": true
          },
          {
            "code": "GOOD",
            "color": "Black",
            "isOrderable": false
          }
        ]
      };
      </script>`;
    const rows = parsePdpVariantsFromHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("GOOD");
  });

  it("findVariantsArrayJsonSlice prefers serverSideViewModel-scoped variants", () => {
    const html = `
      <div>noise "variants":[1,2]</div>
      <script>window.serverSideViewModel = { "variants": [{"code":"X","color":"Red","isOrderable":true}] };</script>
    `;
    const slice = findVariantsArrayJsonSlice(html);
    expect(slice).toBeTruthy();
    const parsed = JSON.parse(slice!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].code).toBe("X");
  });
});
