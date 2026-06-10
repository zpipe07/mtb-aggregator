/**
 * Fast static checks for JSON-LD builders (runs in CI without a running server).
 */
import assert from "node:assert/strict";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
  buildProductJsonLd,
} from "../src/lib/jsonLd";

const crumb = buildBreadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Deals", path: "/deals" },
]);
assert.equal(crumb["@type"], "BreadcrumbList");
assert.ok(Array.isArray(crumb.itemListElement));
assert.equal((crumb.itemListElement as unknown[]).length, 2);

const list = buildItemListJsonLd({
  name: "Test",
  description: "d",
  totalCount: 100,
  deals: [{ id: 1, product_name: "X" }],
});
assert.equal(list["@type"], "ItemList");
assert.equal(list.numberOfItems, 100);

const product = buildProductJsonLd({
  id: 42,
  product_name: "Test Product",
  current_price: 99.99,
  original_price: 129.99,
  discount_pct: 23,
  brand: "Brand",
  store_name: "Store",
  store_sku: "SKU-42",
  is_in_stock: true,
});
assert.equal(product["@type"], "Product");
assert.equal(product.sku, "SKU-42");
assert.ok(typeof product.description === "string");
const offer = product.offers as Record<string, unknown>;
assert.equal(offer.itemCondition, "https://schema.org/NewCondition");

console.log("seo-smoke: ok");
