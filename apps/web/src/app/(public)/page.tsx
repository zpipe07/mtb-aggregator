import type { Metadata } from "next";
import { fetchCategoryTree, fetchDeals } from "@/api";
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
    fetchDeals({ sort: "discount", limit: 8, offset: 0 }),
  ]);

  const topDeals = dealsResponse.deals ?? [];

  return <HomePageContent categoryTree={categoryTree} topDeals={topDeals} />;
}
