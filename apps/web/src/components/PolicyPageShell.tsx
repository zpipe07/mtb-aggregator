import type { ReactNode } from "react";
import Link from "next/link";
import { cn, focusRing } from "@/lib/utils";

const sectionHeading =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground";

type Props = {
  title: string;
  kicker?: string;
  children: ReactNode;
};

export function PolicyPageShell({
  title,
  kicker = "// policies",
  children,
}: Props) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-12">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {kicker}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

export function PolicySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className={sectionHeading}>{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function PolicyInlineLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "font-medium text-foreground underline-offset-4 hover:underline",
        focusRing,
      )}
    >
      {children}
    </Link>
  );
}
