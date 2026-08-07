import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enrichRevelBikes,
  parseRevelProductBodyHtml,
} from "./revelbikes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REVEL_PDP_FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__/revelbikes-pdp.json"), "utf8"),
) as { product: { body_html: string; product_type: string } };

describe("parseRevelProductBodyHtml", () => {
  it("extracts strong+br spec paragraphs as raw_specs keys", () => {
    const { raw_specs } = parseRevelProductBodyHtml(REVEL_PDP_FIXTURE.product.body_html);
    expect(raw_specs).not.toBeNull();
    expect(raw_specs!.DRIVETRAIN).toBe("SRAM Force AXS XPRL");
    expect(raw_specs!.BRAKES).toBe("SRAM Force AXS XPLR");
    expect(raw_specs!.COCKPIT).toBe("Zipp Carbon");
    expect(raw_specs!["SEAT POST"]).toBe("RockShox Reverb AXS 27.2 50mm");
    expect(raw_specs!.Wheels).toBe("Zipp 303s Carbon");
  });

  it("returns description from remaining text after removing spec paragraphs", () => {
    const { description, raw_specs } = parseRevelProductBodyHtml(
      REVEL_PDP_FIXTURE.product.body_html,
    );
    expect(raw_specs).not.toBeNull();
    expect(description).toBeDefined();
    expect(description!.length).toBeGreaterThanOrEqual(50);
    expect(description).toContain("Rover Force Complete");
    expect(description).not.toContain("DRIVETRAIN");
    expect(description).not.toContain("SRAM Force AXS XPRL");
  });

  it("returns null raw_specs for empty html", () => {
    expect(parseRevelProductBodyHtml("").raw_specs).toBeNull();
  });

  it("uses mixed-case keys as-is", () => {
    const html =
      '<p><strong>Seat Post:</strong><br>RockShox 27.2</p>';
    const { raw_specs } = parseRevelProductBodyHtml(html);
    expect(raw_specs).not.toBeNull();
    expect(raw_specs!["Seat Post"]).toBe("RockShox 27.2");
  });
});

describe("enrichRevelBikes", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("maps product.json into EnrichResult with specs and description", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(REVEL_PDP_FIXTURE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await enrichRevelBikes(
      "https://revelbikes.com/products/rover-sram-force-axs",
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://revelbikes.com/products/rover-sram-force-axs.json",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      }),
    );

    expect(result.category_path).toBeNull();
    expect(result.raw_specs).not.toBeNull();
    expect(result.raw_specs!.DRIVETRAIN).toBe("SRAM Force AXS XPRL");
    expect(result.description).toBeDefined();
    expect(result.description!.length).toBeGreaterThanOrEqual(50);
  });

  it("sets category_path from product_type when present", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          product: {
            ...REVEL_PDP_FIXTURE.product,
            product_type: "Complete Bikes",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await enrichRevelBikes("https://revelbikes.com/products/some-handle");
    expect(result.category_path).toEqual(["Complete Bikes"]);
  });

  it("fails soft on non-ok response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );

    const result = await enrichRevelBikes("https://revelbikes.com/products/missing");
    expect(result).toEqual({ category_path: null, raw_specs: null });
  });
});
