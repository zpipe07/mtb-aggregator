import type { Metadata } from "next";
import { fetchCategoryTree, fetchDeals } from "@/api";
import { JsonLd } from "@/components/JsonLd";
import { buildItemListJsonLd, buildWebSiteSearchJsonLd } from "@/lib/jsonLd";
import { absoluteUrl } from "@/lib/siteUrl";
import { HomePageContent } from "@/views/HomePageContent";

export const revalidate = 60;

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
    fetchCategoryTree(),
    fetchDeals({
      sort: "value",
      min_price: 40,
      exclude_category_slug: "accessories",
      limit: 12,
      offset: 0,
    }),
  ]);

  const topDeals = dealsResponse.deals ?? [];
  const totalFeatured = dealsResponse.total_count ?? topDeals.length;

  return (
    <>
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
