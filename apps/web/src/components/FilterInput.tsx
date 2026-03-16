import { Input } from "./ui/input";

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
      <label className="block text-sm font-medium text-muted-foreground mb-1">
        {label}
      </label>
      <Input
        type="number"
        min={min}
        max={max}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24"
      />
    </div>
  );
}
