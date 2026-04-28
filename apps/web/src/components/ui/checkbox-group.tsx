"use client";

import { cn } from "@/lib/utils";
import { sanitizeForHtmlId } from "@/lib/htmlId";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type CheckboxGroupOption = {
  value: string;
  /** Optional count shown as (n) after the value, e.g. facet hit counts */
  count?: number;
};

export type CheckboxGroupProps = {
  /** Prefix for stable input ids (with option value) */
  name: string;
  legend: string;
  selected: string[];
  options: CheckboxGroupOption[];
  onToggle: (value: string) => void;
  className?: string;
};

/**
 * Multi-select checkbox list in a fieldset (OR within group).
 * Composes shadcn Checkbox + Label. For long lists, consider a searchable combobox + truncation (follow-up).
 */
export function CheckboxGroup({
  name,
  legend,
  selected,
  options,
  onToggle,
  className,
}: CheckboxGroupProps) {
  const selectedSet = new Set(selected);
  const safeName = sanitizeForHtmlId(name);

  return (
    <fieldset className={cn("space-y-2", className)}>
      <legend className="mb-1.5 block text-sm font-medium text-muted-foreground">
        {legend}
      </legend>
      <div
        className="max-h-64 space-y-1 overflow-y-auto pr-1 -mr-1"
        role="group"
        aria-label={legend}
      >
        {options.map((opt) => {
          const id = `${safeName}-${sanitizeForHtmlId(opt.value)}`;
          const checked = selectedSet.has(opt.value);
          const showCount = typeof opt.count === "number";
          return (
            <div
              key={`${name}-${opt.value}`}
              className="flex items-start gap-2 rounded-md py-0.5 pr-1 text-sm hover:bg-muted/50"
            >
              <Checkbox
                id={id}
                name={name}
                checked={checked}
                onCheckedChange={() => onToggle(opt.value)}
                className="mt-0.5"
              />
              <Label
                htmlFor={id}
                className="min-w-0 flex-1 cursor-pointer font-normal leading-snug text-foreground"
              >
                {opt.value}
                {showCount ? (
                  <>
                    {" "}
                    <span className="tabular-nums text-muted-foreground">
                      ({opt.count})
                    </span>
                  </>
                ) : null}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
