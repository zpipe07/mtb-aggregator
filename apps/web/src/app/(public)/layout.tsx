import { NavHeader } from "@/components/NavHeader";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { Analytics } from "@vercel/analytics/react";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <NavHeader />
      <main className="flex-1">{children}</main>
      <AffiliateDisclosure />
      <Analytics />
    </div>
  );
}
