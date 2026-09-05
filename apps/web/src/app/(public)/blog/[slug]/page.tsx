import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { BlogPostViewed } from "@/components/blog/BlogPostViewed";
import {
  blogPostPath,
  formatBlogDate,
  getPublishedPost,
  listPublishedPosts,
} from "@/lib/blog";
import { compileBlogMdx } from "@/lib/compileBlogMdx";
import { buildBlogPostingJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonLd";
import { absoluteUrl } from "@/lib/siteUrl";
import { cn, focusRing } from "@/lib/utils";

/** 4h — live deal embeds refresh with listing ISR. Literal required by Next.js. */
export const revalidate = 14400;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return listPublishedPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPublishedPost(slug);
  if (!post) {
    return { title: "Post not found", robots: { index: false, follow: true } };
  }
  const path = blogPostPath(post.meta.slug);
  return {
    title: post.meta.title,
    description: post.meta.description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: `${post.meta.title} | The Dropper`,
      description: post.meta.description,
      url: absoluteUrl(path),
      publishedTime: `${post.meta.date}T00:00:00.000Z`,
      modifiedTime: `${post.meta.updated ?? post.meta.date}T00:00:00.000Z`,
    },
    twitter: {
      title: `${post.meta.title} | The Dropper`,
      description: post.meta.description,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPublishedPost(slug);
  if (!post) notFound();

  const content = await compileBlogMdx(post.body);
  const path = blogPostPath(post.meta.slug);
  const pageUrl = absoluteUrl(path);
  const reviewed = post.meta.updated ?? post.meta.date;

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: post.meta.title, path },
        ])}
      />
      <JsonLd
        data={buildBlogPostingJsonLd({
          title: post.meta.title,
          description: post.meta.description,
          pageUrl,
          datePublished: `${post.meta.date}T00:00:00.000Z`,
          dateModified: `${reviewed}T00:00:00.000Z`,
        })}
      />
      <BlogPostViewed slug={post.meta.slug} />
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-12">
        <nav aria-label="Breadcrumb" className="mb-6">
          <Link
            href="/blog"
            className={cn(
              "font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground",
              focusRing,
            )}
          >
            ← Blog
          </Link>
        </nav>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {"// field notes"}
        </p>
        <h1 className="mt-2 text-4xl font-semibold leading-[0.95] tracking-[-0.025em] text-foreground md:text-5xl">
          {post.meta.title}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          <time dateTime={post.meta.date}>{formatBlogDate(post.meta.date)}</time>
          {post.meta.updated && post.meta.updated !== post.meta.date ? (
            <>
              {" "}
              · Updated{" "}
              <time dateTime={post.meta.updated}>
                {formatBlogDate(post.meta.updated)}
              </time>
            </>
          ) : null}
          {" · "}
          Prices as of {formatBlogDate(reviewed)} — confirm on the retailer
          before you buy.
        </p>
        <div className="mt-8">{content}</div>
      </article>
    </>
  );
}
