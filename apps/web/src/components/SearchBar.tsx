import { track } from "@vercel/analytics";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative w-full min-w-0 max-w-xl">
      <label
        htmlFor="deal-search"
        className={cn(
          "group flex w-full cursor-text items-center gap-3 bg-card",
          "border-y border-foreground px-3 py-3",
          "transition-[border-bottom-width] duration-200",
          "focus-within:border-b-2 focus-within:border-b-primary",
        )}
      >
        <span className="sr-only">Search deals</span>
        <span
          aria-hidden
          className="translate-y-px text-base text-foreground"
        >
          ⌕
        </span>
        <input
          ref={inputRef}
          id="deal-search"
          type="search"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "min-h-0 flex-1 border-0 bg-transparent p-0 font-mono text-sm text-foreground outline-none",
            "placeholder:text-muted-foreground",
          )}
        />
        <span
          className={cn(
            "shrink-0 rounded-sm border border-border bg-secondary",
            "px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
            "hidden sm:inline",
          )}
          aria-hidden
        >
          ⌘ K
        </span>
      </label>
    </div>
  );
}
