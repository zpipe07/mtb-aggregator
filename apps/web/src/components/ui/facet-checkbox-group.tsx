import { cn } from "@/lib/utils";
import { sanitizeForHtmlId } from "@/lib/htmlId";

export type FacetCheckboxOption = { value: string; count: number };

export type FacetCheckboxGroupProps = {
  /** Accessible group name / prefix for input ids */
  name: string;
  legend: string;
  selected: string[];
  options: FacetCheckboxOption[];
  onToggle: (value: string) => void;
  className?: string;
};

/**
 * Inline checkbox list for facet filters (OR within group).
 * Long lists: consider searchable combobox + truncation in a follow-up.
 */
export function FacetCheckboxGroup({
  name,
  legend,
  selected,
  options,
  onToggle,
  className,
}: FacetCheckboxGroupProps) {
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
          return (
            <label
              key={`${name}-${opt.value}`}
              htmlFor={id}
              className="flex cursor-pointer items-start gap-2 rounded-md py-0.5 pr-1 text-sm hover:bg-muted/50"
            >
              <input
                id={id}
                type="checkbox"
                name={name}
                checked={checked}
                onChange={() => onToggle(opt.value)}
                className={cn(
                  "mt-0.5 size-4 shrink-0 rounded border border-input bg-background accent-primary",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              />
              <span className="min-w-0 flex-1 leading-snug text-foreground">
                {opt.value}{" "}
                <span className="tabular-nums text-muted-foreground">
                  ({opt.count})
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
