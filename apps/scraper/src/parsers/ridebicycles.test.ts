import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isScrapeTruncated } from "./jensonusa-pagination.js";
import {
  enrichRideBicycles,
  parseRideBicyclesListingHtml,
  parseRideBicyclesPdp,
  resolveRideBicyclesDeal,
  rideBicyclesNextPageUrl,
  rideBicyclesSaleListUrls,
  scrapeRideBicycles,
} from "./ridebicycles.js";

const PAGE = "https://www.ridebicycles.com/product-list/in-stock-bikes-wg139/?rb_onSale=1";

function card(opts: {
  href: string;
  title: string;
  brand: string;
  item: string;
  special: string;
  original: string;
  saving: string;
  image?: string;
}): string {
  return `<div class="col-xs-6 col-sm-4 seProduct">
    <a class="seProductAnchor" href="${opts.href}" title="${opts.title}">
      <img class="seResultImage" alt="${opts.title}" src="${opts.image ?? "https://www.sefiles.net/images/library/small/example.png"}">
    </a>
    <div class="seProductTitle">
      <span class="seBrandName">${opts.brand}</span>
      <span class="seItemName">${opts.item}</span>
    </div>
    <div class="seProductPrice">
      <span class="seSpecialPrice">${opts.special}</span>
      <span class="seOriginalPrice">${opts.original}</span>
      <span class="seSavingPercent">${opts.saving}</span>
    </div>
  </div>`;
}

function catalog(cards: string[], nextHref?: string): string {
  return `<html><head><title>In Stock Bikes</title></head><body>
    <div class="seProductListContainer"><div id="SearchProducts" class="seSearchProductsContainer">
      ${cards.join("")}
    </div>
    ${
      nextHref
        ? `<a href="${nextHref}" class="sePaginationLink" title="Next page"><span class="sr-only">Next page</span></a>`
        : ""
    }
    </div></body></html>`;
}

describe("resolveRideBicyclesDeal", () => {
  it("keeps a single-price 15–75% deal", () => {
    expect(
      resolveRideBicyclesDeal({
        specialText: "$4,998.97",
        originalText: "$6,999.00",
        savingText: "29% Off",
      }),
    ).toEqual({ current: 4998.97, original: 6999 });
  });

  it("uses the low sale price against a single MSRP when the badge says up to", () => {
    expect(
      resolveRideBicyclesDeal({
        specialText: "$110.00 - $154.00",
        originalText: "$219.99",
        savingText: "Up to 50% Off",
      }),
    ).toEqual({ current: 110, original: 219.99 });
  });

  it("pairs range endpoints that match the badge", () => {
    expect(
      resolveRideBicyclesDeal({
        specialText: "$8.99 - $16.99",
        originalText: "$13.00 - $16.99",
        savingText: "Up to 31% Off",
      }),
    ).toEqual({ current: 8.99, original: 13 });
    expect(
      resolveRideBicyclesDeal({
        specialText: "$259.95 - $269.95",
        originalText: "$259.95 - $369.95",
        savingText: "Up to 27% Off",
      }),
    ).toEqual({ current: 269.95, original: 369.95 });
  });

  it("drops tiny discounts, identical ranges, and extreme compare-at artifacts", () => {
    expect(
      resolveRideBicyclesDeal({
        specialText: "$27.99 - $34.00",
        originalText: "$27.99 - $34.00",
        savingText: "Up to 6% Off",
      }),
    ).toBeNull();
    expect(
      resolveRideBicyclesDeal({
        specialText: "$131.00 - $141.00",
        originalText: "$141.00",
        savingText: "Up to 7% Off",
      }),
    ).toBeNull();
    expect(
      resolveRideBicyclesDeal({
        specialText: "$1.49",
        originalText: "$88.79",
        savingText: "98% Off",
      }),
    ).toBeNull();
  });
});

describe("parseRideBicyclesListingHtml", () => {
  it("emits one SmartEtailing row per discounted card", () => {
    const html = catalog([
      card({
        href: "/product/transition-patrol-carbon-gx-axs-834894-1.htm",
        title: "Transition Patrol Carbon GX AXS",
        brand: "Transition",
        item: "Patrol Carbon GX AXS",
        special: "$4,998.97",
        original: "$6,999.00",
        saving: "29% Off",
      }),
      card({
        href: "/product/shop-gift-card-999-1.htm",
        title: "Shop Gift Card",
        brand: "Ride",
        item: "Gift Card",
        special: "$50.00",
        original: "$100.00",
        saving: "50% Off",
      }),
      card({
        href: "/product/unior-crank-cap-tool-1240926-1.htm",
        title: "Unior Crank Cap Tool",
        brand: "Unior",
        item: "Crank Cap Tool",
        special: "$9.50",
        original: "$9.99",
        saving: "5% Off",
      }),
    ]);

    const rows = parseRideBicyclesListingHtml(html, PAGE);
    expect(rows).toEqual([
      {
        store_sku: "se834894",
        product_name: "Transition Patrol Carbon GX AXS",
        current_price: 4998.97,
        original_price: 6999,
        product_url:
          "https://www.ridebicycles.com/product/transition-patrol-carbon-gx-axs-834894-1.htm",
        image_url: "https://www.sefiles.net/images/library/small/example.png",
        brand: "Transition",
        category_path: null,
        is_in_stock: true,
        product_group_key: "834894",
      },
    ]);
  });

  it("accepts PDP paths that omit the default -1 page suffix", () => {
    const html = catalog([
      card({
        href: "/product/transition-regulator-cx-eagle-70-6993.htm",
        title: "Transition Regulator CX Eagle 70",
        brand: "Transition",
        item: "Regulator CX Eagle 70",
        special: "$6,798.99",
        original: "$7,999.00",
        saving: "15% Off",
        image: "https://www.sefiles.net/images/library/_common/No-Image-Available.png",
      }),
    ]);
    const rows = parseRideBicyclesListingHtml(html, PAGE);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      store_sku: "se6993",
      product_group_key: "6993",
      current_price: 6798.99,
      original_price: 7999,
      image_url: null,
      product_url:
        "https://www.ridebicycles.com/product/transition-regulator-cx-eagle-70-6993.htm",
    });
  });

  it("reads the next-page link", () => {
    const html = catalog(
      [
        card({
          href: "/product/example-1-1.htm",
          title: "Example",
          brand: "Brand",
          item: "Example",
          special: "$50.00",
          original: "$100.00",
          saving: "50% Off",
        }),
      ],
      "/product-list/in-stock-bikes-wg139/?rb_onSale=1&startrow=60",
    );
    expect(rideBicyclesNextPageUrl(html, PAGE)).toBe(
      "https://www.ridebicycles.com/product-list/in-stock-bikes-wg139/?rb_onSale=1&startrow=60",
    );
  });
});

describe("rideBicyclesSaleListUrls", () => {
  it("maps the legacy Shopify collection URL onto both in-stock sale lists", () => {
    expect(
      rideBicyclesSaleListUrls(
        "https://ridebicycles.com/collections/all-products?page=1&rb_stock_status=In%20Stock",
      ),
    ).toEqual([
      "https://www.ridebicycles.com/product-list/in-stock-bikes-wg139/?rb_onSale=1&maxItems=60",
      "https://www.ridebicycles.com/product-list/in-stock-cycling-equipment-wg141/?rb_onSale=1&maxItems=60",
    ]);
  });

  it("adds an extra product-list path without dropping the default sale lists", () => {
    const urls = rideBicyclesSaleListUrls(
      "https://www.ridebicycles.com/product-list/parts-1051/forks-1066/",
    );
    expect(urls).toContain(
      "https://www.ridebicycles.com/product-list/in-stock-bikes-wg139/?rb_onSale=1&maxItems=60",
    );
    expect(urls).toContain(
      "https://www.ridebicycles.com/product-list/parts-1051/forks-1066/?rb_onSale=1&maxItems=60",
    );
  });
});

describe("parseRideBicyclesPdp", () => {
  const html = `<html><head><title>Transition Patrol</title></head><body>
    <ol class="breadcrumb seProductBreadcrumb">
      <li><a href="/" data-value="Home"><span>Home</span></a></li>
      <li><a href="/catalog/bicycling-catalog-39/" data-value="Bicycling Catalog"><span>Bicycling Catalog</span></a></li>
      <li><a href="/product-list/bikes-1000/" data-value="Bikes"><span>Bikes</span></a></li>
      <li><a href="/product-list/bikes-1000/mountain-1006/" data-value="Mountain"><span>Mountain</span></a></li>
      <li><a href="/product-list/bikes-1000/mountain-1006/full-suspension-1008/" data-value="Full-Suspension"><span>Full-Suspension</span></a></li>
      <li><a href="/product-list/bikes-1000/mountain-1006/full-suspension-1008/?rb_br=992" data-value="Transition"><span>Transition</span></a></li>
      <li class="active"><span>Patrol Carbon GX AXS</span></li>
    </ol>
    <p class="seProductPrimaryDescription">The Pure Bred Party Animal<br><br>The mixed wheel Patrol has a new haircut but is still down for anything and truly unapologetic when it comes to shredding trail.</p>
    <table class="seProductSpecTable">
      <tr><th>Frame</th><td>Patrol Carbon 160mm</td></tr>
      <tr><th>Tires</th><td>Front: Schwalbe Magic Mary<br>Rear: Schwalbe Big Betty</td></tr>
    </table>
  </body></html>`;

  it("keeps shoppable breadcrumbs and spec rows", () => {
    expect(parseRideBicyclesPdp(html)).toEqual({
      category_path: ["Bikes", "Mountain", "Full-Suspension"],
      raw_specs: {
        Frame: "Patrol Carbon 160mm",
        Tires: "Front: Schwalbe Magic Mary Rear: Schwalbe Big Betty",
      },
      description:
        "The Pure Bred Party Animal\n\nThe mixed wheel Patrol has a new haircut but is still down for anything and truly unapologetic when it comes to shredding trail.",
    });
  });
});

describe("scrapeRideBicycles", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("walks both sale lists and dedupes SKUs", async () => {
    const bike = catalog([
      card({
        href: "/product/transition-patrol-carbon-gx-axs-834894-1.htm",
        title: "Transition Patrol Carbon GX AXS",
        brand: "Transition",
        item: "Patrol Carbon GX AXS",
        special: "$4,998.97",
        original: "$6,999.00",
        saving: "29% Off",
      }),
    ]);
    const gear = catalog([
      card({
        href: "/product/unior-crank-cap-tool-1240926-1.htm",
        title: "Unior Crank Cap Tool",
        brand: "Unior",
        item: "Crank Cap Tool",
        special: "$3.99",
        original: "$9.99",
        saving: "60% Off",
      }),
      card({
        href: "/product/transition-patrol-carbon-gx-axs-834894-1.htm",
        title: "Transition Patrol Carbon GX AXS",
        brand: "Transition",
        item: "Patrol Carbon GX AXS",
        special: "$4,998.97",
        original: "$6,999.00",
        saving: "29% Off",
      }),
    ]);
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("cycling-equipment") ? gear : bike;
      return new Response(body, { status: 200 });
    });

    const rows = await scrapeRideBicycles(
      "https://ridebicycles.com/collections/all-products",
    );
    expect(rows.map((row) => row.store_sku)).toEqual(["se834894", "se1240926"]);
    expect(isScrapeTruncated(rows)).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("throws a platform-change error when the catalog URL 404s", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("missing", { status: 404, statusText: "Not Found" }),
    );
    await expect(
      scrapeRideBicycles("https://www.ridebicycles.com/product-list/in-stock-bikes-wg139/"),
    ).rejects.toThrow(/store platform may have changed/);
  });

  it("throws when a 200 page is not a SmartEtailing catalog", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("<html><title>Something else</title><body>hi</body></html>", {
        status: 200,
      }),
    );
    await expect(
      scrapeRideBicycles("https://www.ridebicycles.com/"),
    ).rejects.toThrow(/store platform may have changed/);
  });
});

describe("enrichRideBicycles", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("marks a missing PDP unavailable", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("nope", { status: 404, statusText: "Not Found" }),
    );
    await expect(
      enrichRideBicycles(
        "https://ridebicycles.com/products/norco-fluid-fs-c2-29-2024",
      ),
    ).resolves.toEqual({
      category_path: null,
      raw_specs: null,
      unavailable: true,
    });
  });
});
