import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/siteUrl";

const FALLBACK_OG_IMAGE = "/the-dropper-logo-horizontal.png";

/** `/deals/{numeric id}` only — not price-history or category paths. */
export const DEAL_DETAIL_PATH = /^\/deals\/(\d+)$/;

/**
 * If this is a deal detail URL with a tracking `from` query, return the same
 * URL with `from` stripped. Other query params are preserved. Returns null
 * when no redirect is needed.
 */
export function stripDealDetailFromQuery(url: URL): URL | null {
  if (!DEAL_DETAIL_PATH.test(url.pathname) || !url.searchParams.has("from")) {
    return null;
  }
  const next = new URL(url.href);
  next.searchParams.delete("from");
  return next;
}

export type DealMetadataInput = {
  id: number;
  product_name: string;
  brand?: string;
  current_price: number;
  original_price?: number | null;
  discount_pct?: number | null;
  store_name: string;
  image_url?: string;
};

/** Clean deal URL with no query string — the only indexable document for a listing. */
export function dealDetailPath(dealId: number): string {
  return `/deals/${dealId}`;
}

export function dealPriceHistoryPath(dealId: number): string {
  return `/deals/${dealId}/price-history`;
}

function dealTitleSegment(deal: DealMetadataInput): string {
  return `${deal.product_name}${deal.brand ? ` | ${deal.brand}` : ""}`;
}

function dealDescription(deal: DealMetadataInput): string {
  const priceStr = `$${deal.current_price.toFixed(2)}`;
  const orig =
    deal.original_price != null && deal.original_price > deal.current_price
      ? ` (was $${deal.original_price.toFixed(2)})`
      : "";
  const discount =
    deal.discount_pct != null && deal.discount_pct > 0
      ? ` — ${Math.round(deal.discount_pct)}% off`
      : "";
  return `${priceStr} at ${deal.store_name}${orig}${discount}. Compare MTB deals on The Dropper.`;
}

function dealImages(deal: DealMetadataInput): {
  og: { url: string; alt: string }[];
  twitter: string[];
} {
  if (deal.image_url) {
    return {
      og: [{ url: deal.image_url, alt: deal.product_name }],
      twitter: [deal.image_url],
    };
  }
  return {
    og: [{ url: FALLBACK_OG_IMAGE, alt: deal.product_name }],
    twitter: [FALLBACK_OG_IMAGE],
  };
}

/**
 * Indexable deal detail metadata. Canonical is always the apex `/deals/{id}`
 * path (no `?from=` or other query string), regardless of the request URL.
 */
export function buildDealDetailMetadata(deal: DealMetadataInput): Metadata {
  const path = dealDetailPath(deal.id);
  const titleSegment = dealTitleSegment(deal);
  const description = dealDescription(deal);
  const canonical = absoluteUrl(path);
  const images = dealImages(deal);

  return {
    title: titleSegment,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: path },
    openGraph: {
      title: `${titleSegment} | The Dropper`,
      description,
      url: canonical,
      siteName: "The Dropper",
      type: "article",
      images: images.og,
    },
    twitter: {
      card: "summary_large_image",
      title: `${titleSegment} | The Dropper`,
      description,
      images: images.twitter,
    },
  };
}

/** Hidden / missing listings: do not index the empty “deal not found” document. */
export const missingDealMetadata: Metadata = {
  title: "Deal not found",
  robots: { index: false, follow: true },
};

/**
 * Price-history pages stay noindex. Canonical still points at this URL so
 * query-string variants do not become a second document; ranking belongs on
 * the parent deal page.
 */
export function buildDealPriceHistoryMetadata(
  deal: DealMetadataInput,
  extras?: { descriptionSuffix?: string },
): Metadata {
  const title = `${deal.product_name} price tracker`;
  const description = `${deal.product_name} price history and deal tracker. Current price $${deal.current_price.toFixed(2)}${extras?.descriptionSuffix ?? ""}. Track MTB deals on The Dropper.`;
  const path = dealPriceHistoryPath(deal.id);
  return {
    title,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | The Dropper`,
      description,
      url: absoluteUrl(path),
      siteName: "The Dropper",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | The Dropper`,
      description,
    },
  };
}
