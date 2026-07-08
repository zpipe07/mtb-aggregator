import type { Metadata } from "next";
import {
  PolicyInlineLink,
  PolicyPageShell,
  PolicySection,
} from "@/components/PolicyPageShell";
import { absoluteUrl } from "@/lib/siteUrl";

const description =
  "The Dropper does not sell products or process returns. Purchases and refunds are handled by the retailer where you buy.";

export const metadata: Metadata = {
  title: "Returns & refunds",
  description,
  alternates: { canonical: "/returns" },
  openGraph: {
    title: "Returns & refunds | The Dropper",
    description,
    url: absoluteUrl("/returns"),
  },
  twitter: {
    title: "Returns & refunds | The Dropper",
    description,
  },
};

export default function ReturnsPage() {
  return (
    <PolicyPageShell title="Returns & refunds" kicker="// returns">
      <PolicySection title="Summary">
        <p>
          <strong className="font-medium text-foreground">
            The Dropper does not accept returns and does not issue refunds.
          </strong>{" "}
          We are a deal comparison service, not a store. We do not take payment,
          ship products, or manage orders.
        </p>
      </PolicySection>

      <PolicySection title="Where to get help">
        <p>
          If you purchased a product after clicking through from The Dropper,
          your transaction was completed on a retailer&apos;s website. That
          retailer is responsible for fulfillment, shipping, returns, refunds,
          and warranty support.
        </p>
        <p>
          To start a return or refund, sign in to your account on the
          retailer&apos;s site (or use their guest order lookup), or contact
          their customer service with your order number.
        </p>
      </PolicySection>

      <PolicySection title="Return windows & fees">
        <p>
          Return eligibility, time limits, restocking fees, return shipping
          labels, and refund timing vary by retailer and product category. The
          Dropper does not set or enforce those terms.
        </p>
      </PolicySection>

      <PolicySection title="Defective or wrong items">
        <p>
          If you received a defective, damaged, or incorrect item, contact the
          retailer where you bought it. They will handle exchanges, replacements,
          or refunds according to their policy and applicable law.
        </p>
      </PolicySection>

      <PolicySection title="Price changes after purchase">
        <p>
          If a price drops on The Dropper after you bought from a retailer, that
          does not automatically entitle you to a price adjustment from The
          Dropper. Some retailers offer post-purchase price matching on their
          own—check with them directly.
        </p>
      </PolicySection>

      <PolicySection title="Related policies">
        <p>
          For shipping, affiliate disclosure, and how our site works, see our{" "}
          <PolicyInlineLink href="/policies">site policies</PolicyInlineLink>.
        </p>
      </PolicySection>
    </PolicyPageShell>
  );
}
