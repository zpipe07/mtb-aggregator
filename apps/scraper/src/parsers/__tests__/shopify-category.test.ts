import { describe, expect, it } from "vitest";
import { resolveShopifyCategoryPath } from "../shopify-helpers.js";

const MISLEADING_NAV_HTML = `
<html>
  <body>
    <a href="/collections/electric-bikes/electric">Electric Commuter & Urban Bikes</a>
    <script>productCollections: []</script>
  </body>
</html>
`;

const BREADCRUMB_HTML = `
<html>
  <script type="application/ld+json">
  {"@type":"BreadcrumbList","itemListElement":[{"name":"Home"},{"name":"Components"},{"name":"FU50"}]}
  </script>
</html>
`;

describe("resolveShopifyCategoryPath", () => {
  it("prefers product_type from Shopify JSON over misleading HTML nav breadcrumbs", () => {
    expect(resolveShopifyCategoryPath("Shifters", MISLEADING_NAV_HTML)).toEqual([
      "Shifters",
    ]);
  });

  it("trims whitespace from product_type", () => {
    expect(resolveShopifyCategoryPath("  Shifters  ", MISLEADING_NAV_HTML)).toEqual([
      "Shifters",
    ]);
  });

  it("falls back to HTML breadcrumbs when product_type is empty", () => {
    expect(resolveShopifyCategoryPath("", BREADCRUMB_HTML)).toEqual([
      "Components",
    ]);
  });

  it("falls back to HTML breadcrumbs when product_type is null", () => {
    expect(resolveShopifyCategoryPath(null, BREADCRUMB_HTML)).toEqual([
      "Components",
    ]);
  });

  it("returns null when product_type and html are both missing", () => {
    expect(resolveShopifyCategoryPath(null, null)).toBeNull();
    expect(resolveShopifyCategoryPath(undefined, "")).toBeNull();
  });
});
