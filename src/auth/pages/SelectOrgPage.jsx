import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authAPI } from "../../shared/api";
import { useAuth } from "../../shared/contexts/AuthContext";

/** First letters of the first two words, or the first two letters of one word. */
function orgInitials(org) {
  const base = (org.org_alias || org.name || "O").trim();
  const words = base.split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : base.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * The organisation's logo, falling back to its initials on a brand gradient.
 * Logo URLs are presigned S3 links with a 5-minute TTL (see the 2026-10-16 login
 * enrichment contract), so a load failure is expected eventually — `errored`
 * swaps to the initials rather than leaving a broken-image glyph.
 */
function OrgAvatar({ org }) {
  const [errored, setErrored] = useState(false);
  const src = org.logo_url || org.profile_picture;

  if (src && !errored) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setErrored(true)}
        className="w-12 h-12 rounded-xl object-cover border border-gray-200 bg-white shrink-0"
      />
    );
  }
  return (
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-base shadow-sm shrink-0">
      {orgInitials(org)}
    </div>
  );
}

function SelectOrgPage() {
  const navigate = useNavigate();
  const { selectionToken, organizations, updateTokens, getDashboardPath, clearSelectionState } = useAuth();

  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");

  // If no selection token exists, redirect to login (only when not actively submitting)
  useEffect(() => {
    if (!loading && !selectedId && (!selectionToken || !organizations?.length)) {
      navigate("/auth/login", { replace: true });
    }
  }, [selectionToken, organizations, loading, selectedId, navigate]);

  async function handleSelect(orgId) {
    setError("");
    setSelectedId(orgId);
    setLoading(true);

    try {
      const res = await authAPI.selectOrganization({ org_id: orgId }, selectionToken);
      const authData = updateTokens(res);
      const targetRole = authData?.role || authData?.user?.role;
      navigate(getDashboardPath(targetRole), { replace: true });
    } catch (err) {
      setError(err.message || "Failed to select organization. Please try again.");
      setSelectedId(null);
      setLoading(false);
    }
  }

  function handleBackToLogin() {
    clearSelectionState();
    navigate("/auth/login", { replace: true });
  }

  // Role badge colours — the purple family only, so the chooser matches the app
  // it opens into (one role per workspace).
  function getRoleBadge(role) {
    const styles = {
      hr: "bg-purple-50 text-purple-700 border-purple-200",
      manager: "bg-indigo-50 text-indigo-700 border-indigo-200",
      employee: "bg-violet-50 text-violet-700 border-violet-200",
      guest: "bg-gray-100 text-gray-600 border-gray-200",
    };
    return styles[role] || styles.guest;
  }

  // The short line under each name: what the organisation is, how big, where.
  // Only the parts the server actually sent — nulls are skipped, never a dash.
  function orgMeta(org) {
    const location = [org.city, org.state, org.country].filter(Boolean).join(", ");
    return [org.industry, org.size ? `${org.size} employees` : null, location].filter(Boolean);
  }

  if (!selectionToken || !organizations?.length) return null;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Select Workspace</h2>
      <p className="text-sm text-gray-500 mb-7">
        {organizations.length > 1
          ? `You’re a member of ${organizations.length} organizations. Choose the one to sign in to.`
          : "Choose the organization to sign in to."}
      </p>

      <div className="space-y-3">
        {organizations.map((org) => {
          const active = selectedId === org.org_id && loading;
          const alias = org.org_alias && org.org_alias.trim().toLowerCase() !== (org.name || "").trim().toLowerCase()
            ? org.org_alias
            : "";
          const meta = orgMeta(org);
          return (
            <button
              key={org.org_id}
              onClick={() => handleSelect(org.org_id)}
              disabled={loading}
              className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl border-2 transition-all duration-200 text-left group
                ${active
                  ? "border-purple-500 bg-purple-50 shadow-sm"
                  : "border-gray-200 hover:border-purple-400 hover:bg-purple-50/40 hover:shadow-sm bg-white"
                }
                disabled:cursor-not-allowed ${loading && !active ? "opacity-50" : ""} cursor-pointer`}
            >
              <OrgAvatar org={org} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 text-sm truncate">{org.name || "Organization"}</p>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${getRoleBadge(org.role)}`}>
                    {org.role || "Member"}
                  </span>
                </div>
                {alias && <p className="text-xs text-gray-400 truncate mt-0.5">{alias}</p>}
                {meta.length > 0 && (
                  <p className="text-[11px] text-gray-500 truncate mt-1">
                    {meta.join(" · ")}
                  </p>
                )}
              </div>

              {/* Arrow or spinner */}
              {active ? (
                <svg className="w-5 h-5 animate-spin text-purple-600 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-300 group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-4">
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
