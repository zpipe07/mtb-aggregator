type FilterChipsProps<T extends string> = {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: FilterChipsProps<T>) {
  return (
    <div>
      <span className="block text-sm font-medium text-stone-600 mb-1.5">{label}</span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange("" as T)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            value === ""
              ? "bg-stone-700 text-white"
              : "bg-stone-200 text-stone-700 hover:bg-stone-300"
          }`}
        >
          All
        </button>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              value === opt.value
                ? "bg-stone-700 text-white"
                : "bg-stone-200 text-stone-700 hover:bg-stone-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
