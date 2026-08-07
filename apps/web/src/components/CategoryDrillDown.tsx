import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

type TreeNode = {
  path: string;
  label: string;
  slug?: string;
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
    const segments = path
      .split(" > ")
      .map((s) => s.trim())
      .filter(Boolean);
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
      entry.node.isSelectable =
        entry.node.isSelectable || pathSet.has(fullPath);

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

const ROW_CLASS = "min-h-[44px] flex items-center";

type CategoryDrillDownProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  className?: string;
};

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}

function TreeNodeRow({
  node,
  depth,
  expanded,
  value,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  value: string;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const hasChildren = node.children.length > 0;
  const isSelected = value === node.path;
  const isSelectable = node.isSelectable;

  return (
    <div className="group">
      <div
        className={`flex items-center gap-2 rounded-lg ${isSelected ? "bg-secondary" : ""}`}
        style={{ paddingLeft: `${depth * 12 + 10}px` }}
      >
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="-m-2 text-muted-foreground hover:text-foreground rounded-full"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <ChevronIcon expanded={expanded} />
          </Button>
        ) : (
          <span className="w-6 shrink-0" aria-hidden />
        )}
        {isSelectable ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onSelect}
            className={`flex-1 justify-start h-auto min-h-[44px] py-2 px-3 rounded-lg font-normal ${isSelected ? "font-medium bg-secondary text-secondary-foreground hover:bg-secondary/90 text-text-foreground" : "text-muted-foreground"}`}
            disabled={isSelected}
            aria-disabled={isSelected}
          >
            {node.label}
          </Button>
        ) : (
          <span className="flex-1 py-2 pr-2 min-h-[44px] flex items-center text-muted-foreground">
            {node.label}
          </span>
        )}
      </div>
    </div>
  );
}

export function CategoryDrillDown({
  label,
  value,
  onChange,
  options,
  className = "",
}: CategoryDrillDownProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    if (!value) return new Set();
    const segments = value.split(" > ");
    const paths = new Set<string>();
    for (let i = 1; i < segments.length; i++) {
      paths.add(segments.slice(0, i).join(" > "));
    }
    return paths;
  });

  const tree = buildTree(options);

  const handleSelect = useCallback(
    (path: string) => {
      onChange(path);
    },
    [onChange],
  );

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  function renderNode(node: TreeNode, depth: number) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedPaths.has(node.path);

    return (
      <div key={node.path} className="space-y-0.5">
        <TreeNodeRow
          node={node}
          depth={depth}
          expanded={isExpanded}
          value={value}
          onToggle={() => toggleExpanded(node.path)}
          onSelect={() => handleSelect(node.path)}
        />
        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <fieldset className={cn("border-0 p-0 m-0 min-w-0", className)}>
      <legend className="block w-full px-0 text-sm font-medium text-muted-foreground mb-1">
        {label}
      </legend>
      <div className="space-y-0.5">
        <Button
          type="button"
          variant="ghost"
          onClick={() => handleSelect("")}
          className={`w-full ${ROW_CLASS} justify-start px-3 py-2.5 rounded-lg font-normal ${!value ? "font-medium bg-secondary text-secondary-foreground hover:bg-secondary/90" : "text-muted-foreground"}`}
        >
          All categories
        </Button>
        <div className="space-y-0.5">
          {tree.map((node) => renderNode(node, 0))}
        </div>
      </div>
    </fieldset>
  );
}
