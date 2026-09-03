/**
 * CategoryPicker – single-select category path from the admin category tree.
 * Outputs string[] (path of names from root to selected node).
 */
"use client";

import { useState, useRef, useEffect } from "react";
import { useAdminCategoryTree } from "./hooks/queries";
import type { AdminCategoryTreeNode } from "./api";

const PATH_DELIMITER = "\u0000"; // internal delimiter unlikely in category names

function flattenTreeToPaths(
  nodes: AdminCategoryTreeNode[],
  parentPath: string[] = []
): { path: string[]; label: string; value: string }[] {
  const result: { path: string[]; label: string; value: string }[] = [];
  for (const node of nodes) {
    const path = [...parentPath, node.name];
    const label = path.join(" > ");
    const value = path.join(PATH_DELIMITER);
    result.push({ path, label, value });
    if (node.children?.length) {
      result.push(
        ...flattenTreeToPaths(node.children, path)
      );
    }
  }
  return result;
}

export function CategoryPicker({
  value,
  onChange,
  id,
  label = "Category",
  placeholder = "Select category…",
}: {
  value: string[];
  onChange: (path: string[]) => void;
  id?: string;
  label?: string;
  placeholder?: string;
}) {
  const { data: tree, isLoading } = useAdminCategoryTree();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = tree ? flattenTreeToPaths(tree) : [];
  const displayValue = value.length > 0 ? value.join(" > ") : "";
  const selectedValue = value.length > 0 ? value.join(PATH_DELIMITER) : "";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-stone-700 mb-1">
          {label}
        </label>
      )}
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded border border-stone-300 px-3 py-2 text-left text-sm text-stone-900 bg-white hover:bg-stone-50 flex items-center justify-between gap-2"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={displayValue ? "" : "text-stone-400"}>
          {displayValue || placeholder}
        </span>
        <span className="text-stone-400 shrink-0" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded border border-stone-200 bg-white shadow-lg py-1"
        >
          {isLoading ? (
            <li className="px-3 py-2 text-sm text-stone-500">Loading…</li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-stone-500">No categories</li>
          ) : (
            options.map((opt) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={opt.value === selectedValue}
                onClick={() => {
                  onChange(opt.path);
                  setOpen(false);
                }}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  opt.value === selectedValue
                    ? "bg-stone-200 text-stone-900 font-medium"
                    : "text-stone-700 hover:bg-stone-100"
                }`}
              >
                {opt.label}
              </li>
            )))
          }
        </ul>
      )}
    </div>
  );
}

/** CategoryMultiPicker – multi-select category paths. Outputs string[][]. */
export function CategoryMultiPicker({
  value,
  onChange,
  id,
  label = "Categories",
  placeholder = "Add category…",
  helpText,
}: {
  value: string[][];
  onChange: (paths: string[][]) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  helpText?: string;
}) {
  const { data: tree, isLoading } = useAdminCategoryTree();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = tree ? flattenTreeToPaths(tree) : [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  function pathKey(path: string[]) {
    return path.join(PATH_DELIMITER);
  }

  function handleAdd(path: string[]) {
    const key = pathKey(path);
    if (value.some((p) => pathKey(p) === key)) return;
    onChange([...value, path]);
    setOpen(false);
  }

  function handleRemove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div ref={containerRef}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-stone-700 mb-1">
          {label}
        </label>
      )}
      {helpText && (
        <p className="mb-2 text-xs text-stone-500">{helpText}</p>
      )}
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((path, i) => (
          <span
            key={pathKey(path) + i}
            className="inline-flex items-center gap-1 rounded bg-stone-200 px-2 py-1 text-sm text-stone-800"
          >
            {path.join(" > ")}
            <button
              type="button"
              onClick={() => handleRemove(i)}
              className="text-stone-500 hover:text-stone-800 leading-none"
              aria-label={`Remove ${path.join(" > ")}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <button
          type="button"
          id={id}
          onClick={() => setOpen((o) => !o)}
          className="rounded border border-stone-300 px-3 py-2 text-left text-sm text-stone-600 bg-white hover:bg-stone-50"
        >
          {open ? "▼" : "+ "}{placeholder}
        </button>
        {open && (
          <ul
            role="listbox"
            className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded border border-stone-200 bg-white shadow-lg py-1"
          >
            {isLoading ? (
              <li className="px-3 py-2 text-sm text-stone-500">Loading…</li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-stone-500">No categories</li>
            ) : (
              options.map((opt) => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={value.some((p) => pathKey(p) === opt.value)}
                  onClick={() => handleAdd(opt.path)}
                  className="px-3 py-2 text-sm cursor-pointer text-stone-700 hover:bg-stone-100"
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
