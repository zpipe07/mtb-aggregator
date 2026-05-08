import type { Metadata } from "next";
import { fetchCategoryTree } from "@/api";
import { JsonLd } from "@/components/JsonLd";
import { buildCollectionPageJsonLd } from "@/lib/jsonLd";
import { getCategorySeo } from "@/lib/categorySeo";
import { buildDealsCategoryPath } from "@/lib/dealsCategoryPath";
import { absoluteUrl } from "@/lib/siteUrl";
import { CategoriesPageContent } from "@/views/CategoriesPageContent";
import { SeoHubLinksGlobal } from "@/components/SeoHubLinks";

export const revalidate = 60;

const pageDescription =
  "See every mountain bike category on The Dropper—bikes, components, gear, and accessories—with live deal counts. Pick a category to browse filtered deals.";

export const metadata: Metadata = {
  title: "Mountain bike categories",
  description: pageDescription,
  alternates: {
    canonical: "/categories",
  },
  openGraph: {
    title: "Mountain bike categories | The Dropper",
    description: pageDescription,
    url: absoluteUrl("/categories"),
  },
  twitter: {
    title: "Mountain bike categories | The Dropper",
    description: pageDescription,
  },
};

export default async function CategoriesPage() {
  const categoryTree = await fetchCategoryTree();

  const collectionJsonLd = buildCollectionPageJsonLd({
    name: "Mountain bike categories — The Dropper",
    description: pageDescription,
    pageUrl: absoluteUrl("/categories"),
    rootCategories: categoryTree.map((root) => {
      const seo = getCategorySeo(root.slug);
      return {
        name: root.name,
        url: absoluteUrl(buildDealsCategoryPath(root.slug, categoryTree)),
        description: seo.intro ?? seo.description,
      };
    }),
  });

  return (
    <>
      <JsonLd data={collectionJsonLd} />
      <CategoriesPageContent categoryTree={categoryTree}>
        <SeoHubLinksGlobal />
      </CategoriesPageContent>
    </>
  );
}
