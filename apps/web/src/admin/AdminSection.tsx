import { useState, useCallback } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AdminGate } from "./AdminGate";
import { AdminLayout } from "./AdminLayout";
import { Dashboard } from "./Dashboard";
import { StoreManager } from "./StoreManager";
import { DataBrowser } from "./DataBrowser";
import { Operations } from "./Operations";
import { getStoredAdminToken } from "./api";

export function AdminSection() {
  const [token, setToken] = useState<string | null>(() => getStoredAdminToken());
  const onLoginSuccess = useCallback(() => setToken(getStoredAdminToken()), []);

  if (!token) {
    return <AdminGate onSuccess={onLoginSuccess} />;
  }
  return (
    <Routes>
      <Route path="/" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="stores" element={<StoreManager />} />
        <Route path="data" element={<DataBrowser />} />
        <Route path="operations" element={<Operations />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
