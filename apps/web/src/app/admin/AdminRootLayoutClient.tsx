"use client";

import { useState, useCallback, useEffect } from "react";
import { AdminGate } from "@/admin/AdminGate";
import { AdminLayout } from "@/admin/AdminLayout";
import { getStoredAdminToken } from "@/admin/api";

export default function AdminRootLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const onLoginSuccess = useCallback(() => setToken(getStoredAdminToken()), []);

  useEffect(() => {
    setToken(getStoredAdminToken());
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <div className="text-stone-500">Loading…</div>
      </div>
    );
  }
  if (!token) {
    return <AdminGate onSuccess={onLoginSuccess} />;
  }
  return <AdminLayout>{children}</AdminLayout>;
}
