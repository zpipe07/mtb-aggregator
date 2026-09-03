import { fetchDeals } from "@/api";
import { absoluteUrl } from "@/lib/siteUrl";

export const revalidate = 14400;

const MAX_ITEMS = 10_000;
/** Match sitemap paging; `noStore` skips Next.js’s ~2MB fetch cache. */
const PAGE_SIZE = 500;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const items: string[] = [];
  let offset = 0;

  try {
    for (;;) {
      const res = await fetchDeals({
        limit: PAGE_SIZE,
        offset,
        sort: "newest",
        group_variants: true,
        noStore: true,
      });
      const deals = res.deals ?? [];
      if (deals.length === 0) break;

      for (const d of deals) {
        if (items.length >= MAX_ITEMS) break;
        const title = escapeXml(d.product_name);
        const link = escapeXml(absoluteUrl(`/deals/${d.id}`));
        const image = d.image_url ? escapeXml(d.image_url) : "";
        const brand = d.brand ? escapeXml(d.brand) : "";
        const availability = d.is_in_stock ? "in_stock" : "out_of_stock";
        items.push(`    <item>
      <g:id>${d.id}</g:id>
      <g:title>${title}</g:title>
      <g:description>${title} — mountain bike deal on The Dropper</g:description>
      <g:link>${link}</g:link>${image ? `\n      <g:image_link>${image}</g:image_link>` : ""}
      <g:condition>new</g:condition>
      <g:availability>${availability}</g:availability>
      <g:price>${d.current_price.toFixed(2)} USD</g:price>${brand ? `\n      <g:brand>${brand}</g:brand>` : ""}
      <g:google_product_category>Sporting Goods &gt; Outdoor Recreation &gt; Cycling &gt; Bicycles</g:google_product_category>
    </item>`);
      }

      if (items.length >= MAX_ITEMS) break;
      if (deals.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  } catch {
    return new Response("Feed unavailable", { status: 503 });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>The Dropper — MTB Deals</title>
    <link>${escapeXml(absoluteUrl("/"))}</link>
    <description>Mountain bike deals aggregated from top retailers</description>
${items.join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=14400, stale-while-revalidate=3600",
    },
  });
}
