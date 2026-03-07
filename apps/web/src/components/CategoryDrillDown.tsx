import { useRef, useState, useCallback, useEffect } from "react";

type TreeNode = {
  path: string;
  label: string;
  children: TreeNode[];
  isSelectable: boolean;
};

const TOP_ORDER = ["Bikes", "Components", "Gear", "Accessories", "Other"];

/** Parse flat "Parent > Child > Grandchild" paths into a tree. */
function buildTree(paths: string[]): TreeNode[] {
  type Entry = { node: TreeNode; children: Map<string, Entry> };
  const root = new Map<string, Entry>();
  const pathSet = new Set(paths);

  for (const path of paths) {
    const segments = path.split(" > ").map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) continue;

    let current = root;
    let parentPath = "";

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const fullPath = parentPath ? `${parentPath} > ${segment}` : segment;

      if (!current.has(segment)) {
        current.set(segment, {
          node: {
            path: fullPath,
            label: segment,
            children: [],
            isSelectable: pathSet.has(fullPath),
          },
          children: new Map(),
        });
      }

      const entry = current.get(segment)!;
      entry.node.isSelectable = entry.node.isSelectable || pathSet.has(fullPath);

      parentPath = fullPath;
      current = entry.children;
    }
  }

  function toArray(map: Map<string, Entry>): TreeNode[] {
    const ordered = [
      ...TOP_ORDER.filter((k) => map.has(k)),
      ...[...map.keys()].filter((k) => !TOP_ORDER.includes(k)),
    ];
    return ordered.map((k) => {
      const entry = map.get(k)!;
      entry.node.children = toArray(entry.children);
      return entry.node;
    });
  }

  return toArray(root);
}

/** Get the node at the given breadcrumb path, or root children if breadcrumb is empty. */
function getChildrenAt(tree: TreeNode[], breadcrumb: string[]): TreeNode[] {
  if (breadcrumb.length === 0) return tree;

  let current: TreeNode[] = tree;
  for (const segment of breadcrumb) {
    const node = current.find((n) => n.label === segment);
    if (!node) return [];
    current = node.children;
  }
  return current;
}

/** Get the full path string for the current breadcrumb. */
function getPathAt(breadcrumb: string[]): string {
  if (breadcrumb.length === 0) return "";
  return breadcrumb.join(" > ");
}

type CategoryDrillDownProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  className?: string;
};

export function CategoryDrillDown({
  label,
  value,
  onChange,
  options,
  className = "",
}: CategoryDrillDownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [breadcrumb, setBreadcrumb] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const tree = buildTree(options);
  const currentChildren = getChildrenAt(tree, breadcrumb);
  const currentPath = getPathAt(breadcrumb);
  const isCurrentPathSelectable = currentPath !== "" && options.includes(currentPath);

  const displayLabel = value
    ? (value.split(" > ").pop() ?? value)
    : "All categories";

  const handleSelect = useCallback(
    (path: string) => {
      onChange(path);
      setIsOpen(false);
      setBreadcrumb([]);
    },
    [onChange]
  );

  const handleDrill = useCallback((segment: string) => {
    setBreadcrumb((prev) => [...prev, segment]);
  }, []);

  const handleBack = useCallback(() => {
    setBreadcrumb((prev) => prev.slice(0, -1));
  }, []);

  const handleOpen = useCallback(() => {
    const willOpen = !isOpen;
    if (willOpen) {
      if (value) {
        const segments = value.split(" > ");
        setBreadcrumb(segments.slice(0, -1));
      } else {
        setBreadcrumb([]);
      }
    }
    setIsOpen(willOpen);
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setBreadcrumb([]);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setBreadcrumb([]);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} className={className}>
      <label className="block text-sm font-medium text-stone-600 mb-1">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={handleOpen}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 bg-white text-stone-800 text-left flex items-center justify-between gap-2"
        >
          <span>{displayLabel}</span>
          <svg
            className={`w-4 h-4 text-stone-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <div
            role="listbox"
            className="absolute z-50 mt-1 w-full min-w-[200px] max-h-80 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg py-2"
          >
            <button
              type="button"
              onClick={() => handleSelect("")}
              className={`w-full text-left px-3 py-2 mx-2 rounded-lg transition-colors ${!value ? "bg-stone-100 font-medium text-stone-900" : "text-stone-700 hover:bg-stone-50"}`}
            >
              All categories
            </button>

            {breadcrumb.length > 0 && (
              <div className="flex items-center gap-1 px-3 py-2 mx-2 mt-1 border-t border-stone-100">
                <button
                  type="button"
                  onClick={handleBack}
                  className="p-1.5 -m-1.5 rounded text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                  aria-label="Go back"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm text-stone-600 truncate flex-1">
                  {breadcrumb.join(" › ")}
                </span>
                {isCurrentPathSelectable && (
                  <button
                    type="button"
                    onClick={() => handleSelect(currentPath)}
                    className="text-sm font-medium text-stone-700 hover:text-stone-900 shrink-0"
                  >
                    Select
                  </button>
                )}
              </div>
            )}

            <div className="mt-1 px-2 space-y-0.5">
              {currentChildren.map((node) => {
                const hasChildren = node.children.length > 0;
                if (hasChildren) {
                  return (
                    <div
                      key={node.path}
                      className="flex items-center gap-1 rounded-lg group"
                    >
                      <button
                        type="button"
                        onClick={() => handleDrill(node.label)}
                        className={`flex-1 text-left px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${value === node.path ? "bg-stone-100 font-medium text-stone-900" : "text-stone-700 hover:bg-stone-50"}`}
                      >
                        <span>{node.label}</span>
                        <svg
                          className="w-4 h-4 text-stone-400 shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      {node.isSelectable && (
                        <button
                          type="button"
                          onClick={() => handleSelect(node.path)}
                          className="px-2 py-1.5 text-sm text-stone-500 hover:text-stone-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Select
                        </button>
                      )}
                    </div>
                  );
                }
                return (
                  <button
                    key={node.path}
                    type="button"
                    onClick={() => handleSelect(node.path)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${value === node.path ? "bg-stone-100 font-medium text-stone-900" : "text-stone-700 hover:bg-stone-50"}`}
                  >
                    {node.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
