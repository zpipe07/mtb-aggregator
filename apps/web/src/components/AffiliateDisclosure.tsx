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
      </div>
    </footer>
  );
}
