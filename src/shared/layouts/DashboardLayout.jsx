import React from "react";
import { Outlet } from "react-router-dom";
import DashboardSidebar from "../components/DashboardSidebar";
import { useAuth } from "../contexts/AuthContext";

// Renders the sidebar once for a whole route group so navigating between pages
// in the group keeps its scroll position and expanded nav sections.
function DashboardLayout({ role }) {
  const { role: authRole } = useAuth();
  const resolvedRole = role || authRole || "guest";

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role={resolvedRole} />
      <div className="flex-1 flex flex-col min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

export default DashboardLayout;
