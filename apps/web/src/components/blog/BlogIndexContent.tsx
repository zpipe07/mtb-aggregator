import Link from "next/link";
import { blogPostPath, formatBlogDate, type BlogPostMeta } from "@/lib/blog";
import { cn, focusRing } from "@/lib/utils";

type Props = {
  posts: BlogPostMeta[];
};

export function BlogIndexContent({ posts }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-12">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {"// field notes"}
      </p>
      <h1 className="mt-2 text-4xl font-semibold leading-[0.95] tracking-[-0.025em] text-foreground md:text-5xl">
        Blog
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
        Checklists and notes that send you into live sale inventory — not
        magazine reviews. Prices change; every deal link is current.
      </p>

      {posts.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          No posts yet. Check back after the next Friday Drop.
        </p>
      ) : (
        <ul className="mt-10 space-y-0 divide-y divide-border border-y border-border">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={blogPostPath(post.slug)}
                className={cn(
                  "block py-6 transition-colors hover:bg-muted/40",
                  focusRing,
                )}
              >
                <time
                  dateTime={post.date}
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {formatBlogDate(post.date)}
                </time>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-foreground">
                  {post.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {post.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
