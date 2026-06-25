"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { CategoryTreeNode } from "@/api";
import { useCategoryTree } from "@/hooks/queries";
import { categoryHasDeals } from "@/lib/categoryTree";
import { buildDealsCategoryPath } from "@/lib/dealsCategoryPath";
import { captureCategoryNav } from "@/lib/categoryNavAnalytics";
import { cn, focusRing, focusRingInset } from "@/lib/utils";
import { Button } from "./ui/button";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

function productDealCount(node: CategoryTreeNode): number {
  return node.product_count ?? node.deal_count;
}

type DealsMegaMenuPanelProps = {
  categoryTree: CategoryTreeNode[];
  onNavigate?: () => void;
  className?: string;
};

function CategoryMegaMenuLink({
  node,
  categoryTree,
  depth = 0,
  onNavigate,
}: {
  node: CategoryTreeNode;
  categoryTree: CategoryTreeNode[];
  depth?: number;
  onNavigate?: () => void;
}) {
  const href = buildDealsCategoryPath(node.slug, categoryTree);
  const count = productDealCount(node);
  const muted = !categoryHasDeals(node);

  return (
    <Link
      href={href}
      onClick={() => {
        captureCategoryNav(node.slug, "mega_menu");
        onNavigate?.();
      }}
      className={cn(
        "block rounded-sm py-1.5 text-sm transition-colors hover:text-foreground",
        depth === 0
          ? "font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:text-foreground",
        depth >= 2 && "text-xs font-normal",
        muted && "opacity-60",
        focusRingInset,
      )}
      style={depth > 0 ? { paddingLeft: `${(depth - 1) * 12}px` } : undefined}
    >
      {node.name}
      {count > 0 ? (
        <span className="ml-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
          ({count})
        </span>
      ) : null}
    </Link>
  );
}

function renderCategoryLinks(
  nodes: CategoryTreeNode[],
  categoryTree: CategoryTreeNode[],
  onNavigate: (() => void) | undefined,
  depth: number,
): ReactNode {
  return nodes.map((node) => (
    <li key={node.slug} className="min-w-0">
      <CategoryMegaMenuLink
        node={node}
        categoryTree={categoryTree}
        depth={depth}
        onNavigate={onNavigate}
      />
      {node.children?.length ? (
        <ul className="mt-0.5 space-y-0.5 list-none pl-0">
          {renderCategoryLinks(node.children, categoryTree, onNavigate, depth + 1)}
        </ul>
      ) : null}
    </li>
  ));
}

export function DealsMegaMenuPanel({
  categoryTree,
  onNavigate,
  className,
}: DealsMegaMenuPanelProps) {
  if (!categoryTree.length) return null;

  return (
    <div className={cn("bg-background", className)}>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <p className={cn(monoMicro, "mb-4 text-muted-foreground")}>
          {"// browse by category"}
        </p>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {categoryTree.map((root) => (
            <div key={root.slug} className="min-w-0 space-y-2">
              <CategoryMegaMenuLink
                node={root}
                categoryTree={categoryTree}
                depth={0}
                onNavigate={onNavigate}
              />
              {root.children?.length ? (
                <ul className="space-y-1 border-l border-border pl-3 list-none">
                  {renderCategoryLinks(
                    root.children,
                    categoryTree,
                    onNavigate,
                    1,
                  )}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border bg-muted/30">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/deals"
            onClick={() => {
              captureCategoryNav("", "mega_menu");
              onNavigate?.();
            }}
            className={cn(
              monoMicro,
              "text-muted-foreground transition-colors hover:text-foreground",
              focusRing,
            )}
          >
            All deals →
          </Link>
          <Link
            href="/categories"
            onClick={onNavigate}
            className={cn(
              monoMicro,
              "text-muted-foreground transition-colors hover:text-foreground",
              focusRing,
            )}
          >
            Full category index →
          </Link>
        </div>
      </div>
    </div>
  );
}

type DealsMegaMenuDesktopProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isDealsActive: boolean;
  menuId: string;
  onHoverIntent: () => void;
  onHoverLeave: () => void;
};

export function DealsMegaMenuDesktopTrigger({
  isOpen,
  onOpenChange,
  isDealsActive,
  menuId,
  onHoverIntent,
  onHoverLeave,
}: DealsMegaMenuDesktopProps) {
  return (
    <div
      className="relative"
      onMouseEnter={onHoverIntent}
      onMouseLeave={onHoverLeave}
    >
      <div className="flex items-center gap-0.5">
        <Link
          href="/deals"
          className={cn(
            "rounded-sm border-b-2 pb-1 font-mono text-[10px] font-semibold tracking-[0.2em] transition-colors",
            focusRing,
            isDealsActive
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          DEALS
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "size-7 rounded-sm text-muted-foreground hover:text-foreground",
            focusRing,
          )}
          aria-expanded={isOpen}
          aria-controls={menuId}
          aria-haspopup="true"
          aria-label={isOpen ? "Close deals categories" : "Browse deals categories"}
          onClick={() => onOpenChange(!isOpen)}
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-200",
              isOpen && "rotate-180",
            )}
            aria-hidden
          />
        </Button>
      </div>
    </div>
  );
}

type DealsMegaMenuDesktopPanelProps = {
  isOpen: boolean;
  menuId: string;
  categoryTree: CategoryTreeNode[];
  onNavigate: () => void;
  onHoverIntent: () => void;
  onHoverLeave: () => void;
};

export function DealsMegaMenuDesktopPanel({
  isOpen,
  menuId,
  categoryTree,
  onNavigate,
  onHoverIntent,
  onHoverLeave,
}: DealsMegaMenuDesktopPanelProps) {
  if (!isOpen || !categoryTree.length) return null;

  return (
    <div
      id={menuId}
      role="region"
      aria-label="Deals categories"
      className="absolute inset-x-0 top-full z-50 hidden border-b border-border bg-background shadow-lg lg:block"
      onMouseEnter={onHoverIntent}
      onMouseLeave={onHoverLeave}
    >
      <DealsMegaMenuPanel
        categoryTree={categoryTree}
        onNavigate={onNavigate}
      />
    </div>
  );
}

export function useDealsMegaMenuHover(
  onOpenChange: (open: boolean) => void,
) {
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const onHoverIntent = useCallback(() => {
    clearCloseTimer();
    onOpenChange(true);
  }, [clearCloseTimer, onOpenChange]);

  const onHoverLeave = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => onOpenChange(false), 120);
  }, [clearCloseTimer, onOpenChange]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return { onHoverIntent, onHoverLeave, clearCloseTimer };
}

type DealsMegaMenuMobileProps = {
  isExpanded: boolean;
  onToggle: () => void;
  isDealsActive: boolean;
  categoryTree: CategoryTreeNode[];
  onNavigate: () => void;
};

export function DealsMegaMenuMobile({
  isExpanded,
  onToggle,
  isDealsActive,
  categoryTree,
  onNavigate,
}: DealsMegaMenuMobileProps) {
  const panelId = useId();

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Link
          href="/deals"
          onClick={onNavigate}
          className={cn(
            "flex-1 rounded-sm px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.2em] transition-colors",
            focusRingInset,
            isDealsActive
              ? "bg-primary/15 text-foreground ring-2 ring-primary/40 ring-inset"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          DEALS
        </Link>
        {categoryTree.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-9 shrink-0 rounded-sm text-muted-foreground hover:text-foreground",
              focusRingInset,
            )}
            aria-expanded={isExpanded}
            aria-controls={panelId}
            aria-label={
              isExpanded ? "Hide deal categories" : "Show deal categories"
            }
            onClick={onToggle}
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform duration-200",
                isExpanded && "rotate-180",
              )}
              aria-hidden
            />
          </Button>
        ) : null}
      </div>

      {isExpanded && categoryTree.length > 0 ? (
        <div
          id={panelId}
          className="max-h-[min(60vh,28rem)] overflow-y-auto rounded-sm border border-border bg-card px-3 py-3"
        >
          <DealsMegaMenuPanel
            categoryTree={categoryTree}
            onNavigate={onNavigate}
            className="bg-transparent"
          />
        </div>
      ) : null}
    </div>
  );
}

export function useDealsMegaMenuTree() {
  const { data: categoryTree = [], isLoading } = useCategoryTree();
  return { categoryTree, isLoading };
}
