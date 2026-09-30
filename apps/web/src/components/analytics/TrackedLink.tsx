"use client";

import type { VariantProps } from "class-variance-authority";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  handleTrackedClick,
  type TrackedClickOptions,
} from "./trackedClick";

export type TrackedLinkProps = Omit<
  React.ComponentProps<typeof Link>,
  "onClick"
> &
  TrackedClickOptions;

export function TrackedLink({
  event,
  properties,
  vercelEvent,
  vercelProperties,
  persistBackHref,
  onNavigate,
  stopClickPropagation,
  children,
  ...rest
}: TrackedLinkProps) {
  return (
    <Link
      {...rest}
      onClick={(e) =>
        handleTrackedClick(e, {
          event,
          properties,
          vercelEvent,
          vercelProperties,
          persistBackHref,
          onNavigate,
          stopClickPropagation,
        })
      }
    >
      {children}
    </Link>
  );
}

type TrackedButtonLinkProps = TrackedLinkProps &
  VariantProps<typeof buttonVariants> & {
    buttonClassName?: string;
  };

/** Button + internal `TrackedLink` so RSC cards never import `Button`. */
export function TrackedButtonLink({
  size,
  variant,
  buttonClassName,
  ...linkProps
}: TrackedButtonLinkProps) {
  return (
    <Button asChild size={size} variant={variant} className={buttonClassName}>
      <TrackedLink {...linkProps} />
    </Button>
  );
}
