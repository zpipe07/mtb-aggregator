import { beforeEach, describe, expect, it, vi } from "vitest";
import { storeDealDetailBackHref } from "@/lib/dealDetailBackStorage";
import { handleTrackedClick } from "./trackedClick";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn() },
}));

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("@/lib/dealDetailBackStorage", () => ({
  storeDealDetailBackHref: vi.fn(),
}));

describe("handleTrackedClick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fires Vercel only when event is omitted (image / title click)", async () => {
    const posthog = (await import("posthog-js")).default;
    const { track } = await import("@vercel/analytics");
    const stopPropagation = vi.fn();

    handleTrackedClick(
      { stopPropagation },
      {
        persistBackHref: "/deals?q=fox",
        vercelEvent: "deal_card_click",
        properties: { deal_id: 1, list_surface: "deals_list" },
      },
    );

    expect(stopPropagation).not.toHaveBeenCalled();
    expect(storeDealDetailBackHref).toHaveBeenCalledWith("/deals?q=fox");
    expect(track).toHaveBeenCalledWith("deal_card_click", {
      deal_id: 1,
      list_surface: "deals_list",
    });
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("fires PostHog + Vercel and stops propagation for footer CTAs", async () => {
    const posthog = (await import("posthog-js")).default;
    const { track } = await import("@vercel/analytics");
    const stopPropagation = vi.fn();

    handleTrackedClick(
      { stopPropagation },
      {
        stopClickPropagation: true,
        persistBackHref: "/deals",
        vercelEvent: "deal_card_click",
        vercelProperties: { deal_id: 2 },
        event: "deal_card_click",
        properties: { deal_id: 2, cta: "view_details" },
      },
    );

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(storeDealDetailBackHref).toHaveBeenCalledWith("/deals");
    expect(track).toHaveBeenCalledWith("deal_card_click", { deal_id: 2 });
    expect(posthog.capture).toHaveBeenCalledWith("deal_card_click", {
      deal_id: 2,
      cta: "view_details",
    });
  });
});
