"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

export default function DealsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const searchParamsString = searchParams.toString();
    Sentry.withScope((scope) => {
      scope.setTag("surface", "deals_page");
      scope.setTag("failure_mode", "server_component_error");
      scope.setContext("deals_navigation", {
        pathname,
        search_params: searchParamsString,
        sort: searchParams.get("sort") ?? "discount",
        offset: searchParams.get("offset") ?? "0",
      });
      if (error.digest) scope.setTag("digest", error.digest);
      Sentry.captureException(error);
    });
  }, [error, pathname, searchParams]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div
        className="rounded-[var(--radius)] border border-destructive/40 bg-destructive/10 px-6 py-8"
        role="alert"
      >
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-destructive">
          {"// Couldn't load deals"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong loading these results. Try again or refresh the
          page.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => reset()}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
