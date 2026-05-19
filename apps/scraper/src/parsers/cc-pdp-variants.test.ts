import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseHasVariantsFromHtml, debugHasVariantParse } from "./cc-pdp-variants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FIXTURE_HTML = readFileSync(
  join(__dirname, "__fixtures__/cc-hasvariant-pdp.html"),
  "utf8",
);

describe("parseHasVariantsFromHtml", () => {
  it("parses nine hasVariant rows with sku and dimensions", () => {
    const rows = parseHasVariantsFromHtml(FIXTURE_HTML);
    expect(rows).toHaveLength(9);
    const first = rows.find((r) => r.code === "INBE04M-BLA-S380");
    expect(first).toBeDefined();
    expect(first!.dimensions).toEqual({ Size: "38.0", Color: "Black" });
    expect(first!.is_orderable).toBe(true);
  });

  it("reports WAF heuristics on tiny html", () => {
    const d = debugHasVariantParse("<html></html>");
    expect(d.htmlBytes).toBeLessThan(500);
    expect(d.looksLikeWaf).toBe(true);
    expect(d.variants).toHaveLength(0);
  });

  it("marks OutOfStock availability as not orderable", () => {
    const rows = parseHasVariantsFromHtml(FIXTURE_HTML);
    const last = rows.find((r) => r.code === "INBE04M-BLA-S460");
    expect(last?.is_orderable).toBe(false);
  });
});
