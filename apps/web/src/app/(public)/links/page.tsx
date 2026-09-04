import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/siteUrl";
import { LinksPageContent } from "@/views/LinksPageContent";

const description =
  "Key destinations on The Dropper: all deals, mountain bikes, eMTBs, price hubs, and giveaways.";

export const metadata: Metadata = {
  title: "Links",
  description,
  robots: { index: false, follow: true },
  alternates: { canonical: "/links" },
  openGraph: {
    title: "Links | The Dropper",
    description,
    url: absoluteUrl("/links"),
  },
  twitter: {
    title: "Links | The Dropper",
    description,
  },
};

export default function LinksPage() {
  return <LinksPageContent />;
}
