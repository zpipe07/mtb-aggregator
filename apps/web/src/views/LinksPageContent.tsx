"use client";

import { useEffect } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { TheDropperLogo } from "@/components/TheDropperLogo";
import { Button } from "@/components/ui/button";
import {
  INSTAGRAM_HANDLE,
  INSTAGRAM_PROFILE_URL,
  LINK_IN_BIO_DESTINATIONS,
  type LinkInBioDestination,
} from "@/lib/linkInBio";

function captureLinkClick(dest: LinkInBioDestination) {
  posthog.capture("link_in_bio_clicked", {
    link_id: dest.id,
    href: dest.href,
  });
}

export function LinksPageContent() {
  useEffect(() => {
    posthog.capture("link_in_bio_viewed");
  }, []);

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8 text-center">
        <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {"// links"}
        </p>
        <TheDropperLogo
          variant="full"
          className="mx-auto h-14 text-foreground sm:h-16"
        />
        <h1 className="mt-5 text-3xl font-semibold leading-[0.95] tracking-[-0.025em] text-foreground">
          Every MTB sale. One feed.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Live prices from the shops we scrape. Pick a destination — we may earn
          a commission if you buy through a deal link.
        </p>
      </header>

      <nav aria-label="Key destinations" className="flex flex-col gap-2.5">
        {LINK_IN_BIO_DESTINATIONS.map((dest) => (
          <Button
            key={dest.id}
            asChild
            variant={dest.featured ? "default" : "outline"}
            size="lg"
            className="h-auto w-full flex-col items-start gap-0.5 px-4 py-3.5 whitespace-normal"
          >
            <Link href={dest.href} onClick={() => captureLinkClick(dest)}>
              <span className="text-left font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em]">
                {dest.label}
              </span>
              <span
                className={
                  dest.featured
                    ? "text-left text-xs font-sans font-normal normal-case tracking-normal text-background/80"
                    : "text-left text-xs font-sans font-normal normal-case tracking-normal text-muted-foreground"
                }
              >
                {dest.description}
              </span>
            </Link>
          </Button>
        ))}
      </nav>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        <a
          href={INSTAGRAM_PROFILE_URL}
          className="font-medium text-foreground underline-offset-4 hover:underline"
          rel="noopener noreferrer"
          target="_blank"
        >
          {INSTAGRAM_HANDLE}
        </a>{" "}
        on Instagram
      </p>
    </div>
  );
}
