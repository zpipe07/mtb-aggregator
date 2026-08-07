import { track } from "@vercel/analytics";
import posthog from "posthog-js";

export type StoreOutboundClickProps = {
  deal_id: number;
  store: string;
  brand?: string;
  list_surface?: string;
  home_section?: string;
  cta?: string;
};

/** Retailer outbound click — PostHog + Vercel Analytics (same event name in both). */
export function captureStoreOutboundClick({
  cta,
  ...props
}: StoreOutboundClickProps) {
  const brand = props.brand ?? "";
  const viewAtStore = {
    deal_id: props.deal_id,
    store: props.store,
    brand,
    ...(props.list_surface ? { list_surface: props.list_surface } : {}),
    ...(props.home_section ? { home_section: props.home_section } : {}),
  };

  posthog.capture("view_at_store", viewAtStore);
  posthog.capture("deal_outbound_click", {
    ...viewAtStore,
    ...(cta ? { cta } : {}),
  });

  track("view_at_store", viewAtStore);
}
