import { track } from "@vercel/analytics";
import { useEffect, useState } from "react";
import { Input } from "./ui/input";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
};

export function SearchBar({
  value,
  onChange,
  placeholder = "Search deals…",
  debounceMs = 300,
}: SearchBarProps) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) {
        if (local.trim()) track("search", { query: local.trim() });
        onChange(local);
      }
    }, debounceMs);
    return () => clearTimeout(t);
  }, [local, debounceMs, onChange, value]);

  return (
    <div className="w-full min-w-0 max-w-xl">
      <label htmlFor="deal-search" className="sr-only">
        Search deals
      </label>
      <Input
        id="deal-search"
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        aria-label="Search deals"
      />
    </div>
  );
}
