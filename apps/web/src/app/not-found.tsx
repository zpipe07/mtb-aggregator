import type { Metadata } from "next";
import { NavHeader } from "@/components/NavHeader";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { NotFoundContent } from "@/components/NotFoundContent";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/** Root 404 for unmatched URLs (not wrapped by the public route-group layout). */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <NavHeader />
      <main className="flex-1">
        <NotFoundContent />
      </main>
      <AffiliateDisclosure />
    </div>
  );
}
