"use client";

import { track } from "@vercel/analytics";
import posthog from "posthog-js";
import { storeDealDetailBackHref } from "@/lib/dealDetailBackStorage";

export type TrackedProperties = Record<string, unknown>;

export type TrackedClickOptions = {
  /** PostHog event name. Omit to skip PostHog (e.g. image click is Vercel-only). */
  event?: string;
  properties?: TrackedProperties;
  /** Vercel Analytics event name. */
  vercelEvent?: string;
  /** Defaults to `properties` when omitted. */
  vercelProperties?: TrackedProperties;
  /** sessionStorage back-href for deal PDP (internal nav only). */
  persistBackHref?: string;
  onNavigate?: () => void;
  stopClickPropagation?: boolean;
};

export function handleTrackedClick(
  e: { stopPropagation: () => void },
  {
    event,
    properties,
    vercelEvent,
    vercelProperties,
    persistBackHref,
    onNavigate,
    stopClickPropagation,
  }: TrackedClickOptions,
): void {
  if (stopClickPropagation) e.stopPropagation();
  if (persistBackHref) storeDealDetailBackHref(persistBackHref);
  onNavigate?.();
  if (vercelEvent) {
    track(vercelEvent, (vercelProperties ?? properties) as Parameters<typeof track>[1]);
  }
  if (event) posthog.capture(event, properties);
}
