import { describe, expect, it } from "vitest";
import { resolveScraperStorageState } from "./config.js";

describe("resolveScraperStorageState", () => {
  it("returns absolute paths unchanged", () => {
    expect(resolveScraperStorageState("/etc/secrets/cc-storage.json")).toBe(
      "/etc/secrets/cc-storage.json",
    );
  });

  it("resolves relative paths against cwd when file is missing", () => {
    const resolved = resolveScraperStorageState("cc-storage.json");
    expect(resolved.endsWith("/cc-storage.json") || resolved.endsWith("\\cc-storage.json")).toBe(
      true,
    );
  });
});
