import { useState, useCallback } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AdminGate } from "./AdminGate";
import { AdminLayout } from "./AdminLayout";
import { Dashboard } from "./Dashboard";
import { StoreManager } from "./StoreManager";
import { DataBrowser } from "./DataBrowser";
import { TaxonomyManager } from "./TaxonomyManager";
import { PromptProfileManager } from "./PromptProfileManager";
import { SpecFilterManager } from "./SpecFilterManager";
import { NormalizationManager } from "./NormalizationManager";
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
        <Route path="taxonomy" element={<TaxonomyManager />} />
        <Route path="llm-profiles" element={<PromptProfileManager />} />
        <Route path="spec-filters" element={<SpecFilterManager />} />
        <Route path="normalization" element={<NormalizationManager />} />
        <Route path="operations" element={<Operations />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
