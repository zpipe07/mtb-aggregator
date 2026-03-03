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
          className="inline-flex items-center gap-1.5 rounded-full bg-stone-200 text-stone-800 text-sm py-1.5 pl-3 pr-1"
        >
          {label}
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded-full hover:bg-stone-300 transition-colors"
            aria-label={`Remove ${label} filter`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-sm font-medium text-stone-600 hover:text-stone-900 underline"
      >
        Clear all
      </button>
    </div>
  );
}
