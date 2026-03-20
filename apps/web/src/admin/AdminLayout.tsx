"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearStoredAdminToken } from "./api";

const navItems = [
  { to: "/admin", end: true, label: "Dashboard" },
  { to: "/admin/stores", end: false, label: "Stores" },
  { to: "/admin/data", end: false, label: "Data" },
  { to: "/admin/taxonomy", end: false, label: "Taxonomy" },
  { to: "/admin/categories", end: false, label: "Categories" },
  { to: "/admin/spec-filters", end: false, label: "Spec Filters" },
  { to: "/admin/normalization", end: false, label: "Normalization" },
  { to: "/admin/llm-profiles", end: false, label: "LLM Profiles" },
  { to: "/admin/category-classifier", end: false, label: "Category Classifier" },
  { to: "/admin/operations", end: false, label: "Operations" },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    clearStoredAdminToken();
    router.replace("/admin");
    window.location.reload(); // Layout reads token on mount; reload to show gate
  }

  return (
    <div className="min-h-screen bg-stone-100 flex">
      <aside className="w-52 shrink-0 border-r border-stone-200 bg-white flex flex-col min-h-screen">
        <div className="p-4 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-8 w-auto shrink-0" />
            <h1 className="font-semibold text-stone-800">Admin</h1>
          </div>
        </div>
        <nav className="p-2 flex-1">
          {navItems.map(({ to, end, label }) => {
            const isActive = end
              ? pathname === to
              : pathname.startsWith(to + "/") || pathname === to;
            return (
              <Link
                key={to}
                href={to}
                className={`block rounded px-3 py-2 text-sm ${
                  isActive
                    ? "bg-stone-200 text-stone-900 font-medium"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-stone-200 p-2">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-100"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
