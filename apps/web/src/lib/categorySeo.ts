import type { Metadata } from "next";
import categoriesExport from "../../../../packages/shared/categories.export.json";

export type CategorySeoMeta = {
  /** Page `<title>` segment (template adds ` | The Dropper` in root layout). */
  title: string;
  /** Meta description; keep under ~160 chars for SERPs. */
  description: string;
  /** Optional intro paragraph below the deal grid (GEO / long-tail context). */
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
  else if (slug === "bikes-emtb") title = "Electric mountain bike deals";
  else if (slug === "bikes-electric") title = "Electric bike deals";
  else if (slug === "bikes-gravel") title = "Gravel bike deals";
  else if (slug === "bikes-road") title = "Road bike deals";
  else if (slug === "bikes-kids") title = "Kids bike deals";
  else if (slug === "bikes-bmx") title = "BMX bike deals";
  else if (slug === "bikes-frames") title = "Bike frame deals";
  else if (slug === "components") title = "Mountain bike component deals";
  else if (slug === "gear") title = "Mountain bike gear deals";
  else if (slug === "accessories") title = "Mountain bike accessory deals";
  else if (slug.startsWith("bikes-mountain-")) {
    const seg = slug.slice("bikes-mountain-".length).replace(/-/g, " ");
    title = `${seg} mountain bike deals`;
  } else if (slug.startsWith("bikes-emtb-")) {
    const seg = slug.slice("bikes-emtb-".length).replace(/-/g, " ");
    title = `${seg} eMTB deals`;
  } else if (slug.startsWith("bikes-")) title = `${name} bike deals`;
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
      "Compare prices on electric road, gravel, and commuter bikes. Find e-bike deals from top retailers.",
    intro:
      "Browse electric bike deals outside the MTB category—road, gravel, city, and hybrid. Compare prices across shops.",
  },
  "bikes-emtb": {
    title: "Electric mountain bike deals",
    description:
      "Compare prices on electric mountain bikes and eMTBs. Find full-power and lightweight eMTB deals from top retailers.",
    intro:
      "Shop eMTB sale prices: full-power and lightweight builds. Compare retailers in one place.",
  },
  "bikes-emtb-full-power": {
    title: "Full power eMTB deals",
    description:
      "Find full-power eMTB deals. Compare prices on high-torque electric mountain bikes from top retailers.",
    intro:
      "Browse full-power electric mountain bikes on sale. Compare specs and prices before you buy.",
  },
  "bikes-emtb-lightweight": {
    title: "Lightweight eMTB deals",
    description:
      "Compare lightweight eMTB deals. Find lighter electric mountain bikes on sale across retailers.",
    intro:
      "Shop lightweight eMTBs—less weight, same trail fun. Compare current sale prices.",
  },
  "bikes-mountain-xc": {
    title: "XC mountain bike deals",
    description:
      "Find XC mountain bike deals. Compare cross-country and race-ready MTBs on sale.",
    intro:
      "Browse XC bike sale prices—efficient pedaling for climbs and marathon laps.",
  },
  "bikes-mountain-trail": {
    title: "Trail mountain bike deals",
    description:
      "Compare trail mountain bike deals. Find all-mountain and trail bikes on sale.",
    intro:
      "Shop trail bike discounts—versatile geometry for everyday singletrack.",
  },
  "bikes-mountain-enduro": {
    title: "Enduro mountain bike deals",
    description:
      "Find enduro mountain bike deals. Compare long-travel bikes built for big terrain.",
    intro:
      "Browse enduro MTB sale prices—descend fast, still pedal to the top.",
  },
  "bikes-mountain-downhill": {
    title: "Downhill mountain bike deals",
    description:
      "Compare downhill mountain bike deals. Find DH bikes and park rigs on sale.",
    intro:
      "Shop downhill bike discounts—maximum travel for lift laps and steep tracks.",
  },
  "bikes-mountain-dirt-jump": {
    title: "Dirt jump bike deals",
    description:
      "Find dirt jump bike deals. Compare DJ bikes and slopestyle rigs on sale.",
    intro:
      "Browse dirt jump and pump-track bikes at sale prices across retailers.",
  },
  "bikes-mountain-fat-bike": {
    title: "Fat bike deals",
    description:
      "Compare fat bike deals. Find fat-tire mountain bikes for snow, sand, and trail.",
    intro:
      "Shop fat bike sale prices—extra traction when the surface gets soft.",
  },
  "bikes-bmx": {
    title: "BMX bike deals",
    description:
      "Compare BMX bike deals. Find freestyle, park, and race BMX bikes on sale across retailers.",
    intro:
      "Shop complete BMX bikes—20\", 18\", and cruiser builds. Not dirt-jump MTB hardtails (see Mountain > Dirt Jump).",
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
  "components-brakes-brakesets": {
    description:
      "Compare MTB brake set deals. Find hydraulic disc brake sets on sale across retailers.",
    intro:
      "Brake set markdowns—match calipers, rotors, and hoses to your build.",
  },
  "components-brakes-rotors": {
    intro:
      "Shop rotor deals by size and mount. Compare prices before you refresh worn rotors.",
  },
  "components-suspension-forks": {
    description:
      "Compare mountain bike fork deals. Find trail, enduro, and XC suspension forks on sale.",
    intro:
      "Fork deals from Fox, RockShox, and more—compare travel and wheel size before you buy.",
  },
  "components-suspension-shocks": {
    intro:
      "Rear shock deals for trail and enduro builds. Compare stroke and tune options.",
  },
  "components-drivetrain-cassettes": {
    intro:
      "Cassette deals for 11-, 12-, and 13-speed builds. Compare tooth counts and prices.",
  },
  "components-drivetrain-derailleurs": {
    intro:
      "Derailleur markdowns for MTB drivetrains. Compare mechanical and electronic options.",
  },
  "components-drivetrain-bottom-brackets": {
    description:
      "Compare bottom bracket deals for MTB builds. Find BSA, PF30, BB86/92, and T47 interfaces on sale.",
    intro:
      "Shop bottom bracket markdowns by standard and shell width. Match your frame before you buy.",
  },
  "components-drivetrain-parts": {
    description:
      "Compare deals on drivetrain hardware: hangers, jockey wheels, chains, and cable housing.",
    intro:
      "Small drivetrain parts sold without a complete cassette, derailleur, or crankset.",
  },
  "components-brakes-parts": {
    description:
      "Find deals on brake cables, olives, adapters, pistons, and hoses sold without a complete brakeset.",
    intro:
      "Shop small brake hardware. Complete brakesets, pads, and rotors have their own shelves.",
  },
  "components-suspension-parts": {
    description:
      "Compare deals on fork and shock seal kits, dust wipers, volume spacers, and rebuild kits.",
    intro:
      "Replacement suspension hardware sold without a complete fork or shock. Pumps live under Accessories.",
  },
  "components-wheels-tires-parts": {
    description:
      "Find deals on spokes, nipples, rim strips, and thru-axles. Wheelsets and tires have their own shelves.",
    intro:
      "Shop small wheel hardware. Complete wheels, rims, hubs, and tubeless kits are listed separately.",
  },
  "components-cockpit-parts": {
    description:
      "Compare deals on bar ends, stem caps, headset spacers, and dropper remotes sold alone.",
    intro:
      "Small cockpit hardware. Complete bars, stems, seatposts, and headsets have their own shelves.",
  },
  "components-cockpit-headsets": {
    description:
      "Find headset deals for mountain bikes. Compare ZS, EC, and integrated (IS) standards across retailers.",
    intro:
      "Browse headset sale prices — threadless and integrated cups for your head tube.",
  },
  "components-wheels-tires-tires": {
    intro:
      "MTB tire deals—trail, enduro, and XC rubber when shops run sales.",
  },
  "components-wheels-tires-tubeless": {
    description:
      "Compare tubeless setup deals: valve stems, rim tape, tire sealant, kits, and tire inserts across MTB retailers.",
    intro:
      "Shop tubeless valves, sealant, rim tape, and inserts when shops mark them down.",
  },
  "components-suspension": {
    description:
      "Find deals on fork and shock suspension for mountain bikes. Compare prices across retailers.",
    intro:
      "Browse suspension forks, shocks, and related parts. Compare prices before you buy.",
  },
  "components-wheels-tires": {
    description:
      "Compare mountain bike wheel and tire deals: rims, hubs, wheels, tires, and tubeless setup.",
    intro:
      "Shop wheel and tire deals for MTB and gravel—plus tubeless valves, tape, and sealant when shops run sales.",
  },
  "components-cockpit": {
    description:
      "Find deals on handlebars, stems, grips, and seatposts for mountain bikes.",
    intro:
      "Upgrade your cockpit—browse sale prices on bars, stems, grips, and more.",
  },
  gear: {
    description:
      "Compare deals on MTB gear: helmets, eyewear, protection, clothing, and shoes.",
    intro:
      "Browse gear sale prices and compare retailers in one place.",
  },
  "gear-helmets": {
    description:
      "Find the best deals on mountain bike helmets. Compare prices across brands and retailers.",
    intro:
      "Shop complete helmet discounts and compare prices across top retailers. Replacement visors, liners, and pad kits live under Helmet parts.",
  },
  "gear-helmet-parts": {
    description:
      "Compare deals on helmet visors, liners, cheek pads, and other replacement helmet parts.",
    intro:
      "Shop sale prices on helmet accessories sold without a helmet—visors, liners, pad kits, and fit parts.",
  },
  "gear-eyewear": {
    description:
      "Compare deals on MTB sunglasses and bike goggles. Find sale prices across retailers.",
    intro:
      "Shop eyewear deals for trail, enduro, and downhill riding.",
  },
  "gear-eyewear-sunglasses": {
    description:
      "Find the best deals on cycling sunglasses and MTB glasses. Compare prices across brands.",
    intro:
      "Browse sunglass deals for trail and gravel riding.",
  },
  "gear-eyewear-goggles": {
    description:
      "Compare mountain bike goggle deals. Find discounts on DH and enduro goggles.",
    intro:
      "Shop goggle deals for full-face and gravity riding.",
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
  "gear-clothing-jerseys": {
    description:
      "Compare MTB jersey deals. Find sale prices on trail, enduro, and XC jerseys across retailers.",
    intro:
      "Shop technical riding jerseys and compare markdowns across shops.",
  },
  "gear-clothing-jackets": {
    description:
      "Find deals on MTB jackets, rain shells, and windbreakers. Compare prices across retailers.",
    intro:
      "Browse outerwear deals for wet and windy trail days.",
  },
  "gear-clothing-shirts": {
    description:
      "Compare deals on MTB tees, hoodies, and base layers. Find casual riding apparel on sale.",
    intro:
      "Shop casual riding tops and base layers at sale prices.",
  },
  "gear-clothing-shorts": {
    description:
      "Find the best deals on MTB shorts and bib shorts. Compare prices across retailers.",
    intro:
      "Browse baggy trail shorts, liner shorts, and bib deals in one place.",
  },
  "gear-clothing-pants": {
    description:
      "Compare mountain bike pants and bib tights deals. Find discounts on riding pants.",
    intro:
      "Shop full-length riding pants and tights for cooler conditions.",
  },
  "gear-clothing-socks": {
    description:
      "Find deals on cycling socks. Compare MTB sock sale prices across retailers.",
    intro:
      "Browse cycling sock deals for trail and gravity riding.",
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
      "Compare deals on MTB accessories: tools, pumps, bags, lights, and more.",
    intro:
      "Browse accessory deals and compare prices across retailers.",
  },
  "accessories-pumps": {
    description:
      "Compare deals on bike pumps: floor pumps, mini pumps, shock pumps, and CO2 inflators across MTB retailers.",
    intro:
      "Shop floor, mini, shock, and electric pump markdowns. Compare prices before your next ride or suspension tune.",
  },
  "accessories-tools": {
    description:
      "Find deals on bike tools, tool kits, and workshop essentials for mountain bikes.",
    intro:
      "Compare sale prices on multi-tools, chain tools, and maintenance gear — not pumps (see Pumps).",
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
  const tuned = HAND_TUNED[slug];
  if (!row) {
    if (tuned) return { ...DEFAULTS, ...tuned };
    return DEFAULTS;
  }
  const base = defaultSeoFromRow(row);
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
