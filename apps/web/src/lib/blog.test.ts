import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blogPostPath,
  formatBlogDate,
  getPublishedPost,
  isValidBlogSlug,
  listPublishedPosts,
  parseBlogFrontmatter,
  splitMdxFrontmatter,
} from "./blog";

describe("isValidBlogSlug", () => {
  it("accepts kebab-case slugs", () => {
    expect(isValidBlogSlug("mtb-starter-kit")).toBe(true);
    expect(isValidBlogSlug("drops")).toBe(true);
  });

  it("rejects path traversal and uppercase", () => {
    expect(isValidBlogSlug("../secret")).toBe(false);
    expect(isValidBlogSlug("Hello")).toBe(false);
    expect(isValidBlogSlug("has_underscore")).toBe(false);
    expect(isValidBlogSlug("")).toBe(false);
  });
});

describe("splitMdxFrontmatter", () => {
  it("reads quoted fields and booleans", () => {
    const parsed = splitMdxFrontmatter(`---
title: "Starter kit"
description: 'A checklist.'
date: "2026-09-04"
draft: true
---
# Hello
`);
    expect(parsed.data).toEqual({
      title: "Starter kit",
      description: "A checklist.",
      date: "2026-09-04",
      draft: true,
    });
    expect(parsed.content.trim()).toBe("# Hello");
  });

  it("rejects files without a fence", () => {
    expect(() => splitMdxFrontmatter("# No fence")).toThrow(/frontmatter/);
  });
});

describe("parseBlogFrontmatter", () => {
  it("parses required fields", () => {
    expect(
      parseBlogFrontmatter(
        {
          title: " Starter kit ",
          description: " A checklist. ",
          date: "2026-09-04",
        },
        "mtb-starter-kit",
      ),
    ).toEqual({
      title: "Starter kit",
      description: "A checklist.",
      date: "2026-09-04",
    });
  });

  it("keeps optional updated and draft", () => {
    expect(
      parseBlogFrontmatter(
        {
          title: "T",
          description: "D",
          date: "2026-09-04",
          updated: "2026-09-05",
          draft: true,
        },
        "x",
      ),
    ).toMatchObject({ updated: "2026-09-05", draft: true });
  });

  it("rejects a missing title or bad date", () => {
    expect(() =>
      parseBlogFrontmatter({ description: "D", date: "2026-09-04" }, "x"),
    ).toThrow(/title/);
    expect(() =>
      parseBlogFrontmatter(
        { title: "T", description: "D", date: "09/04/2026" },
        "x",
      ),
    ).toThrow(/YYYY-MM-DD/);
  });
});

describe("formatBlogDate / paths", () => {
  it("formats UTC calendar dates without shifting a day", () => {
    expect(formatBlogDate("2026-09-04")).toBe("September 4, 2026");
  });

  it("builds the public path", () => {
    expect(blogPostPath("mtb-starter-kit")).toBe("/blog/mtb-starter-kit");
  });
});

describe("listPublishedPosts / getPublishedPost", () => {
  const cwdSpy = vi.spyOn(process, "cwd");

  afterEach(() => {
    cwdSpy.mockReset();
  });

  it("omits drafts and sorts newest first", () => {
    const root = mkdtempSync(join(tmpdir(), "dropper-web-"));
    const blogDir = join(root, "content", "blog");
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test temp dir
    mkdirSync(blogDir, { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test temp dir
    writeFileSync(
      join(blogDir, "older.mdx"),
      `---
title: Older
description: First
date: 2026-08-01
---
Body
`,
    );
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test temp dir
    writeFileSync(
      join(blogDir, "newer.mdx"),
      `---
title: Newer
description: Second
date: 2026-09-04
---
Body
`,
    );
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test temp dir
    writeFileSync(
      join(blogDir, "wip.mdx"),
      `---
title: Draft
description: Hidden
date: 2026-09-05
draft: true
---
Nope
`,
    );
    cwdSpy.mockReturnValue(root);

    const listed = listPublishedPosts();
    expect(listed.map((p) => p.slug)).toEqual(["newer", "older"]);
    expect(getPublishedPost("wip")).toBeNull();
    expect(getPublishedPost("newer")?.meta.title).toBe("Newer");
    expect(getPublishedPost("../etc/passwd")).toBeNull();
  });

  it("lists the shipped starter-kit post from the repo", () => {
    cwdSpy.mockRestore();
    const listed = listPublishedPosts();
    expect(listed.some((p) => p.slug === "mtb-starter-kit")).toBe(true);
    expect(getPublishedPost("mtb-starter-kit")?.meta.title).toMatch(/starter kit/i);
  });
});
