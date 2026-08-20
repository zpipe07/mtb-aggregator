import { fetchCategoryTree } from "@/api";
import { NavHeader } from "@/components/NavHeader";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { ScrollToTop } from "@/components/ScrollToTop";
import { Analytics } from "@vercel/analytics/react";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categoryTree = await fetchCategoryTree().catch(() => []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <NavHeader categoryTree={categoryTree} />
      <main className="flex-1">{children}</main>
      <ScrollToTop />
      <AffiliateDisclosure />
      <Analytics />
    </div>
  );
}
