import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { BlogIndexContent } from "@/components/blog/BlogIndexContent";
import { blogPostPath, listPublishedPosts } from "@/lib/blog";
import { buildBlogIndexJsonLd } from "@/lib/jsonLd";
import { absoluteUrl } from "@/lib/siteUrl";

/** 4h — deal embeds on posts refresh with listing ISR. Literal required by Next.js. */
export const revalidate = 14400;

const pageDescription =
  "Checklists and notes from The Dropper that point at live mountain bike sale inventory — starter kits, not magazine reviews.";

export const metadata: Metadata = {
  title: "Blog",
  description: pageDescription,
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog | The Dropper",
    description: pageDescription,
    url: absoluteUrl("/blog"),
  },
  twitter: {
    title: "Blog | The Dropper",
    description: pageDescription,
  },
};

export default function BlogIndexPage() {
  const posts = listPublishedPosts();

  return (
    <>
      <JsonLd
        data={buildBlogIndexJsonLd({
          name: "The Dropper blog",
          description: pageDescription,
          pageUrl: absoluteUrl("/blog"),
          posts: posts.map((p) => ({
            slug: p.slug,
            title: p.title,
            path: blogPostPath(p.slug),
          })),
        })}
      />
      <BlogIndexContent posts={posts} />
    </>
  );
}
