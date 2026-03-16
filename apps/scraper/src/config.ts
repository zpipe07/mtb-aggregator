export const USER_AGENT =
  "MTBDealBot/1.0 (+https://github.com/mtb-aggregator; contact for bot info)";

export const SCRAPE_DELAY_MS = Number(process.env.SCRAPE_DELAY_MS) || 5000;

export const ENRICH_DELAY_MS = Number(process.env.ENRICH_DELAY_MS) || 5000;

/** Limit total products per scrape when set (convenient for testing). 0 = no limit. */
export const SCRAPER_MAX_PRODUCTS = Math.max(
  0,
  Number(process.env.SCRAPER_MAX_PRODUCTS) || 0,
);

export const STORE_SELECTORS: Record<
  string,
  {
    product_card: string;
    product_name: string;
    product_link: string;
    current_price: string;
    original_price?: string;
    image_url?: string;
  }
> = {
  jensonusa: {
    product_card: ".product-tile, .product-item, [data-product-id], article.product",
    product_name: "a.product-name, .product-title, h2 a, h3 a, a[href*='jensonusa.com']",
    product_link: "a[href*='jensonusa.com'][href*='/']",
    current_price: ".price, .product-price, [data-price], .sale-price",
    original_price: ".msrp, .original-price, .compare-at-price",
    image_url: "img.product-image, img[data-product]",
  },
};
