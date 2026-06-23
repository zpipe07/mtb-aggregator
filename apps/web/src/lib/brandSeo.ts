import type { Metadata } from "next";
import { brandToSlug } from "@/lib/brandPages";

export type BrandSeoMeta = {
  title: string;
  description: string;
  intro?: string;
};

export function getBrandSeo(brand: string): BrandSeoMeta {
  const name = brand.trim();
  return {
    title: `${name} MTB deals`,
    description: `Compare ${name} mountain bike deals across top retailers. Find sale prices on bikes, components, and gear on The Dropper.`,
    intro: `Browse current ${name} markdowns from shops we track—compare prices before you buy.`,
  };
}

export function getBrandCategorySeo(
  brand: string,
  categoryName: string,
): BrandSeoMeta {
  const b = brand.trim();
  const c = categoryName.trim();
  const lower = c.toLowerCase();
  return {
    title: `${b} ${lower} deals`,
    description: `Find ${b} ${lower} on sale. Compare prices across MTB retailers on The Dropper.`,
    intro: `Shop ${b} ${lower} deals in one feed—filtered to in-stock listings we track.`,
  };
}

export function brandMetadataForName(brand: string): Pick<Metadata, "title" | "description"> {
  const seo = getBrandSeo(brand);
  return { title: seo.title, description: seo.description };
}

export function brandCategoryMetadata(
  brand: string,
  categoryName: string,
): Pick<Metadata, "title" | "description"> {
  const seo = getBrandCategorySeo(brand, categoryName);
  return { title: seo.title, description: seo.description };
}

export { brandToSlug };
