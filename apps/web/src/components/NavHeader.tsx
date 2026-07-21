"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CategoryTreeNode } from "@/api";
import {
  DealsMegaMenuDesktopPanel,
  DealsMegaMenuDesktopTrigger,
  DealsMegaMenuMobile,
  useActiveCategorySlug,
  useDealsMegaMenuHover,
} from "@/components/DealsMegaMenu";
import { cn, focusRing, focusRingInset } from "@/lib/utils";
import { mainNavLinkTypography } from "@/lib/mainNavStyles";
import { TheDropperLogo } from "@/components/TheDropperLogo";

type NavHeaderProps = {
  categoryTree?: CategoryTreeNode[];
};

export function NavHeader({ categoryTree = [] }: NavHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileDealsExpanded, setMobileDealsExpanded] = useState(false);
  const [desktopDealsMenuOpen, setDesktopDealsMenuOpen] = useState(false);
  const pathname = usePathname();
  const activeCategorySlug = useActiveCategorySlug();
  const desktopMenuId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const { onHoverIntent, onHoverLeave } = useDealsMegaMenuHover(
    setDesktopDealsMenuOpen,
  );

  const navLinks = [{ href: "/", label: "Home", exact: true }];

  const isDealsActive = pathname.startsWith("/deals");

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setMobileDealsExpanded(false);
  };

  const closeDesktopMenu = () => setDesktopDealsMenuOpen(false);

  useEffect(() => {
    setDesktopDealsMenuOpen(false);
    setMobileDealsExpanded(false);
  }, [pathname]);

  useEffect(() => {
    if (!desktopDealsMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [desktopDealsMenuOpen]);

  useEffect(() => {
    if (!desktopDealsMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDesktopMenu();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [desktopDealsMenuOpen]);

  useEffect(() => {
    if (!desktopDealsMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        closeDesktopMenu();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [desktopDealsMenuOpen]);

  const handleHeaderMouseLeave = (event: React.MouseEvent<HTMLElement>) => {
    if (!desktopDealsMenuOpen) return;
    const next = event.relatedTarget;
    if (next instanceof Node && headerRef.current?.contains(next)) return;
    onHoverLeave();
  };

  return (
    <header
      ref={headerRef}
      className="relative z-40 border-b border-border bg-background text-foreground"
      onMouseLeave={handleHeaderMouseLeave}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 sm:px-6 sm:py-3">
        <Link
          href="/"
          className={cn(
            "flex items-center rounded-sm transition-opacity hover:opacity-90",
            focusRing,
          )}
          aria-label="The Dropper - Home"
        >
          <TheDropperLogo variant="nav" className="h-15 w-auto sm:h-20" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 lg:flex">
          {navLinks.map(({ href, label, exact }) => {
            const isActive = exact
              ? pathname === href
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-sm border-b-2 pb-1 transition-colors",
                  mainNavLinkTypography,
                  focusRing,
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label.toUpperCase()}
              </Link>
            );
          })}
          <DealsMegaMenuDesktopTrigger
            isOpen={desktopDealsMenuOpen}
            onOpenChange={setDesktopDealsMenuOpen}
            isDealsActive={isDealsActive}
            menuId={desktopMenuId}
            onHoverIntent={onHoverIntent}
          />
        </nav>

        {/* Mobile menu button */}
        <button
          type="button"
          className={cn(
            "-mr-2 rounded-sm p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden",
            focusRing,
          )}
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-nav"
        >
          <span className="sr-only">Toggle menu</span>
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            {mobileMenuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      <DealsMegaMenuDesktopPanel
        isOpen={desktopDealsMenuOpen}
        menuId={desktopMenuId}
        categoryTree={categoryTree}
        activeCategorySlug={activeCategorySlug}
        onClose={closeDesktopMenu}
      />

      {/* Mobile nav */}
      <div
        id="mobile-nav"
        className={cn(
          "overflow-hidden transition-all duration-200 ease-out lg:hidden",
          mobileMenuOpen
            ? "max-h-[min(85vh,40rem)] opacity-100"
            : "max-h-0 opacity-0",
        )}
        aria-hidden={!mobileMenuOpen}
      >
        <nav className="space-y-1 border-t border-border px-4 pb-4 pt-2">
          {navLinks.map(({ href, label, exact }) => {
            const isActive = exact
              ? pathname === href
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={closeMobileMenu}
                className={cn(
                  "block rounded-sm px-3 py-2 transition-colors",
                  mainNavLinkTypography,
                  focusRingInset,
                  isActive
                    ? "bg-primary/15 text-foreground ring-2 ring-primary/40 ring-inset"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {label.toUpperCase()}
              </Link>
            );
          })}
          <DealsMegaMenuMobile
            isExpanded={mobileDealsExpanded}
            onToggle={() => setMobileDealsExpanded((open) => !open)}
            isDealsActive={isDealsActive}
            categoryTree={categoryTree}
            activeCategorySlug={activeCategorySlug}
            onNavigate={closeMobileMenu}
            onClose={() => setMobileDealsExpanded(false)}
          />
        </nav>
      </div>
    </header>
  );
}
