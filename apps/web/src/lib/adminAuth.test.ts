import { afterEach, describe, expect, it, vi } from "vitest";
import {
  validateAdminBearer,
  validateCronBearer,
  validateCronSecretHeader,
} from "./adminAuth";

describe("admin/cron bearer auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts matching admin Bearer", () => {
    vi.stubEnv("ADMIN_PASSWORD", "admin-secret");
    expect(validateAdminBearer("Bearer admin-secret")).toBe(true);
    expect(validateAdminBearer("Bearer nope")).toBe(false);
  });

  it("accepts matching cron Bearer and X-Cron-Secret", () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect(validateCronBearer("Bearer cron-secret")).toBe(true);
    expect(validateCronBearer("Bearer admin-secret")).toBe(false);
    expect(validateCronSecretHeader("cron-secret")).toBe(true);
    expect(validateCronSecretHeader("nope")).toBe(false);
  });
});
