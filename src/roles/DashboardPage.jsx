// ─────────────────────────────────────────────────────────────────────────────
// DashboardPage.jsx — /dashboard: sends a signed-in user to their one
// workspace (dashboardPathForRole). The route gate also lands here when a role
// has no workspace at all, so that case must say so and offer a way out:
// redirecting to /dashboard again would spin on "Loading workspace…" forever.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../shared/contexts/AuthContext";
import { workspaceForRole } from "../shared/auth/permissions";

function DashboardPage() {
  const { isAuthenticated, role, getDashboardPath, logout } = useAuth();
  const navigate = useNavigate();
  const hasWorkspace = Boolean(workspaceForRole(role));

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/auth/login", { replace: true });
    } else if (hasWorkspace) {
      navigate(getDashboardPath(role), { replace: true });
    }
  }, [isAuthenticated, hasWorkspace, role, getDashboardPath, navigate]);

  if (isAuthenticated && !hasWorkspace) {
    const signOut = () => {
      logout();
      navigate("/auth/login", { replace: true });
    };
    return (
      <div className="min-h-screen bg-[#F4F4F5] flex items-center justify-center font-sans px-4">
        <div className="max-w-sm text-center bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">We couldn’t open your workspace</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your account doesn’t have a role this app recognises yet. Sign in again, or ask your HR team to check your access.
          </p>
          <button
            type="button"
            onClick={signOut}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-purple-700"
          >
            Sign in again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F4F5] flex items-center justify-center font-sans">
      <div className="flex flex-col items-center justify-center">
        <svg className="w-8 h-8 animate-spin text-purple-600 mb-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <p className="text-sm text-gray-500 font-medium">Loading workspace…</p>
      </div>
    </div>
  );
}

export default DashboardPage;
