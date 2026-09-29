import { describe, expect, it } from "vitest";
import { generateStaticParams as dealParams } from "./page";
import { generateStaticParams as historyParams } from "./price-history/page";

describe("on-demand ISR for deal URLs", () => {
  it("exports an empty generateStaticParams so Next caches [id] after the first hit", () => {
    expect(dealParams()).toEqual([]);
    expect(historyParams()).toEqual([]);
  });
});
