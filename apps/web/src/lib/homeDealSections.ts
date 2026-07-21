import type { Deal } from "@/api";

/** Home page "top deals" rows — one scoped fetch per section. */
export type HomeDealSectionId = "mtb" | "emtb" | "components" | "gear";

export type HomeDealSectionConfig = {
  id: HomeDealSectionId;
  title: string;
  categorySlug: string;
  minPrice: number;
};

export type HomeDealSection = HomeDealSectionConfig & {
  deals: Deal[];
};

export const HOME_DEAL_SECTIONS: HomeDealSectionConfig[] = [
  {
    id: "mtb",
    title: "Top mountain bike deals of the day",
    categorySlug: "bikes-mountain",
    minPrice: 40,
  },
  {
    id: "emtb",
    title: "Top eMTB deals of the day",
    categorySlug: "bikes-emtb",
    minPrice: 40,
  },
  {
    id: "components",
    title: "Top component deals of the day",
    categorySlug: "components",
    minPrice: 25,
  },
  {
    id: "gear",
    title: "Top gear deals of the day",
    categorySlug: "gear",
    minPrice: 25,
  },
];

export const HOME_DEAL_SECTION_LIMIT = 6;
export const HOME_PRICE_DROPS_LIMIT = 6;
export const HOME_PRICE_DROPS_SECTION_ID = "price_drops" as const;
