import { NavHeader } from "@/components/NavHeader";
import { Analytics } from "@vercel/analytics/react";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <NavHeader />
      <main>{children}</main>
      <Analytics />
    </div>
  );
}
