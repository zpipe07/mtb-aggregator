import { track } from "@vercel/analytics";
import { useEffect, useRef, useState } from "react";
import { cn, focusRingWithin } from "@/lib/utils";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

/** Framed control only; excludes the `// search` label. Use to align adjacent controls (e.g. home hero buttons). */
export const SEARCH_FRAME_MIN_H = "min-h-[3.25rem]";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
};

/** Search field with a visible `// search` label; both label lines associate with the input (valid duplicate labels). */
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
      <div className="flex flex-col gap-1">
        <label
          htmlFor="deal-search"
          className={cn(monoMicro, "w-fit cursor-pointer text-foreground")}
        >
          {"// search"}
        </label>
        <label
          htmlFor="deal-search"
          className={cn(
            "group flex w-full cursor-text items-center gap-3 rounded-sm bg-card",
            SEARCH_FRAME_MIN_H,
            "border-t border-b border-foreground px-3 py-3",
            focusRingWithin,
          )}
        >
          <span aria-hidden className="translate-y-px text-base text-foreground">
            ⌕
          </span>
          <input
            ref={inputRef}
            id="deal-search"
            type="search"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
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
    </div>
  );
}
