import { fetchCategoryTree, fetchDeals } from "@/api";
import { HomePageContent } from "@/views/HomePageContent";

export const revalidate = 60;

export default async function Home() {
  const [categoryTree, dealsResponse] = await Promise.all([
    fetchCategoryTree(),
    fetchDeals({ sort: "discount", limit: 8, offset: 0 }),
  ]);

  const topDeals = dealsResponse.deals ?? [];

  return <HomePageContent categoryTree={categoryTree} topDeals={topDeals} />;
}
