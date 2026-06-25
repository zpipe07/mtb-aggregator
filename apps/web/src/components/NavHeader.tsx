"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DealsMegaMenuDesktopPanel,
  DealsMegaMenuDesktopTrigger,
  DealsMegaMenuMobile,
  useDealsMegaMenuHover,
  useDealsMegaMenuTree,
} from "@/components/DealsMegaMenu";
import { cn, focusRing, focusRingInset } from "@/lib/utils";

export function NavHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileDealsExpanded, setMobileDealsExpanded] = useState(false);
  const [desktopDealsMenuOpen, setDesktopDealsMenuOpen] = useState(false);
  const pathname = usePathname();
  const { categoryTree } = useDealsMegaMenuTree();
  const desktopMenuId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const { onHoverIntent, onHoverLeave } = useDealsMegaMenuHover(
    setDesktopDealsMenuOpen,
  );

  const navLinks = [
    { href: "/", label: "Home", exact: true },
    { href: "/categories", label: "Categories", exact: true },
  ];

  const isDealsActive = pathname.startsWith("/deals");

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setMobileDealsExpanded(false);
  };

  const closeDesktopMenu = () => setDesktopDealsMenuOpen(false);

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

  return (
    <header
      ref={headerRef}
      className="relative z-40 border-b border-border bg-background text-foreground"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-3 rounded-sm transition-opacity hover:opacity-90",
            focusRing,
          )}
          aria-label="The Dropper - Home"
        >
          <img
            src="/logo.png"
            alt=""
            className="h-9 w-auto sm:h-10"
            width={120}
            height={36}
          />
          <span className="font-mono text-[11px] font-bold tracking-[0.2em] sm:text-xs">
            THE DROPPER //
          </span>
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
                  "rounded-sm border-b-2 pb-1 font-mono text-[10px] font-semibold tracking-[0.2em] transition-colors",
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
            onHoverLeave={onHoverLeave}
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
        onNavigate={closeDesktopMenu}
        onHoverIntent={onHoverIntent}
        onHoverLeave={onHoverLeave}
      />

      {/* Mobile nav */}
      <div
        id="mobile-nav"
        className={cn(
          "overflow-hidden transition-all duration-200 ease-out lg:hidden",
          mobileMenuOpen ? "max-h-[min(85vh,40rem)] opacity-100" : "max-h-0 opacity-0",
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
                  "block rounded-sm px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.2em] transition-colors",
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
            onNavigate={closeMobileMenu}
          />
        </nav>
      </div>
    </header>
  );
}
