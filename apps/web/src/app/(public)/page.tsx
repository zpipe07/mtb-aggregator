import type { Metadata } from "next";
import { fetchCategoryTreeSafe, fetchDealsSafe } from "@/api";
import { JsonLd } from "@/components/JsonLd";
import { buildItemListJsonLd, buildWebSiteSearchJsonLd } from "@/lib/jsonLd";
import { absoluteUrl } from "@/lib/siteUrl";
import { HomePageContent } from "@/views/HomePageContent";

/** Rebuild markup with a literal `&` in the serialized HTML—React normally writes `&amp;` in attrs, which some affiliate verifiers reject. */
function avantlinkVerificationScriptMarkup(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }

  if (u.hostname !== "classic.avantlink.com") return null;
  if (u.pathname !== "/affiliate_app_confirm.php") return null;
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  const mode = u.searchParams.get("mode");
  const authResponse = u.searchParams.get("authResponse");
  if (mode !== "js" || !authResponse?.match(/^[0-9a-f]+$/i)) return null;

  const src = `${u.protocol}//${u.host}${u.pathname}?mode=js&authResponse=${authResponse}`;
  return `<script type="text/javascript" src="${src}"><\/script>`;
}

/** 4h — must match PUBLIC_ISR_REVALIDATE_SECONDS in @/lib/revalidate (literal required by Next.js). */
export const revalidate = 14400;

const homeDescription =
  "Compare mountain bike deals across top retailers. Find the best prices on bikes, components, gear, and accessories — updated throughout the day.";

export const metadata: Metadata = {
  title: {
    absolute: "The Dropper | Mountain bike deals across top retailers",
  },
  description: homeDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "The Dropper | Mountain bike deals across top retailers",
    description: homeDescription,
    url: absoluteUrl("/"),
  },
  twitter: {
    title: "The Dropper | Mountain bike deals across top retailers",
    description: homeDescription,
  },
};

export default async function Home() {
  const [categoryTree, dealsResponse] = await Promise.all([
    fetchCategoryTreeSafe(),
    fetchDealsSafe({
      sort: "value",
      min_price: 40,
      exclude_category_slug: "accessories",
      limit: 12,
      offset: 0,
    }),
  ]);

  const topDeals = dealsResponse.deals ?? [];
  const totalFeatured = dealsResponse.total_count ?? topDeals.length;

  const avantlinkMarkup = avantlinkVerificationScriptMarkup(
    process.env.NEXT_PUBLIC_AVANTLINK_VERIFY_SCRIPT_SRC ?? "",
  );

  return (
    <>
      {avantlinkMarkup ? (
        <div
          style={{ display: "contents" }}
          dangerouslySetInnerHTML={{ __html: avantlinkMarkup }}
          suppressHydrationWarning
        />
      ) : null}
      <JsonLd data={buildWebSiteSearchJsonLd()} />
      <JsonLd
        data={buildItemListJsonLd({
          name: "Featured mountain bike deals",
          description: homeDescription,
          totalCount: totalFeatured,
          deals: topDeals.map((d) => ({
            id: d.id,
            product_name: d.product_name,
          })),
        })}
      />
      <HomePageContent categoryTree={categoryTree} topDeals={topDeals} />
    </>
  );
}
