import { describe, expect, it } from "vitest";
import { formatTextLine, httpAccessEnabled } from "./index.js";

describe("formatTextLine", () => {
  it("orders core fields first", () => {
    const line = formatTextLine({
      ts: "2026-05-20T22:32:51.123Z",
      level: "info",
      service: "api",
      component: "scheduler",
      msg: "scrape completed",
      store: "jensonusa",
    });
    expect(line).toContain('ts="2026-05-20T22:32:51.123Z"');
    expect(line.indexOf("ts=")).toBeLessThan(line.indexOf("store="));
  });
});

describe("httpAccessEnabled", () => {
  it("disables on Render with auto", () => {
    const prevRender = process.env.RENDER;
    const prevSetting = process.env.LOG_HTTP_ACCESS;
    process.env.LOG_HTTP_ACCESS = "auto";
    process.env.RENDER = "true";
    expect(httpAccessEnabled()).toBe(false);
    process.env.RENDER = prevRender;
    process.env.LOG_HTTP_ACCESS = prevSetting;
  });
});
