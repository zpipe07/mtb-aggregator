import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
        className={cn(
          "peer relative flex size-[18px] shrink-0 items-center justify-center rounded-[2px] border-2 border-foreground bg-transparent transition-[box-shadow,color] outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30 dark:aria-invalid:border-destructive/50 data-checked:border-foreground data-checked:bg-primary",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
          className,
        )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <span className="block size-2 shrink-0 rounded-[1px] bg-foreground" aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
