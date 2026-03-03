import { Outlet } from "react-router-dom";
import { NavHeader } from "./NavHeader";

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-stone-100">
      <NavHeader />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
