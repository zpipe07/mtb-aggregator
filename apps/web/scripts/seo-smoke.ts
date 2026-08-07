/**
 * Fast static checks for JSON-LD builders (runs in CI without a running server).
 */
import assert from "node:assert/strict";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
  buildProductJsonLd,
  buildProductItemListJsonLd,
  buildAggregateOfferJsonLd,
  buildFaqPageJsonLd,
} from "../src/lib/jsonLd";
import { computeDealScore } from "../src/lib/dealScore";
import { brandToSlug, resolveBrandFromSlug } from "../src/lib/brandPages";

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
  brand: "Brand",
  store_name: "Store",
  is_in_stock: true,
});
assert.equal(product["@type"], "Product");

const productList = buildProductItemListJsonLd({
  name: "Fox deals",
  totalCount: 10,
  deals: [
    {
      id: 1,
      product_name: "Fox 36",
      current_price: 599,
      store_name: "Shop",
      is_in_stock: true,
      brand: "Fox",
    },
  ],
});
assert.equal(productList["@type"], "ItemList");

const aggregate = buildAggregateOfferJsonLd({
  name: "Fox deals",
  pageUrl: "https://example.com/deals/brand/fox",
  lowPrice: 100,
  highPrice: 900,
  offerCount: 10,
});
assert.equal(aggregate["@type"], "AggregateOffer");

const faq = buildFaqPageJsonLd([
  { question: "Q?", answer: "A." },
]);
assert.ok(faq);
assert.equal(faq!["@type"], "FAQPage");
assert.equal((faq!.mainEntity as unknown[]).length, 1);
assert.equal(buildFaqPageJsonLd([]), null);

assert.equal(brandToSlug("RockShox"), "rockshox");
assert.equal(resolveBrandFromSlug("fox", ["Fox", "SRAM"]), "Fox");

const score = computeDealScore({
  id: 1,
  store_id: 1,
  store_name: "Shop",
  store_sku: "x",
  product_name: "Test",
  current_price: 50,
  original_price: 100,
  product_url: "https://example.com",
  is_in_stock: true,
  discount_pct: 50,
  last_scraped: "",
});
assert.ok(score.score >= 40);

const summaryScore = computeDealScore({
  id: 2,
  store_id: 1,
  store_name: "Shop",
  store_sku: "y",
  product_name: "Test",
  current_price: 50,
  original_price: 100,
  product_url: "https://example.com",
  is_in_stock: true,
  discount_pct: 50,
  last_scraped: "",
  price_history_summary: {
    lowest_price: 50,
    highest_price: 120,
    price_dropped: true,
    point_count: 5,
  },
});
assert.equal(summaryScore.label, "steal");

console.log("seo-smoke: ok");
