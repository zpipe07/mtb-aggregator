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

type ProductLike = {
  id: number;
  product_name: string;
  current_price: number;
  brand?: string;
  image_url?: string;
  store_name: string;
  is_in_stock: boolean;
};

/** Product + Offer for a deal detail page (canonical URL is our listing page). */
export function buildProductJsonLd(deal: ProductLike): Record<string, unknown> {
  const pageUrl = absoluteUrl(`/deals/${deal.id}`);
  const offer: Record<string, unknown> = {
    "@type": "Offer",
    price: deal.current_price,
    priceCurrency: "USD",
    url: pageUrl,
    availability: deal.is_in_stock
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    seller: {
      "@type": "Organization",
      name: deal.store_name,
    },
  };
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

type ItemListDeal = { id: number; product_name: string };

const ITEM_LIST_MAX = 12;

/** ItemList of deal URLs (category / curated lists). */
export function buildItemListJsonLd(opts: {
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
      name: d.product_name,
      url: absoluteUrl(`/deals/${d.id}`),
    })),
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
