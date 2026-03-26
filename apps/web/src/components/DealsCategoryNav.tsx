"use client";

import type { CategoryTreeNode } from "../api";
import {
  findCategoryWithAncestors,
  getBrowseChipNodes,
} from "../lib/categoryTree";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { cn } from "@/lib/utils";

export type CategoryNavSource = "breadcrumb" | "chip" | "all_clear";

type DealsCategoryNavProps = {
  categoryTree: CategoryTreeNode[];
  categoryFilter: string;
  onCategoryChange: (slug: string, source: CategoryNavSource) => void;
};

function BreadcrumbSep() {
  return (
    <span className="text-muted-foreground select-none" aria-hidden>
      ›
    </span>
  );
}

export function DealsCategoryNav({
  categoryTree,
  categoryFilter,
  onCategoryChange,
}: DealsCategoryNavProps) {
  if (!categoryTree.length) return null;

  const resolved = categoryFilter
    ? findCategoryWithAncestors(categoryTree, categoryFilter)
    : null;
  const { nodes: chips, mode: chipMode } = getBrowseChipNodes(
    categoryTree,
    categoryFilter,
  );
  const chipSectionLabel =
    chipMode === "roots"
      ? "Browse by type"
      : chipMode === "children"
        ? "Subcategories"
        : "Related categories";

  return (
    <nav aria-label="Category" className="mb-4">
      <Card
        // size="sm"
        className="gap-1 py-2"
      >
        <CardHeader className="px-4 pb-0 pt-0">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Category
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-1 pt-0">
          {!categoryFilter ? (
            <p className="text-sm font-medium text-foreground min-h-9 flex items-center">
              All deals
            </p>
          ) : (
            <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
              <li className="flex min-h-9 items-center">
                <Button
                  type="button"
                  variant="link"
                  className="h-auto min-h-9 px-0 py-1 text-primary underline-offset-4 hover:underline border-none"
                  onClick={() => onCategoryChange("", "all_clear")}
                >
                  All deals
                </Button>
              </li>
              {resolved ? (
                <>
                  {resolved.ancestors.map((node) => (
                    <li
                      key={node.slug}
                      className="flex min-h-9 items-center gap-1.5"
                    >
                      <BreadcrumbSep />
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto min-h-9 px-0 py-1 text-primary underline-offset-4 hover:underline"
                        onClick={() =>
                          onCategoryChange(node.slug, "breadcrumb")
                        }
                      >
                        {node.name}
                      </Button>
                    </li>
                  ))}
                  <li className="flex min-h-9 items-center gap-1.5">
                    <BreadcrumbSep />
                    <span
                      className="font-semibold text-foreground"
                      aria-current="page"
                    >
                      {resolved.node.name}
                    </span>
                  </li>
                </>
              ) : (
                <li className="flex min-h-9 items-center gap-1.5">
                  <BreadcrumbSep />
                  <span className="font-semibold text-muted-foreground">
                    {categoryFilter}
                  </span>
                </li>
              )}
            </ol>
          )}

          {chips.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {chipSectionLabel}
              </p>
              <div className="-mx-1 flex flex-wrap gap-2 overflow-x-auto pb-1">
                {chips.map((node) => {
                  const selected = node.slug === categoryFilter;
                  return (
                    <Button
                      key={node.slug}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "shrink-0 rounded-full",
                        selected && "pointer-events-none",
                      )}
                      disabled={selected}
                      aria-current={selected ? "true" : undefined}
                      onClick={() => onCategoryChange(node.slug, "chip")}
                    >
                      {node.name}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </nav>
  );
}
