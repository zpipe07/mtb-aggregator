import type { Metadata } from "next";
import AdminRootLayoutClient from "./AdminRootLayoutClient";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminRootLayoutClient>{children}</AdminRootLayoutClient>;
}
