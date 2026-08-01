import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../shared/contexts/AuthContext";

function DashboardPage() {
  const { isAuthenticated, role, getDashboardPath } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/auth/login", { replace: true });
    } else {
      navigate(getDashboardPath(role), { replace: true });
    }
  }, [isAuthenticated, role, getDashboardPath, navigate]);

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
