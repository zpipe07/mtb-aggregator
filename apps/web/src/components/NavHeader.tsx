"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const navLinks = [
    { href: "/", label: "Home", exact: true },
    { href: "/categories", label: "Categories", exact: true },
    { href: "/deals", label: "Deals", exact: false },
  ];

  return (
    <header className="border-b border-border bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-3 hover:opacity-90 transition-opacity"
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
                className={`border-b-2 pb-1 font-mono text-[10px] font-semibold tracking-[0.2em] transition-colors ${
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label.toUpperCase()}
              </Link>
            );
          })}
        </nav>

        {/* Mobile menu button */}
        <button
          type="button"
          className="-mr-2 rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring lg:hidden"
          onClick={() => setMobileMenuOpen((o) => !o)}
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

      {/* Mobile nav */}
      <div
        id="mobile-nav"
        className={`overflow-hidden transition-all duration-200 ease-out lg:hidden ${
          mobileMenuOpen ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
        }`}
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
                onClick={() => setMobileMenuOpen(false)}
                className={`block rounded px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.2em] transition-colors ${
                  isActive
                    ? "bg-primary/15 text-foreground ring-2 ring-primary/40 ring-inset"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {label.toUpperCase()}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
