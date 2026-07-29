import React, { useState } from "react";
import { authAPI, tokenHelper } from "../api";
import { useAuth } from "../contexts/AuthContext";

/**
 * OrgSwitcher — dropdown for switching between organizations
 * Shows current org + role, and a list of other orgs to switch to.
 * @param {{ organizations: Array, currentOrgId: string }} props
 */
function OrgSwitcher({ organizations = [], currentOrgId }) {
  const { updateTokens, getDashboardPath } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!organizations || organizations.length <= 1) return null;

  const currentOrg = organizations.find((o) => o.org_id === currentOrgId);
  const otherOrgs = organizations.filter((o) => o.org_id !== currentOrgId);

  async function handleSwitch(orgId) {
    setError("");
    setLoading(true);
    try {
      const res = await authAPI.switchOrganization({ org_id: orgId });
      const user = res.data?.user || res.user || res;
      updateTokens(user);
      // Full page reload to clear all tenant-specific state
      window.location.href = getDashboardPath(user.role);
    } catch (err) {
      setError(err.message || "Failed to switch organization.");
    } finally {
      setLoading(false);
    }
  }

  function getRoleBadge(role) {
    const styles = {
      hr: "bg-purple-100 text-purple-700",
      manager: "bg-blue-100 text-blue-700",
      employee: "bg-emerald-100 text-emerald-700",
      guest: "bg-gray-100 text-gray-600",
    };
    return styles[role] || styles.guest;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-purple-300 transition-all text-sm cursor-pointer"
      >
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-xs">
          {(currentOrg?.name || "O").charAt(0).toUpperCase()}
        </div>
        <div className="text-left">
          <p className="font-semibold text-gray-900 text-xs leading-tight">{currentOrg?.name || "Organization"}</p>
          <p className="text-[10px] text-gray-400 capitalize">{currentOrg?.role || "member"}</p>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-100 z-40 py-2 animate-fade-in">
            <p className="px-3 py-1.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Switch Workspace</p>
            {otherOrgs.map((org) => (
              <button
                key={org.org_id}
                onClick={() => handleSwitch(org.org_id)}
                disabled={loading}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-purple-50 transition-colors text-left disabled:opacity-50 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-md bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-600 font-bold text-xs">
                  {(org.name || "O").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">{org.name}</p>
                  <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize mt-0.5 ${getRoleBadge(org.role)}`}>
                    {org.role || "member"}
                  </span>
                </div>
              </button>
            ))}
            {error && (
              <p className="px-3 py-2 text-xs text-red-600">{error}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default OrgSwitcher;
