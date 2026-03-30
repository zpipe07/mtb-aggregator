import type { Metadata } from "next";
import categoriesExport from "../../../../packages/shared/categories.export.json";

export type CategorySeoMeta = {
  /** Page `<title>` segment (template adds ` | The Dropper` in root layout). */
  title: string;
  /** Meta description; keep under ~160 chars for SERPs. */
  description: string;
  /** Optional intro paragraph above the grid (GEO / long-tail context). */
  intro?: string;
};

/** Point-in-time production category rows — regenerate `packages/shared/categories.export.json` from Neon when taxonomy changes. */
type ExportCategory = (typeof categoriesExport.categories)[number];

const slugToRow = new Map<string, ExportCategory>(
  categoriesExport.categories.map((c) => [c.slug, c])
);

const DEFAULTS: CategorySeoMeta = {
  title: "Mountain bike deals",
  description:
    "Browse mountain bike deals on The Dropper. Compare prices across retailers and find discounts on bikes, components, and gear.",
};

function defaultSeoFromRow(row: ExportCategory): CategorySeoMeta {
  const { slug, name } = row;
  const lower = name.toLowerCase();

  let title = `${name} deals`;
  if (slug === "bikes") title = "Mountain bike deals";
  else if (slug === "bikes-mountain") title = "Mountain bike deals";
  else if (slug === "bikes-electric") title = "Electric mountain bike deals";
  else if (slug === "bikes-gravel") title = "Gravel bike deals";
  else if (slug === "bikes-road") title = "Road bike deals";
  else if (slug === "bikes-kids") title = "Kids bike deals";
  else if (slug === "bikes-frames") title = "Bike frame deals";
  else if (slug === "components") title = "Mountain bike component deals";
  else if (slug === "gear") title = "Mountain bike gear deals";
  else if (slug === "accessories") title = "Mountain bike accessory deals";
  else if (slug.startsWith("bikes-")) title = `${name} bike deals`;
  else if (slug.startsWith("components-")) title = `MTB ${lower} deals`;
  else if (slug.startsWith("gear-")) title = `MTB ${lower} deals`;
  else if (slug.startsWith("accessories-")) title = `Bike ${lower} deals`;

  const description = `Compare ${name} deals across top retailers. Find sale prices and discounts on The Dropper.`;

  return { title, description };
}

/**
 * Optional richer copy for specific slugs (merged over `defaultSeoFromRow`).
 * Keys must exist in `categories.export.json`.
 */
const HAND_TUNED: Partial<Record<string, Partial<CategorySeoMeta>>> = {
  bikes: {
    description:
      "Compare mountain bike deals across top retailers. Find the best prices on trail, enduro, and XC bikes.",
    intro:
      "Shop sale prices on mountain bikes from leading retailers. Browse by category below to narrow down trail, enduro, e-bikes, and more.",
  },
  "bikes-mountain": {
    description:
      "Find the best deals on mountain bikes and MTBs. Compare prices on trail, enduro, and XC bikes from top retailers.",
    intro:
      "Whether you’re after a trail hardtail or a full-suspension enduro rig, compare current sale prices across shops in one place.",
  },
  "bikes-electric": {
    description:
      "Compare prices on electric mountain bikes and eMTBs. Find full-power and lightweight e-bike deals from top retailers.",
    intro:
      "Browse full-power and lightweight eMTB deals, updated regularly. Compare prices before you buy.",
  },
  "bikes-gravel": {
    intro:
      "Shop gravel and adventure bike deals in one place. Compare prices across retailers.",
  },
  "bikes-road": {
    intro:
      "Browse road bike sale prices and compare retailers in one place.",
  },
  "bikes-kids": {
    intro:
      "Shop sale prices on kids and youth bikes. Compare sizes and prices across shops.",
  },
  "bikes-frames": {
    description:
      "Compare deals on bike frames for mountain, road, and gravel. Find sale prices across retailers.",
    intro:
      "Browse frame deals for your next build. Compare prices across shops on The Dropper.",
  },
  components: {
    description:
      "Compare deals on MTB components: drivetrains, brakes, suspension, wheels, and cockpit parts.",
    intro:
      "Upgrade your ride or replace worn parts—browse component deals and compare prices across retailers.",
  },
  "components-drivetrain": {
    description:
      "Find the best deals on mountain bike drivetrains, chains, cassettes, and derailleurs.",
    intro:
      "Compare sale prices on drivetrain parts from major brands. Filter by specs to match your build.",
  },
  "components-brakes": {
    description:
      "Compare mountain bike brake deals. Find discounts on rotors, calipers, pads, and hydraulic brakes.",
    intro:
      "Shop brake component deals and compare prices across retailers.",
  },
  "components-suspension": {
    description:
      "Find deals on fork and shock suspension for mountain bikes. Compare prices across retailers.",
    intro:
      "Browse suspension forks, shocks, and related parts. Compare prices before you buy.",
  },
  "components-wheels-tires": {
    description:
      "Compare mountain bike wheel and tire deals: rims, hubs, wheels, and tires. Find the best prices.",
    intro:
      "Shop wheel and tire deals for MTB and gravel. Compare prices across retailers.",
  },
  "components-cockpit": {
    description:
      "Find deals on handlebars, stems, grips, and seatposts for mountain bikes.",
    intro:
      "Upgrade your cockpit—browse sale prices on bars, stems, grips, and more.",
  },
  gear: {
    description:
      "Compare deals on MTB gear: helmets, protection, clothing, and shoes.",
    intro:
      "Browse gear sale prices and compare retailers in one place.",
  },
  "gear-helmets": {
    description:
      "Find the best deals on mountain bike helmets. Compare prices across brands and retailers.",
    intro:
      "Shop helmet discounts and compare prices across top retailers.",
  },
  "gear-protection": {
    description:
      "Compare deals on pads, body armor, and protection for mountain biking.",
    intro:
      "Browse pads and protection gear on sale. Compare prices across shops.",
  },
  "gear-clothing": {
    description:
      "Find deals on MTB jerseys, shorts, jackets, and riding apparel.",
    intro:
      "Compare sale prices on riding apparel and layers.",
  },
  "gear-shoes": {
    description:
      "Compare mountain bike shoe deals. Find discounts on flat and clipless MTB shoes.",
    intro:
      "Shop sale prices on mountain bike footwear. Compare retailers in one place.",
  },
  "gear-gloves": {
    description:
      "Compare deals on mountain bike gloves. Find sale prices across retailers.",
    intro:
      "Browse glove deals for trail and gravity riding.",
  },
  accessories: {
    description:
      "Compare deals on MTB accessories: tools, bags, lights, and more.",
    intro:
      "Browse accessory deals and compare prices across retailers.",
  },
  "accessories-tools": {
    description:
      "Find deals on bike tools, tool kits, and workshop essentials for mountain bikes.",
    intro:
      "Compare sale prices on tools and maintenance gear.",
  },
  "accessories-bags": {
    description:
      "Compare deals on bike bags, hydration packs, and frame bags.",
    intro:
      "Shop bags and packs on sale. Compare prices across retailers.",
  },
  "accessories-lights": {
    description:
      "Find the best deals on bike lights for mountain biking. Compare prices across retailers.",
    intro:
      "Browse front and rear light deals for trail and road riding.",
  },
  "accessories-hydration": {
    description:
      "Compare deals on hydration packs, bottles, and reservoirs for mountain biking.",
    intro:
      "Shop hydration gear on sale. Compare prices across retailers.",
  },
};

export function getCategorySeo(slug: string): CategorySeoMeta {
  const row = slugToRow.get(slug);
  if (!row) return DEFAULTS;
  const base = defaultSeoFromRow(row);
  const tuned = HAND_TUNED[slug];
  if (!tuned) return base;
  return { ...base, ...tuned };
}

export function categoryMetadataForSlug(slug: string): Pick<Metadata, "title" | "description"> {
  const seo = getCategorySeo(slug);
  return {
    title: seo.title,
    description: seo.description,
  };
}
