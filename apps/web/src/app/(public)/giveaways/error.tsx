"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

export default function GiveawaysError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.withScope((scope) => {
      scope.setTag("surface", "giveaways_page");
      scope.setTag("failure_mode", "server_component_error");
      if (error.digest) scope.setTag("digest", error.digest);
      Sentry.captureException(error);
    });
  }, [error]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div
        className="rounded-[var(--radius)] border border-destructive/40 bg-destructive/10 px-6 py-8"
        role="alert"
      >
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide text-destructive">
          {"// Couldn't load giveaways"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong loading giveaways and raffles. Try again or
          refresh the page.
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
