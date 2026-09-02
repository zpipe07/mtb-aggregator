import type { Metadata } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { fetchGiveaways } from "@/api";
import { JsonLd } from "@/components/JsonLd";
import { buildGiveawaysJsonLd } from "@/lib/jsonLd";
import { absoluteUrl } from "@/lib/siteUrl";
import { GiveawaysPageContent } from "@/views/GiveawaysPageContent";

const emptyGiveaways = {
  giveaways: [],
  open_count: 0,
  upcoming_count: 0,
  ended_count: 0,
};

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
  let data;
  try {
    data = await fetchGiveaways();
  } catch (err) {
    // Prerender must not fail the whole web build if GET /giveaways is down.
    // At request/ISR time, rethrow so error.tsx can run.
    if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
      console.error("GET /giveaways failed during static generation", err);
      data = emptyGiveaways;
    } else {
      throw err;
    }
  }

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
