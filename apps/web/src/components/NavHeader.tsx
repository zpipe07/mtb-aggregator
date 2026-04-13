"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "../context/ThemeContext";
import { Button } from "./ui/button";

function SunIcon() {
  return (
    <svg
      className="size-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="size-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  );
}

export function NavHeader() {
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  const navLinks = [
    { href: "/", label: "Home", exact: true },
    { href: "/categories", label: "Categories", exact: true },
    { href: "/deals", label: "Deals", exact: false },
  ];

  return (
    <header className="bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center hover:opacity-90 transition-opacity"
          aria-label="The Dropper - Home"
        >
          <img
            src="/logo.png"
            alt="The Dropper"
            className="h-22 sm:h-24 w-auto dark:hidden"
          />
          <img
            src="/logo-light.png"
            alt=""
            aria-hidden
            className="h-22 sm:h-24 w-auto hidden dark:block"
          />
          <span className="ml-2 flex flex-col">
            <span className="text-sm/[1] font-bold tracking-tight sm:text-lg/[1]">
              THE
            </span>
            <span className="text-2xl/[1] font-bold tracking-tight sm:text-5xl/[1]">
              DROPPER
            </span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-8">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={
              mounted
                ? theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
                : "Toggle theme"
            }
          >
            {mounted ? (
              theme === "dark" ? (
                <SunIcon />
              ) : (
                <MoonIcon />
              )
            ) : (
              <MoonIcon />
            )}
          </Button>
          {navLinks.map(({ href, label, exact }) => {
            const isActive = exact
              ? pathname === href
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`font-medium transition-colors ${
                  isActive
                    ? "text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile menu button */}
        <button
          type="button"
          className="lg:hidden p-2 -mr-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
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

      {/* Mobile nav overlay */}
      <div
        id="mobile-nav"
        className={`lg:hidden overflow-hidden transition-all duration-200 ease-out ${
          mobileMenuOpen ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
        }`}
        aria-hidden={!mobileMenuOpen}
      >
        <nav className="px-4 pb-4 pt-2 space-y-1 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="default"
            onClick={() => {
              toggleTheme();
              setMobileMenuOpen(false);
            }}
            className="w-full justify-start gap-2"
            aria-label={
              mounted
                ? theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
                : "Toggle theme"
            }
          >
            {mounted ? (
              theme === "dark" ? (
                <>
                  <SunIcon />
                  Light mode
                </>
              ) : (
                <>
                  <MoonIcon />
                  Dark mode
                </>
              )
            ) : (
              <>
                <MoonIcon />
                Dark mode
              </>
            )}
          </Button>
          {navLinks.map(({ href, label, exact }) => {
            const isActive = exact
              ? pathname === href
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-lg font-medium transition-colors ${
                  isActive
                    ? "bg-primary/20 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
