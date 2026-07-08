import type { Metadata } from "next";
import {
  PolicyInlineLink,
  PolicyPageShell,
  PolicySection,
} from "@/components/PolicyPageShell";
import { absoluteUrl } from "@/lib/siteUrl";

const description =
  "How The Dropper works: deal aggregation, affiliate links, shipping, pricing accuracy, and where to find return information.";

export const metadata: Metadata = {
  title: "Policies",
  description,
  alternates: { canonical: "/policies" },
  openGraph: {
    title: "Policies | The Dropper",
    description,
    url: absoluteUrl("/policies"),
  },
  twitter: {
    title: "Policies | The Dropper",
    description,
  },
};

export default function PoliciesPage() {
  return (
    <PolicyPageShell title="Site policies">
      <PolicySection title="What The Dropper is">
        <p>
          The Dropper (thedropper.shop) is a mountain bike deal aggregator. We
          collect and compare publicly listed sale prices from participating
          retailers. We do not sell products, hold inventory, process payments,
          ship orders, or handle returns.
        </p>
      </PolicySection>

      <PolicySection title="How purchases work">
        <p>
          When you choose a deal, you may view details on The Dropper and then
          continue to a retailer&apos;s website to complete your purchase. The
          retailer sets the final price, shipping options, delivery time, taxes,
          and checkout terms at the time you buy.
        </p>
        <p>
          Always confirm price, availability, and product configuration on the
          retailer&apos;s site before you pay.
        </p>
      </PolicySection>

      <PolicySection title="Shipping">
        <p>
          The Dropper does not fulfill or ship orders. We do not charge shipping
          fees. Shipping costs, carriers, delivery windows, and order tracking are
          determined solely by the retailer where you complete your purchase.
        </p>
      </PolicySection>

      <PolicySection title="Returns & refunds">
        <p>
          The Dropper does not accept returns or issue refunds for products. If
          you need to return an item or request a refund, contact the retailer
          where you placed the order and follow that retailer&apos;s policy.
        </p>
        <p>
          See our{" "}
          <PolicyInlineLink href="/returns">
            returns &amp; refunds policy
          </PolicyInlineLink>{" "}
          for full details.
        </p>
      </PolicySection>

      <PolicySection title="Affiliate disclosure">
        <p>
          The Dropper may earn a commission when you purchase through links on
          this site. Affiliate relationships do not change the listed sale
          price shown on a retailer&apos;s site at checkout. Prices and inventory
          change frequently; we update listings on a regular schedule but cannot
          guarantee real-time accuracy.
        </p>
      </PolicySection>

      <PolicySection title="Pricing & availability">
        <p>
          Deal prices, discounts, and in-stock status are based on data scraped
          or ingested from retailer sources. Displayed savings percentages and
          deal scores are estimates to help you compare offers; they are not a
          guarantee of the lowest possible price everywhere online.
        </p>
      </PolicySection>

      <PolicySection title="Questions">
        <p>
          For order, shipping, return, or warranty questions about a product you
          bought, contact the retailer directly. For questions about The Dropper
          itself, use the contact information on this site.
        </p>
      </PolicySection>
    </PolicyPageShell>
  );
}
