import { useState } from "react";
import { Link, NavLink } from "react-router-dom";

export function NavHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { to: "/", end: true, label: "Home" },
    { to: "/deals", end: false, label: "Deals" },
  ];

  return (
    <header className="bg-stone-800 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 lg:h-16">
        <Link
          to="/"
          className="text-lg lg:text-xl font-bold tracking-tight hover:text-stone-200 transition-colors"
        >
          MTB Deal Aggregator
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-8">
          {navLinks.map(({ to, end, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `font-medium transition-colors ${
                  isActive ? "text-white" : "text-stone-400 hover:text-white"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Mobile menu button */}
        <button
          type="button"
          className="lg:hidden p-2 -mr-2 rounded-lg text-stone-400 hover:text-white hover:bg-stone-700/50 focus:outline-none focus:ring-2 focus:ring-stone-500"
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
        <nav className="px-4 pb-4 pt-2 space-y-1 border-t border-stone-700">
          {navLinks.map(({ to, end, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg font-medium transition-colors ${
                  isActive
                    ? "bg-stone-700 text-white"
                    : "text-stone-400 hover:bg-stone-700/50 hover:text-white"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
