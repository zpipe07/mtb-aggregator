import { describe, expect, it } from "vitest";
import { shouldPersistStorageAfterPdp } from "./storage-state.js";

describe("shouldPersistStorageAfterPdp", () => {
  const goodPage = {
    ldJsonScriptCount: 2,
    productNodesWithHasVariant: 1,
    variants: [],
    htmlBytes: 50_000,
    looksLikeWaf: false,
  };

  it("persists after a non-WAF PDP with JSON-LD", () => {
    expect(shouldPersistStorageAfterPdp(goodPage, false)).toBe(true);
  });

  it("skips WAF-blocked sessions", () => {
    expect(shouldPersistStorageAfterPdp(goodPage, true)).toBe(false);
    expect(
      shouldPersistStorageAfterPdp({ ...goodPage, looksLikeWaf: true }, false),
    ).toBe(false);
  });

  it("skips pages without JSON-LD", () => {
    expect(
      shouldPersistStorageAfterPdp({ ...goodPage, ldJsonScriptCount: 0 }, false),
    ).toBe(false);
  });
});
