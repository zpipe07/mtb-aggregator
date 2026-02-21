type FilterInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
};

export function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
}: FilterInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-600 mb-1">
        {label}
      </label>
      <input
        type="number"
        min={min}
        max={max}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-stone-300 px-3 py-2 bg-white text-stone-800 w-24"
      />
    </div>
  );
}
