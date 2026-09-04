import fs from "node:fs";
import path from "node:path";

export type BlogFrontmatter = {
  title: string;
  description: string;
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  /** ISO date `YYYY-MM-DD` when the copy was last reviewed. */
  updated?: string;
  draft?: boolean;
};

export type BlogPostMeta = BlogFrontmatter & {
  slug: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function blogContentDir(): string {
  return path.join(process.cwd(), "content/blog");
}

export function isValidBlogSlug(slug: string): boolean {
  if (!slug || slug.length > 80) return false;
  const parts = slug.split("-");
  return parts.every((part) => part.length > 0 && /^[a-z0-9]+$/.test(part));
}

export function blogPostPath(slug: string): string {
  return `/blog/${slug}`;
}

export function formatBlogDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed);
}

/** Parse `---` YAML-ish frontmatter. Only quoted strings, bare ISO dates, and booleans. */
export function splitMdxFrontmatter(raw: string): {
  data: Record<string, unknown>;
  content: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("MDX file is missing --- frontmatter ---");
  }
  const data: Record<string, unknown> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf(":");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value === "true") data[key] = true;
    else if (value === "false") data[key] = false;
    else data[key] = value;
  }
  return { data, content: match[2] };
}

export function parseBlogFrontmatter(
  data: Record<string, unknown>,
  slug: string,
): BlogFrontmatter {
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const description =
    typeof data.description === "string" ? data.description.trim() : "";
  if (!title) {
    throw new Error(`Blog post "${slug}" is missing frontmatter title`);
  }
  if (!description) {
    throw new Error(`Blog post "${slug}" is missing frontmatter description`);
  }
  if (!isIsoDate(data.date)) {
    throw new Error(
      `Blog post "${slug}" needs a date as YYYY-MM-DD (got ${String(data.date)})`,
    );
  }
  if (data.updated != null && !isIsoDate(data.updated)) {
    throw new Error(
      `Blog post "${slug}" updated must be YYYY-MM-DD (got ${String(data.updated)})`,
    );
  }
  return {
    title,
    description,
    date: data.date,
    ...(typeof data.updated === "string" ? { updated: data.updated } : {}),
    ...(data.draft === true ? { draft: true } : {}),
  };
}

function readPostFile(slug: string): { meta: BlogPostMeta; body: string } {
  if (!isValidBlogSlug(slug)) {
    throw new Error(`Invalid blog slug: ${slug}`);
  }
  const filePath = path.join(blogContentDir(), `${slug}.mdx`);
  // Slug is allowlisted above; path is always under content/blog.
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- validated slug
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = splitMdxFrontmatter(raw);
  const frontmatter = parseBlogFrontmatter(parsed.data, slug);
  return { meta: { ...frontmatter, slug }, body: parsed.content };
}

function listMdxSlugs(): string[] {
  const dir = blogContentDir();
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- content/blog only
  if (!fs.existsSync(dir)) return [];
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- content/blog only
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => name.slice(0, -4))
    .filter(isValidBlogSlug);
}

/** Published posts, newest first. Drafts are omitted. */
export function listPublishedPosts(): BlogPostMeta[] {
  const posts: BlogPostMeta[] = [];
  for (const slug of listMdxSlugs()) {
    const { meta } = readPostFile(slug);
    if (meta.draft) continue;
    posts.push(meta);
  }
  return posts.toSorted((a, b) => {
    if (a.date === b.date) return a.slug.localeCompare(b.slug);
    return a.date < b.date ? 1 : -1;
  });
}

export function getPublishedPost(
  slug: string,
): { meta: BlogPostMeta; body: string } | null {
  if (!isValidBlogSlug(slug)) return null;
  const filePath = path.join(blogContentDir(), `${slug}.mdx`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- validated slug
  if (!fs.existsSync(filePath)) return null;
  const post = readPostFile(slug);
  if (post.meta.draft) return null;
  return post;
}
