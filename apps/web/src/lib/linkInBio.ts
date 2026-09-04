/** Instagram + link-in-bio destinations for ZAC-228. See [docs/SOCIAL.md](../../../docs/SOCIAL.md). */

export const INSTAGRAM_HANDLE = "@thedropper.shop";

export const INSTAGRAM_PROFILE_URL = "https://www.instagram.com/thedropper.shop/";

/** Instagram website field. UTM so PostHog/Vercel can attribute bio traffic. */
export const INSTAGRAM_LINK_IN_BIO_URL =
  "https://thedropper.shop/links?utm_source=instagram&utm_medium=social&utm_campaign=link-in-bio";

export const LINK_IN_BIO_PATH = "/links";

/** Instagram profile bio (150-character limit). */
export const INSTAGRAM_BIO = [
  "Every MTB sale. One feed.",
  "US shops · live prices.",
  "Some links earn a commission.",
].join("\n");

export const INSTAGRAM_BIO_MAX_LENGTH = 150;

export type LinkInBioDestination = {
  id: string;
  label: string;
  href: string;
  description: string;
  featured?: boolean;
};

/**
 * Live destinations only. Add Friday Drop + get-started after ZAC-260 / ZAC-250 ship.
 * Do not invent a signup or a blog URL here.
 */
export const LINK_IN_BIO_DESTINATIONS: readonly LinkInBioDestination[] = [
  {
    id: "all_deals",
    label: "Browse all deals",
    href: "/deals",
    description: "Every shop we scrape, one feed.",
    featured: true,
  },
  {
    id: "mountain",
    label: "Mountain bikes",
    href: "/deals/c/bikes/mountain",
    description: "Live MTB sale prices.",
  },
  {
    id: "emtb",
    label: "eMTBs",
    href: "/deals/c/bikes/emtb",
    description: "Electric mountain bikes on sale.",
  },
  {
    id: "hub_mtb_3k",
    label: "Bikes under $3,000",
    href: "/deals/hub/mountain-bikes-under-3000",
    description: "Price-band hub when inventory is there.",
  },
  {
    id: "hub_emtb_5k",
    label: "eMTBs under $5,000",
    href: "/deals/hub/emtbs-under-5000",
    description: "Closeouts and last-year builds.",
  },
  {
    id: "giveaways",
    label: "Giveaways & raffles",
    href: "/giveaways",
    description: "Enter on the host site.",
  },
];
