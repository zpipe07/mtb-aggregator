import { describe, expect, it } from "vitest";
import {
  deriveGiveawayStatus,
  formatGiveawayDate,
  formatTicketPrice,
} from "./giveawayStatus";

describe("deriveGiveawayStatus", () => {
  const now = new Date("2026-09-02T18:00:00.000Z");

  it("returns open when ends_at is in the future and starts_at is unset", () => {
    expect(
      deriveGiveawayStatus({ ends_at: "2026-09-15T23:59:59.000Z" }, now),
    ).toBe("open");
  });

  it("returns upcoming when starts_at is in the future", () => {
    expect(
      deriveGiveawayStatus(
        {
          starts_at: "2026-09-10T00:00:00.000Z",
          ends_at: "2026-09-20T00:00:00.000Z",
        },
        now,
      ),
    ).toBe("upcoming");
  });

  it("returns ended at exact ends_at", () => {
    expect(
      deriveGiveawayStatus({ ends_at: "2026-09-02T18:00:00.000Z" }, now),
    ).toBe("ended");
  });

  it("prefers ended over upcoming if ends_at has passed", () => {
    expect(
      deriveGiveawayStatus(
        {
          starts_at: "2026-09-10T00:00:00.000Z",
          ends_at: "2026-09-01T00:00:00.000Z",
        },
        now,
      ),
    ).toBe("ended");
  });
});

describe("formatTicketPrice", () => {
  it("formats whole-dollar USD", () => {
    expect(formatTicketPrice(10, "USD")).toBe("$10");
  });

  it("formats cents", () => {
    expect(formatTicketPrice(10.5, "USD")).toBe("$10.50");
  });

  it("returns null for missing or zero", () => {
    expect(formatTicketPrice(null)).toBeNull();
    expect(formatTicketPrice(0)).toBeNull();
  });
});

describe("formatGiveawayDate", () => {
  it("omits year when it matches now", () => {
    expect(formatGiveawayDate("2026-09-15T23:59:59Z", new Date("2026-01-01"))).toBe(
      "Sep 15",
    );
  });
});
