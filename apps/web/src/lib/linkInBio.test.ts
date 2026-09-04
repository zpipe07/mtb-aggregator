import { describe, expect, it } from "vitest";
import {
  INSTAGRAM_BIO,
  INSTAGRAM_BIO_MAX_LENGTH,
  INSTAGRAM_HANDLE,
  INSTAGRAM_LINK_IN_BIO_URL,
  INSTAGRAM_PROFILE_URL,
  LINK_IN_BIO_DESTINATIONS,
  LINK_IN_BIO_PATH,
} from "./linkInBio";

describe("link-in-bio destinations", () => {
  it("uses unique ids and public app paths", () => {
    const ids = LINK_IN_BIO_DESTINATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const dest of LINK_IN_BIO_DESTINATIONS) {
      expect(dest.href.startsWith("/")).toBe(true);
      expect(dest.href.startsWith("/admin")).toBe(false);
      expect(dest.label.length).toBeGreaterThan(0);
    }
  });

  it("covers the money pages Instagram should send people to", () => {
    const hrefs = LINK_IN_BIO_DESTINATIONS.map((d) => d.href);
    expect(hrefs).toContain("/deals");
    expect(hrefs).toContain("/deals/c/bikes/mountain");
    expect(hrefs).toContain("/deals/c/bikes/emtb");
    expect(hrefs).toContain("/deals/hub/mountain-bikes-under-3000");
    expect(hrefs).toContain("/deals/hub/emtbs-under-5000");
    expect(hrefs).toContain("/giveaways");
  });

  it("does not invent Friday Drop or blog URLs before those tickets ship", () => {
    const hrefs = LINK_IN_BIO_DESTINATIONS.map((d) => d.href).join(" ");
    expect(hrefs).not.toMatch(/blog|friday|newsletter|subscribe/i);
  });

  it("features exactly one primary destination", () => {
    expect(LINK_IN_BIO_DESTINATIONS.filter((d) => d.featured).length).toBe(1);
  });
});

describe("Instagram profile copy", () => {
  it("fits the 150-character bio limit", () => {
    expect(INSTAGRAM_BIO.length).toBeGreaterThan(0);
    expect(INSTAGRAM_BIO.length).toBeLessThanOrEqual(INSTAGRAM_BIO_MAX_LENGTH);
  });

  it("points the website field at production /links with attribution", () => {
    const url = new URL(INSTAGRAM_LINK_IN_BIO_URL);
    expect(url.origin).toBe("https://thedropper.shop");
    expect(url.pathname).toBe(LINK_IN_BIO_PATH);
    expect(url.searchParams.get("utm_source")).toBe("instagram");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_campaign")).toBe("link-in-bio");
  });

  it("uses the claimed handle", () => {
    expect(INSTAGRAM_HANDLE).toBe("@thedropper.shop");
    expect(INSTAGRAM_PROFILE_URL).toBe(
      "https://www.instagram.com/thedropper.shop/",
    );
  });
});
