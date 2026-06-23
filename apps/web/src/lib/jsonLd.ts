import { absoluteUrl } from "@/lib/siteUrl";

const CTX = "https://schema.org";

/** WebSite + SearchAction for sitelinks search box / discovery. */
export function buildWebSiteSearchJsonLd(): Record<string, unknown> {
  return {
    "@context": CTX,
    "@type": "WebSite",
    name: "The Dropper",
    url: absoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: `${absoluteUrl("/deals")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/** ISO date ~4h ahead for scrape cadence (priceValidUntil hint). */
function priceValidUntilIso(): string {
  const d = new Date();
  d.setHours(d.getHours() + 4);
  return d.toISOString();
}

type ProductLike = {
  id: number;
  product_name: string;
  current_price: number;
  brand?: string;
  image_url?: string;
  store_name: string;
  is_in_stock: boolean;
};

type PriceHistoryLike = {
  lowest_price: number;
  highest_price: number;
  price_dropped?: boolean;
};

/** Product + Offer for a deal detail page (canonical URL is our listing page). */
export function buildProductJsonLd(
  deal: ProductLike,
  priceHistory?: PriceHistoryLike | null,
): Record<string, unknown> {
  const pageUrl = absoluteUrl(`/deals/${deal.id}`);
  const offer: Record<string, unknown> = {
    "@type": "Offer",
    price: deal.current_price,
    priceCurrency: "USD",
    url: pageUrl,
    priceValidUntil: priceValidUntilIso(),
    availability: deal.is_in_stock
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    seller: {
      "@type": "Organization",
      name: deal.store_name,
    },
  };
  if (priceHistory && priceHistory.lowest_price > 0) {
    offer.lowPrice = priceHistory.lowest_price;
    offer.highPrice = priceHistory.highest_price;
  }
  const product: Record<string, unknown> = {
    "@context": CTX,
    "@type": "Product",
    name: deal.product_name,
    offers: offer,
  };
  if (deal.brand) {
    product.brand = { "@type": "Brand", name: deal.brand };
  }
  if (deal.image_url) {
    product.image = deal.image_url;
  }
  return product;
}

type ItemListDeal = {
  id: number;
  product_name: string;
  current_price: number;
  brand?: string;
  image_url?: string;
  store_name: string;
  is_in_stock: boolean;
};

const ITEM_LIST_MAX = 12;

/** ItemList of deal URLs (home and pages without full deal rows). */
export function buildItemListJsonLd(opts: {
  name: string;
  description?: string;
  totalCount: number;
  deals: { id: number; product_name: string }[];
}): Record<string, unknown> {
  const slice = opts.deals.slice(0, ITEM_LIST_MAX);
  return {
    "@context": CTX,
    "@type": "ItemList",
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    numberOfItems: opts.totalCount,
    itemListElement: slice.map((d, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: d.product_name,
      url: absoluteUrl(`/deals/${d.id}`),
    })),
  };
}

/** ItemList with embedded Product entities (category / hub / brand pages). */
export function buildProductItemListJsonLd(opts: {
  name: string;
  description?: string;
  totalCount: number;
  deals: ItemListDeal[];
}): Record<string, unknown> {
  const slice = opts.deals.slice(0, ITEM_LIST_MAX);
  return {
    "@context": CTX,
    "@type": "ItemList",
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    numberOfItems: opts.totalCount,
    itemListElement: slice.map((d, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: buildProductJsonLd(d),
    })),
  };
}

/** AggregateOffer for list pages with a known price range. */
export function buildAggregateOfferJsonLd(opts: {
  name: string;
  pageUrl: string;
  lowPrice: number;
  highPrice: number;
  offerCount: number;
}): Record<string, unknown> {
  return {
    "@context": CTX,
    "@type": "AggregateOffer",
    name: opts.name,
    url: opts.pageUrl,
    priceCurrency: "USD",
    lowPrice: opts.lowPrice,
    highPrice: opts.highPrice,
    offerCount: opts.offerCount,
  };
}

/** Breadcrumb rich results (category + deal detail pages). */
export function buildBreadcrumbJsonLd(
  items: { name: string; path: string }[],
): Record<string, unknown> {
  return {
    "@context": CTX,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export type CollectionPageRootPart = {
  name: string;
  url: string;
  description?: string;
};

/** CollectionPage hub with hasPart for each top-level category (GEO / rich results). */
export function buildCollectionPageJsonLd(opts: {
  name: string;
  description: string;
  pageUrl: string;
  rootCategories: CollectionPageRootPart[];
}): Record<string, unknown> {
  return {
    "@context": CTX,
    "@type": "CollectionPage",
    name: opts.name,
    description: opts.description,
    url: opts.pageUrl,
    hasPart: opts.rootCategories.map((r) => ({
      "@type": "CollectionPage",
      name: r.name,
      url: r.url,
      ...(r.description ? { description: r.description } : {}),
    })),
  };
}
