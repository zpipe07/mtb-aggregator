import { Button } from "./ui/button";

type ActiveFilter = {
  key: string;
  label: string;
  onRemove: () => void;
};

type FilterChipsProps = {
  filters: ActiveFilter[];
  onClearAll: () => void;
};

export function FilterChips({ filters, onClearAll }: FilterChipsProps) {
  if (filters.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {filters.map(({ key, label, onRemove }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-[var(--radius)] bg-foreground px-2.5 py-1.5 font-mono text-xs tracking-wide text-primary ring-1 ring-foreground/25"
        >
          {label}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onRemove}
            className="h-6 w-6 min-h-0 rounded-sm p-0 text-primary hover:bg-primary/15 hover:text-primary"
            aria-label={`Remove ${label} filter`}
          >
            <span className="text-base font-bold leading-none" aria-hidden>
              ×
            </span>
          </Button>
        </span>
      ))}
      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={onClearAll}
        className="h-auto p-0 font-mono text-xs font-semibold tracking-wide text-muted-foreground hover:text-foreground"
      >
        Clear all
      </Button>
    </div>
  );
}
