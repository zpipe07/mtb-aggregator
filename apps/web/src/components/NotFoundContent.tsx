import Link from "next/link";
import { Button } from "@/components/ui/button";

export function NotFoundContent() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24">
      <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {"// 404 · off the trail"}
      </p>
      <h1 className="text-4xl font-semibold leading-[0.95] tracking-[-0.025em] text-foreground sm:text-5xl">
        <span className="relative inline-block">
          <span className="relative z-10">Nothing dialed in here.</span>
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-1 -z-0 h-3 bg-primary opacity-70"
          />
        </span>
      </h1>
      <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
        This page may have sold out, moved, or never existed. Head back to live
        deals across 50+ shops.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button asChild>
          <Link href="/deals">Browse deals</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back home</Link>
        </Button>
      </div>
    </div>
  );
}
