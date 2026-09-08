import Link from "next/link";
import { INSTAGRAM_PROFILE_URL } from "@/lib/linkInBio";
import { cn, focusRing } from "@/lib/utils";

const footerLink =
  "font-medium text-foreground underline-offset-4 hover:underline";

/** Site-wide notice for compensated retailer links (copy should match affiliate program terms). */
export function AffiliateDisclosure() {
  return (
    <footer className="mt-auto border-t border-border bg-muted/25">
      <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
        <p>
          The Dropper may earn a commission when you purchase through links on
          this site. Prices and availability change; always confirm on the
          retailer&apos;s site before you buy.
        </p>
        <nav
          aria-label="Legal and policies"
          className="mt-4 flex flex-wrap gap-x-4 gap-y-1"
        >
          <Link href="/giveaways" className={cn(footerLink, focusRing)}>
            Giveaways
          </Link>
          <Link href="/policies" className={cn(footerLink, focusRing)}>
            Policies
          </Link>
          <Link href="/returns" className={cn(footerLink, focusRing)}>
            Returns &amp; refunds
          </Link>
        </nav>
        <nav aria-label="Social" className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <a
            href={INSTAGRAM_PROFILE_URL}
            className={cn(footerLink, focusRing)}
            rel="noopener noreferrer"
            target="_blank"
          >
            Instagram
          </a>
        </nav>
      </div>
    </footer>
  );
}
