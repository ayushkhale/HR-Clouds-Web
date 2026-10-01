import React from "react";
import { Outlet } from "react-router-dom";
import DashboardSidebar from "../components/DashboardSidebar";
import { useAuth } from "../contexts/AuthContext";
import { WorkspaceContext } from "../contexts/WorkspaceContext";

// Renders the sidebar once for a whole route group so navigating between pages
// in the group keeps its scroll position and expanded nav sections. It also
// tells the pages which workspace they're mounted in (WorkspaceContext): the
// same self-service screen runs under all three prefixes.
function DashboardLayout({ role }) {
  const { role: authRole } = useAuth();
  const resolvedRole = role || authRole || "guest";

  return (
    <WorkspaceContext.Provider value={resolvedRole}>
      <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
        {/* Keyed by role: the four route groups render this same layout, so React
            can keep one sidebar instance when HR moves between workspaces. Its
            remembered open sections are per role (hrc.sidebar.open.<role>), and
            without a remount one workspace's state was written under another's. */}
        <DashboardSidebar key={resolvedRole} role={resolvedRole} />
        <div className="flex-1 flex flex-col min-w-0">
          <Outlet />
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

export default DashboardLayout;
