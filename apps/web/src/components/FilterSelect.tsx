import * as React from "react";
import { Select } from "./ui/select";

type FilterSelectProps<T extends string> = {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  /** Optional stable id for the select (e.g. tests); defaults to React `useId()`. */
  controlId?: string;
};

export function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  controlId,
}: FilterSelectProps<T>) {
  const generatedId = React.useId();
  const selectId = controlId ?? generatedId;

  return (
    <div>
      <label htmlFor={selectId} className="block text-sm font-medium text-muted-foreground mb-1">
        {label}
      </label>
      <Select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
