import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { DealEmbed } from "@/components/blog/DealEmbed";
import { cn, focusRing } from "@/lib/utils";

const proseLink =
  "font-medium text-foreground underline decoration-primary/70 underline-offset-4 hover:decoration-primary";

function MdxLink({
  href,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"a">) {
  const dest = href ?? "";
  if (dest.startsWith("/") && !dest.startsWith("//")) {
    return (
      <Link href={dest} className={cn(proseLink, focusRing, className)}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={dest}
      className={cn(proseLink, focusRing, className)}
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  );
}

export const blogMdxComponents = {
  DealEmbed,
  a: MdxLink,
  h2: ({ className, ...props }: ComponentPropsWithoutRef<"h2">) => (
    <h2
      className={cn(
        "mt-10 scroll-mt-24 text-2xl font-semibold tracking-[-0.02em] text-foreground first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }: ComponentPropsWithoutRef<"h3">) => (
    <h3
      className={cn(
        "mt-8 scroll-mt-24 text-xl font-semibold tracking-[-0.02em] text-foreground",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }: ComponentPropsWithoutRef<"p">) => (
    <p
      className={cn("mt-4 text-base leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }: ComponentPropsWithoutRef<"ul">) => (
    <ul
      className={cn(
        "mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }: ComponentPropsWithoutRef<"ol">) => (
    <ol
      className={cn(
        "mt-4 list-decimal space-y-2 pl-5 text-base leading-relaxed text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }: ComponentPropsWithoutRef<"li">) => (
    <li className={cn("pl-1", className)} {...props} />
  ),
  strong: ({ className, ...props }: ComponentPropsWithoutRef<"strong">) => (
    <strong className={cn("font-semibold text-foreground", className)} {...props} />
  ),
  blockquote: ({
    className,
    ...props
  }: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className={cn(
        "mt-6 border-l-2 border-primary pl-4 text-base leading-relaxed text-foreground",
        className,
      )}
      {...props}
    />
  ),
};
