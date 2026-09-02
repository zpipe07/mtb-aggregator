import type { Metadata } from "next";
import { fetchGiveaways } from "@/api";
import { JsonLd } from "@/components/JsonLd";
import { buildGiveawaysJsonLd } from "@/lib/jsonLd";
import { absoluteUrl } from "@/lib/siteUrl";
import { GiveawaysPageContent } from "@/views/GiveawaysPageContent";

/** 60s — contests can close between the 4h listing ISR cadence. Literal required by Next.js. */
export const revalidate = 60;

const pageDescription =
  "Active mountain bike giveaways and raffles — enter on the host site. The Dropper does not run these promotions.";

export const metadata: Metadata = {
  title: "Giveaways & raffles",
  description: pageDescription,
  alternates: { canonical: "/giveaways" },
  openGraph: {
    title: "Giveaways & raffles | The Dropper",
    description: pageDescription,
    url: absoluteUrl("/giveaways"),
  },
  twitter: {
    title: "Giveaways & raffles | The Dropper",
    description: pageDescription,
  },
};

export default async function GiveawaysPage() {
  const data = await fetchGiveaways();

  return (
    <>
      <JsonLd
        data={buildGiveawaysJsonLd({
          name: "MTB giveaways and raffles — The Dropper",
          description: pageDescription,
          pageUrl: absoluteUrl("/giveaways"),
          items: data.giveaways.map((g) => ({
            slug: g.slug,
            title: g.title,
          })),
        })}
      />
      <GiveawaysPageContent giveaways={data.giveaways} />
    </>
  );
}
