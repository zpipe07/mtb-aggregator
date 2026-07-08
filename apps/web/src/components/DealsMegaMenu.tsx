"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import type { CategoryTreeNode } from "@/api";
import { categoryHasDeals, findCategoryWithAncestors } from "@/lib/categoryTree";
import { buildDealsCategoryPath, parseCategorySlugFromDealsPath } from "@/lib/dealsCategoryPath";
import { captureCategoryNav } from "@/lib/categoryNavAnalytics";
import { cn, focusRing, focusRingInset } from "@/lib/utils";
import { mainNavLinkTypography } from "@/lib/mainNavStyles";
import { Button } from "./ui/button";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

function productDealCount(node: CategoryTreeNode): number {
  return node.product_count ?? node.deal_count;
}

function getDefaultExpandedSecondLevels(
  categoryTree: CategoryTreeNode[],
  activeSlug: string | null,
): Set<string> {
  const expanded = new Set<string>();
  if (!activeSlug) return expanded;

  const found = findCategoryWithAncestors(categoryTree, activeSlug);
  if (!found) return expanded;

  for (const ancestor of found.ancestors) {
    if (ancestor.depth === 1 && ancestor.children?.length) {
      expanded.add(ancestor.slug);
    }
  }
  if (found.node.depth === 1 && found.node.children?.length) {
    expanded.add(found.node.slug);
  }

  return expanded;
}

type DealsMegaMenuPanelProps = {
  categoryTree: CategoryTreeNode[];
  activeCategorySlug?: string | null;
  onNavigate?: () => void;
  onClose?: () => void;
  className?: string;
};

function CategoryMegaMenuLink({
  node,
  categoryTree,
  depth = 0,
  onNavigate,
  className,
}: {
  node: CategoryTreeNode;
  categoryTree: CategoryTreeNode[];
  depth?: number;
  onNavigate?: () => void;
  className?: string;
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
        "block min-w-0 rounded-sm py-1.5 text-left text-sm transition-colors hover:text-foreground",
        depth === 0
          ? "font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:text-foreground",
        depth >= 2 && "text-xs font-normal",
        muted && "opacity-60",
        focusRingInset,
        className,
      )}
      style={depth >= 2 ? { paddingLeft: `${(depth - 2) * 12}px` } : undefined}
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

const secondLevelRowGrid =
  "grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-1";

function SecondLevelChevronSlot({
  expanded,
  panelId,
  label,
  onToggle,
  visible,
}: {
  expanded: boolean;
  panelId: string;
  label: string;
  onToggle: () => void;
  visible: boolean;
}) {
  if (!visible) {
    return <span className="size-6 shrink-0" aria-hidden />;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "size-6 shrink-0 rounded-sm text-muted-foreground hover:text-foreground",
        focusRingInset,
      )}
      aria-expanded={expanded}
      aria-controls={panelId}
      aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
      onClick={onToggle}
    >
      <ChevronDown
        className={cn(
          "size-3.5 transition-transform duration-200",
          expanded && "rotate-180",
        )}
        aria-hidden
      />
    </Button>
  );
}

function SecondLevelCategoryGroup({
  node,
  categoryTree,
  activeCategorySlug,
  expanded,
  onToggle,
  onNavigate,
}: {
  node: CategoryTreeNode;
  categoryTree: CategoryTreeNode[];
  activeCategorySlug: string | null;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isActive =
    activeCategorySlug === node.slug ||
    (activeCategorySlug
      ? findCategoryWithAncestors(categoryTree, activeCategorySlug)?.ancestors.some(
          (ancestor) => ancestor.slug === node.slug,
        )
      : false);

  if (!hasChildren) {
    return (
      <li className={cn("min-w-0", secondLevelRowGrid)}>
        <SecondLevelChevronSlot
          expanded={false}
          panelId=""
          label={node.name}
          onToggle={() => undefined}
          visible={false}
        />
        <CategoryMegaMenuLink
          node={node}
          categoryTree={categoryTree}
          depth={1}
          onNavigate={onNavigate}
          className={isActive ? "font-semibold text-foreground" : undefined}
        />
      </li>
    );
  }

  const panelId = `mega-menu-${node.slug}-children`;

  return (
    <li className="min-w-0">
      <div className={secondLevelRowGrid}>
        <SecondLevelChevronSlot
          expanded={expanded}
          panelId={panelId}
          label={node.name}
          onToggle={onToggle}
          visible
        />
        <CategoryMegaMenuLink
          node={node}
          categoryTree={categoryTree}
          depth={1}
          onNavigate={onNavigate}
          className={isActive ? "font-semibold text-foreground" : undefined}
        />
      </div>
      {expanded ? (
        <ul
          id={panelId}
          className="mt-0.5 space-y-0.5 border-l border-border pl-3 list-none ml-7"
        >
          {node.children.map((grandchild) => (
            <li key={grandchild.slug} className="min-w-0">
              <CategoryMegaMenuLink
                node={grandchild}
                categoryTree={categoryTree}
                depth={2}
                onNavigate={onNavigate}
                className={
                  activeCategorySlug === grandchild.slug
                    ? "font-semibold text-foreground"
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RootCategoryColumn({
  root,
  categoryTree,
  activeCategorySlug,
  expandedSecondLevels,
  onToggleSecondLevel,
  onNavigate,
}: {
  root: CategoryTreeNode;
  categoryTree: CategoryTreeNode[];
  activeCategorySlug: string | null;
  expandedSecondLevels: Set<string>;
  onToggleSecondLevel: (slug: string) => void;
  onNavigate?: () => void;
}) {
  const isRootActive =
    activeCategorySlug === root.slug ||
    (activeCategorySlug
      ? findCategoryWithAncestors(categoryTree, activeCategorySlug)?.ancestors.some(
          (ancestor) => ancestor.slug === root.slug,
        )
      : false);

  return (
    <div className="min-w-0 space-y-2">
      <CategoryMegaMenuLink
        node={root}
        categoryTree={categoryTree}
        depth={0}
        onNavigate={onNavigate}
        className={isRootActive ? "text-primary" : undefined}
      />
      {root.children?.length ? (
        <ul className="space-y-1 list-none pl-0">
          {root.children.map((child) => (
            <SecondLevelCategoryGroup
              key={child.slug}
              node={child}
              categoryTree={categoryTree}
              activeCategorySlug={activeCategorySlug}
              expanded={expandedSecondLevels.has(child.slug)}
              onToggle={() => onToggleSecondLevel(child.slug)}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DealsMegaMenuPanel({
  categoryTree,
  activeCategorySlug = null,
  onNavigate,
  onClose,
  className,
}: DealsMegaMenuPanelProps) {
  const defaultExpanded = useMemo(
    () => getDefaultExpandedSecondLevels(categoryTree, activeCategorySlug),
    [categoryTree, activeCategorySlug],
  );
  const [expandedSecondLevels, setExpandedSecondLevels] =
    useState<Set<string>>(defaultExpanded);

  useEffect(() => {
    setExpandedSecondLevels(defaultExpanded);
  }, [defaultExpanded]);

  const toggleSecondLevel = useCallback((slug: string) => {
    setExpandedSecondLevels((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  return (
    <div className={cn("bg-card", className)}>
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className={cn(monoMicro, "pt-1 text-muted-foreground")}>
            {"// browse by category"}
          </p>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 shrink-0 rounded-sm text-muted-foreground hover:text-foreground",
                focusRing,
              )}
              aria-label="Close categories menu"
              onClick={onClose}
            >
              <X className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
        {categoryTree.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Categories are unavailable right now.{" "}
            <Link
              href="/deals"
              onClick={onNavigate}
              className={cn(
                "font-medium text-foreground underline underline-offset-4",
                focusRing,
              )}
            >
              Browse all deals
            </Link>
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {categoryTree.map((root) => (
              <RootCategoryColumn
                key={root.slug}
                root={root}
                categoryTree={categoryTree}
                activeCategorySlug={activeCategorySlug}
                expandedSecondLevels={expandedSecondLevels}
                onToggleSecondLevel={toggleSecondLevel}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-border bg-muted/40">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
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
};

export function DealsMegaMenuDesktopTrigger({
  isOpen,
  onOpenChange,
  isDealsActive,
  menuId,
  onHoverIntent,
}: DealsMegaMenuDesktopProps) {
  return (
    <div className="relative" onMouseEnter={onHoverIntent}>
      <div className="flex items-center gap-0.5">
        <Link
          href="/deals"
          className={cn(
            "rounded-sm border-b-2 pb-1 transition-colors",
            mainNavLinkTypography,
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
  activeCategorySlug: string | null;
  onClose: () => void;
};

export function DealsMegaMenuDesktopPanel({
  isOpen,
  menuId,
  categoryTree,
  activeCategorySlug,
  onClose,
}: DealsMegaMenuDesktopPanelProps) {
  if (!isOpen) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-30 hidden bg-foreground/12 backdrop-blur-[1px] lg:block"
        aria-label="Close categories menu"
        onClick={onClose}
      />
      <div
        id={menuId}
        role="region"
        aria-label="Deals categories"
        className="absolute inset-x-0 top-full z-50 hidden lg:block"
      >
        <div className="relative px-4 pb-6 pt-3 sm:px-6">
          <div
            className="mx-auto max-w-5xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <DealsMegaMenuPanel
              categoryTree={categoryTree}
              activeCategorySlug={activeCategorySlug}
              onNavigate={onClose}
              onClose={onClose}
            />
          </div>
        </div>
      </div>
    </>
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
    closeTimerRef.current = setTimeout(() => onOpenChange(false), 200);
  }, [clearCloseTimer, onOpenChange]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return { onHoverIntent, onHoverLeave, clearCloseTimer };
}

type DealsMegaMenuMobileProps = {
  isExpanded: boolean;
  onToggle: () => void;
  isDealsActive: boolean;
  categoryTree: CategoryTreeNode[];
  activeCategorySlug: string | null;
  onNavigate: () => void;
  onClose: () => void;
};

export function DealsMegaMenuMobile({
  isExpanded,
  onToggle,
  isDealsActive,
  categoryTree,
  activeCategorySlug,
  onNavigate,
  onClose,
}: DealsMegaMenuMobileProps) {
  const panelId = useId();

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Link
          href="/deals"
          onClick={onNavigate}
          className={cn(
            "flex-1 rounded-sm px-3 py-2 transition-colors",
            mainNavLinkTypography,
            focusRingInset,
            isDealsActive
              ? "bg-primary/15 text-foreground ring-2 ring-primary/40 ring-inset"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          DEALS
        </Link>
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
      </div>

      {isExpanded ? (
        <div
          id={panelId}
          className="max-h-[min(60vh,28rem)] overflow-y-auto rounded-sm border border-border bg-card"
        >
          <DealsMegaMenuPanel
            categoryTree={categoryTree}
            activeCategorySlug={activeCategorySlug}
            onNavigate={onNavigate}
            onClose={onClose}
            className="bg-transparent"
          />
        </div>
      ) : null}
    </div>
  );
}

export function useActiveCategorySlug(): string | null {
  const pathname = usePathname();
  return useMemo(
    () => parseCategorySlugFromDealsPath(pathname),
    [pathname],
  );
}
