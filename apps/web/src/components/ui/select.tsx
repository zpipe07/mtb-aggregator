import * as React from "react";

import { cn, focusRingWithin } from "@/lib/utils";

export type SelectProps = React.ComponentProps<"select"> & {
  /** Classes for the outer open-frame wrapper (e.g. min-width). */
  wrapperClassName?: string;
};

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, wrapperClassName, ...props },
  ref,
) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-sm border-t border-b border-foreground/60 bg-card px-3 py-2",
        focusRingWithin,
        wrapperClassName,
      )}
    >
      <select
        ref={ref}
        data-slot="select"
        className={cn(
          "min-h-0 min-w-0 flex-1 cursor-pointer appearance-none border-0 bg-transparent py-0.5",
          "font-mono text-sm text-foreground outline-none",
          "focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <span
        aria-hidden
        className="pointer-events-none shrink-0 font-mono text-foreground"
      >
        ▾
      </span>
    </div>
  );
});

export { Select };
