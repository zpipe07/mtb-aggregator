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
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {filters.map(({ key, label, onRemove }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1.5 rounded-full bg-trail/20 text-foreground text-sm py-1.5 pl-3 pr-1 ring-1 ring-trail/35"
        >
          {label}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onRemove}
            className="p-1 rounded-full hover:bg-trail/35 h-auto w-auto"
            aria-label={`Remove ${label} filter`}
          >
            <svg
              className="size-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </Button>
        </span>
      ))}
      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={onClearAll}
        className="h-auto p-0 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Clear all
      </Button>
    </div>
  );
}
