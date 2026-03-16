import { Routes, Route } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { PublicLayout } from "./components/PublicLayout";
import { HomePage, DealsPage } from "./pages";
import { AdminSection } from "./admin";

function App() {
  return (
    <>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="deals" element={<DealsPage />} />
        </Route>
        <Route path="/admin/*" element={<AdminSection />} />
      </Routes>
      <Analytics />
    </>
  );
}

export default App;
