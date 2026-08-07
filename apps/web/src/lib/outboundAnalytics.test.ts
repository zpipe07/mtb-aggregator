import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureMock, trackMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  trackMock: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: { capture: captureMock },
}));

vi.mock("@vercel/analytics", () => ({
  track: trackMock,
}));

import { captureStoreOutboundClick } from "./outboundAnalytics";

describe("captureStoreOutboundClick", () => {
  beforeEach(() => {
    captureMock.mockClear();
    trackMock.mockClear();
  });

  it("sends view_at_store to PostHog and Vercel Analytics", () => {
    captureStoreOutboundClick({
      deal_id: 42,
      store: "Worldwide Cyclery",
      brand: "SRAM",
      list_surface: "deals_list",
      cta: "snag_retailer",
    });

    expect(captureMock).toHaveBeenCalledTimes(2);
    expect(captureMock).toHaveBeenNthCalledWith(1, "view_at_store", {
      deal_id: 42,
      store: "Worldwide Cyclery",
      brand: "SRAM",
      list_surface: "deals_list",
    });
    expect(captureMock).toHaveBeenNthCalledWith(2, "deal_outbound_click", {
      deal_id: 42,
      store: "Worldwide Cyclery",
      brand: "SRAM",
      list_surface: "deals_list",
      cta: "snag_retailer",
    });
    expect(trackMock).toHaveBeenCalledWith("view_at_store", {
      deal_id: 42,
      store: "Worldwide Cyclery",
      brand: "SRAM",
      list_surface: "deals_list",
    });
  });
});
