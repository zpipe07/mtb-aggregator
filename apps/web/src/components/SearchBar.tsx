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
    <div className="relative w-full min-w-0 max-w-xl">
      <label htmlFor="deal-search" className="sr-only">
        Search deals
      </label>
      <span
        className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      >
        <svg
          className="size-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
      </span>
      <Input
        id="deal-search"
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        aria-label="Search deals"
        className="pl-9"
      />
    </div>
  );
}
