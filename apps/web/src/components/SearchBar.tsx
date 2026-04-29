import { track } from "@vercel/analytics";
import { useEffect, useRef, useState } from "react";
import { Input } from "./ui/input";
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
      <label htmlFor="deal-search" className="sr-only">
        Search deals
      </label>
      <div
        className={cn(
          "flex h-11 w-full items-center gap-2 border-t border-b-2 border-foreground bg-background transition-colors",
          "focus-within:border-b-primary",
        )}
      >
        <span
          className="pl-1 font-mono text-base text-muted-foreground sm:pl-2"
          aria-hidden
        >
          ⌕
        </span>
        <Input
          ref={inputRef}
          id="deal-search"
          type="search"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder={placeholder}
          className="min-h-10 flex-1 rounded-none border-0 bg-transparent px-0 py-2 shadow-none focus-visible:ring-0 md:text-sm"
        />
        <kbd className="mr-2 hidden shrink-0 rounded border border-border bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground sm:inline">
          ⌘ K
        </kbd>
      </div>
    </div>
  );
}
