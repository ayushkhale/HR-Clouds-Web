import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authAPI } from "../../shared/api";
import { useAuth } from "../../shared/contexts/AuthContext";

function SelectOrgPage() {
  const navigate = useNavigate();
  const { selectionToken, organizations, updateTokens, getDashboardPath, clearSelectionState } = useAuth();

  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");

  // If no selection token exists, redirect to login
  useEffect(() => {
    if (!selectionToken || !organizations?.length) {
      navigate("/auth/login", { replace: true });
    }
  }, [selectionToken, organizations, navigate]);

  async function handleSelect(orgId) {
    setError("");
    setSelectedId(orgId);
    setLoading(true);

    try {
      const res = await authAPI.selectOrganization({ org_id: orgId }, selectionToken);
      const user = res.data?.user || res.user || res;
      updateTokens(user);
      navigate(getDashboardPath(user.role), { replace: true });
    } catch (err) {
      setError(err.message || "Failed to select organization. Please try again.");
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  function handleBackToLogin() {
    clearSelectionState();
    navigate("/auth/login", { replace: true });
  }

  // Role badge colors
  function getRoleBadge(role) {
    const styles = {
      hr: "bg-purple-100 text-purple-700 border-purple-200",
      manager: "bg-blue-100 text-blue-700 border-blue-200",
      employee: "bg-emerald-100 text-emerald-700 border-emerald-200",
      guest: "bg-gray-100 text-gray-600 border-gray-200",
    };
    return styles[role] || styles.guest;
  }

  if (!selectionToken || !organizations?.length) return null;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Select Workspace</h2>
      <p className="text-sm text-gray-500 mb-7">
        You belong to multiple organizations. Choose one to continue.
      </p>

      <div className="space-y-3">
        {organizations.map((org) => (
          <button
            key={org.org_id}
            onClick={() => handleSelect(org.org_id)}
            disabled={loading}
            className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-200 text-left group
              ${selectedId === org.org_id && loading
                ? "border-purple-500 bg-purple-50 shadow-sm"
                : "border-gray-200 hover:border-purple-400 hover:bg-purple-50/50 bg-white"
              }
              disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer`}
          >
            <div className="flex items-center gap-3.5">
              {/* Org avatar */}
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                {(org.name || "O").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{org.name || "Organization"}</p>
                <span className={`inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize ${getRoleBadge(org.role)}`}>
                  {org.role || "Member"}
                </span>
              </div>
            </div>

            {/* Arrow or spinner */}
            {selectedId === org.org_id && loading ? (
              <svg className="w-5 h-5 animate-spin text-purple-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-300 group-hover:text-purple-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">
          {error}
        </p>
      )}

      <button
        onClick={handleBackToLogin}
        className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-6 transition-colors cursor-pointer"
      >
        ← Back to Login
      </button>
    </div>
  );
}

export default SelectOrgPage;
