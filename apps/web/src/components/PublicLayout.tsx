import { Outlet } from "react-router-dom";
import { NavHeader } from "./NavHeader";

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-background">
      <NavHeader />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
