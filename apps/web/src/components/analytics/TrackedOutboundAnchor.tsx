"use client";

import type { VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  handleTrackedClick,
  type TrackedClickOptions,
} from "./trackedClick";

export type TrackedOutboundAnchorProps = Omit<
  React.ComponentProps<"a">,
  "onClick" | "href"
> &
  TrackedClickOptions & {
    href: string;
  };

export function TrackedOutboundAnchor({
  href,
  target = "_blank",
  rel = "noopener noreferrer",
  event,
  properties,
  vercelEvent,
  vercelProperties,
  persistBackHref,
  onNavigate,
  stopClickPropagation,
  children,
  ...rest
}: TrackedOutboundAnchorProps) {
  return (
    <a
      href={href}
      target={target}
      rel={rel}
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
    </a>
  );
}

type TrackedOutboundButtonProps = TrackedOutboundAnchorProps &
  VariantProps<typeof buttonVariants> & {
    buttonClassName?: string;
  };

/** Button + outbound anchor so RSC cards never import `Button`. */
export function TrackedOutboundButton({
  size,
  variant,
  buttonClassName,
  ...anchorProps
}: TrackedOutboundButtonProps) {
  return (
    <Button asChild size={size} variant={variant} className={buttonClassName}>
      <TrackedOutboundAnchor {...anchorProps} />
    </Button>
  );
}
