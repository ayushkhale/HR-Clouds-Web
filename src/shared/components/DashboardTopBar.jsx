// ─────────────────────────────────────────────────────────────────────────────
// DashboardTopBar.jsx — the bar across the top of every signed-in screen.
//
// Left to right (2026-10-01): the organisation — its logo, name and address,
// where page search used to sit — then search, Documentation, the inbox bell
// and the person's own avatar. The role line ("HR Admin") was removed at the
// user's request: the sidebar already says which workspace this is.
// Clicking the organisation opens Company Profile in the current workspace.
//
// • Identity comes from useOrgIdentity (one shared read of
//   /organizations/details); the login's org list is the fallback, and there
//   is still no invented name — initials stand in for a missing logo.
// • With more than one organisation, a chevron beside it opens the workspace
//   switcher; the name itself still goes to Company Profile.
// • Search is one input: inline from md up, and behind a search button below
//   md, where it opens as a row under the bar.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { roleTitle } from "../config/dictionary";
import { useNavigate } from "react-router-dom";
import { tokenHelper } from "../api";
import { useSidebar } from "../contexts/SidebarContext";
import { HiSearch, HiBell, HiDocumentText, HiMenuAlt2, HiChevronDown, HiOfficeBuilding } from "react-icons/hi";
import GenderAvatar from "./GenderAvatar";
import { useEmbeddedPage } from "../contexts/EmbeddedPageContext";
import { refreshOrgLogo, useOrgIdentity } from "../organization/useOrgIdentity";
import { useOrgPaths } from "../attendance/paths";

// An uploaded photo is a presigned link that dies ~5 minutes after /me was
// read, and the top bar re-mounts on every page. When it fails, re-read the
// profile for a fresh link — once a minute at most, shared by every top bar.
let lastPhotoRefresh = 0;
const refreshOwnPhoto = (refreshProfile) => () => {
  if (!refreshProfile || Date.now() - lastPhotoRefresh < 60_000) return;
  lastPhotoRefresh = Date.now();
  refreshProfile();
};

function DashboardTopBar({ title = "HR Dashboard" }) {
  const embedded = useEmbeddedPage();
  const { user, orgId, updateTokens, getDashboardPath, refreshProfile } = useAuth();
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const { toggleSidebar, nav } = useSidebar();
  const navigate = useNavigate();
  const searchInputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [mobileSearch, setMobileSearch] = useState(false);
  const identity = useOrgIdentity(orgId);
  const orgPaths = useOrgPaths();
  // Which logo link failed; a fresh link (a new URL) is tried again.
  const [failedLogo, setFailedLogo] = useState("");

  // Page search over the sidebar's own menu: same pages, same names.
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? (nav?.items || []).filter((item) => `${item.label} ${item.section}`.toLowerCase().includes(needle)).slice(0, 8)
    : [];

  const goTo = (item) => {
    if (!item) return;
    setQuery("");
    setSearchOpen(false);
    setMobileSearch(false);
    searchInputRef.current?.blur();
    navigate(item.path);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(matches.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      goTo(matches[highlight] || matches[0]);
    } else if (e.key === "Escape") {
      setQuery("");
      setSearchOpen(false);
      setMobileSearch(false);
      searchInputRef.current?.blur();
    }
  };

  // The phone search row is display:none until opened, so focus it only once
  // it's on screen.
  useEffect(() => {
    if (mobileSearch) searchInputRef.current?.focus();
  }, [mobileSearch]);

  const inbox = nav?.inbox;
  const pending = inbox?.count || 0;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);



  const handleSwitchOrg = async (targetOrgId) => {
    if (targetOrgId === orgId || isSwitching) return;
    setIsSwitching(true);
    try {
      // Import authAPI if not already imported, wait we have it as authAPI but it's not imported.
      // Need to import authAPI
      const { authAPI } = await import("../api");
      const res = await authAPI.switchOrganization({ org_id: targetOrgId });
      const authData = updateTokens(res);
      const targetRole = authData?.role || authData?.user?.role;
      setShowOrgDropdown(false);
      // Navigate to new dashboard and refresh to clear any tenant-specific cached states in memory
      navigate(getDashboardPath(targetRole), { replace: true });
      window.location.reload(); 
    } catch (error) {
      console.error("Failed to switch organization:", error);
      alert("Failed to switch workspace. Please try again.");
    } finally {
      setIsSwitching(false);
    }
  };

  // Which organisation this session is in, and as what. The role is always
  // known (it is a token claim); the NAME is not always available, because no
  // endpoint returns the signed-in organisation's own profile — see the comment
  // on `orgName` below. So the block degrades to the role alone rather than
  // inventing a company called "Current Workspace", which is what it used to do.
  const organizations = user?.organizations || [];
  const currentOrg = organizations.find(o => o.org_id === orgId) || null;
  /**
   * Sources, best first:
   *   · the org list a multi-organisation sign-in stored (has real names)
   *   · whatever the login reply happened to carry on the user
   * There is deliberately no fallback string. If the name can't be known, the
   * top bar shows the role on its own instead of something untrue.
   */
  const orgName = identity.name || String(
    currentOrg?.name || user?.org_name || user?.organization_name || user?.organization?.name || "",
  ).trim();
  const orgAddress = identity.address;
  const logo = identity.logo && identity.logo !== failedLogo ? identity.logo : "";
  const initials = orgName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const canSwitch = organizations.length > 1;

  // A page embedded in another page (HR Inbox) shares the host's top bar.
  if (embedded) return null;

  const identityBlock = (
    <>
      <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center overflow-hidden shrink-0">
        {logo ? (
          <img
            src={logo}
            alt=""
            className="w-full h-full object-contain"
            onError={() => { setFailedLogo(logo); refreshOrgLogo(); }}
          />
        ) : initials ? (
          <span className="text-xs font-bold text-purple-700">{initials}</span>
        ) : (
          <HiOfficeBuilding className="w-5 h-5 text-purple-500" aria-hidden="true" />
        )}
      </span>
      {orgName && (
        <span className="flex flex-col min-w-0 text-left leading-tight">
          {/* A phone has room for the short name, when there is one. */}
          <span className="hidden sm:block text-sm font-bold text-slate-800 truncate group-hover:text-purple-700 transition-colors">{orgName}</span>
          <span className="sm:hidden text-sm font-bold text-slate-800 truncate">{identity.alias || orgName}</span>
          {/* The full address from sm up; a phone gets the city and state. */}
          {orgAddress && <span className="hidden sm:block text-[11px] font-medium text-slate-500 truncate max-w-[18rem] lg:max-w-[26rem]">{orgAddress}</span>}
          {(identity.place || orgAddress) && <span className="sm:hidden text-[11px] font-medium text-slate-500 truncate">{identity.place || orgAddress}</span>}
        </span>
      )}
    </>
  );

  return (
    <header className="bg-white px-3 sm:px-4 md:px-8 py-4 md:py-5 flex items-center justify-between sticky top-0 z-20 font-sans gap-2 sm:gap-3 md:gap-6 border-b lg:border-none border-slate-100 shadow-sm lg:shadow-none">

      {/* Left: menu button on small screens, then the organisation */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors shrink-0"
          aria-label="Open the menu"
        >
          <HiMenuAlt2 className="w-5 h-5" />
        </button>

        <div className="relative min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={() => orgPaths?.company && navigate(orgPaths.company)}
              className="group flex items-center gap-2 sm:gap-3 min-w-0 max-w-full pr-1 sm:pr-2 py-1 rounded-xl hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40"
              title={orgAddress ? `${orgName} · ${orgAddress}` : "Company Profile"}
              aria-label={orgName ? `${orgName} — open Company Profile` : "Open Company Profile"}
            >
              {identityBlock}
            </button>
            {canSwitch && (
              <button
                type="button"
                onClick={() => setShowOrgDropdown(!showOrgDropdown)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
                aria-haspopup="menu"
                aria-expanded={showOrgDropdown}
                aria-label="Switch workspace"
                title="Switch workspace"
              >
                <HiChevronDown className={`w-4 h-4 transition-transform ${showOrgDropdown ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>

          {showOrgDropdown && canSwitch && (
            <div className="absolute left-0 mt-2 w-64 bg-white border border-slate-100 rounded-xl shadow-lg py-2 z-50 animate-slide-up" role="menu">
              <div className="px-3 pb-2 mb-2 border-b border-slate-50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Switch workspace</p>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {organizations.map(org => (
                  <button
                    key={org.org_id}
                    type="button"
                    role="menuitem"
                    onClick={() => handleSwitchOrg(org.org_id)}
                    disabled={isSwitching}
                    className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-purple-50 transition-colors text-left ${orgId === org.org_id ? "bg-slate-50" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${orgId === org.org_id ? "text-purple-700" : "text-slate-700"}`}>{org.name}</p>
                      <p className="text-xs text-slate-500">{roleTitle(org.role) || org.role}</p>
                    </div>
                    {orgId === org.org_id && <div className="w-2 h-2 rounded-full bg-purple-600 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: search, Documentation, inbox, and the person */}
      <div className="flex items-center gap-0.5 sm:gap-2 md:gap-3 shrink-0">
        {/* One search input: inline from md up; below md it opens as a row
            under the bar from the search button. */}
        <div
          className={`${mobileSearch ? "absolute left-4 right-4 top-full mt-2 flex shadow-lg z-30" : "hidden"} md:relative md:left-auto md:right-auto md:top-auto md:mt-0 md:shadow-none md:flex md:w-56 lg:w-72
            items-center bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm focus-within:bg-white focus-within:border-purple-400 transition-all`}
        >
          <HiSearch className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlight(0); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            // Delay so a click on a result lands before the list closes.
            onBlur={() => setTimeout(() => { setSearchOpen(false); setMobileSearch(false); }, 150)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search pages..."
            aria-label="Search pages"
            role="combobox"
            aria-expanded={searchOpen && !!needle}
            aria-controls="topbar-search-results"
            className="w-full bg-transparent text-slate-800 placeholder-slate-400 outline-none text-xs font-medium"
          />
          <kbd className="hidden lg:inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-500 font-bold text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 shadow-sm">
            ⌘F
          </kbd>
          {searchOpen && needle && (
            <div id="topbar-search-results" role="listbox" className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-100 rounded-xl shadow-lg py-1.5 z-50 max-h-80 overflow-y-auto">
              {matches.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-500">No pages match &ldquo;{query.trim()}&rdquo;</p>
              ) : matches.map((item, i) => (
                <button
                  key={item.path}
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => goTo(item)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left transition-colors ${i === highlight ? "bg-purple-50" : "hover:bg-slate-50"}`}
                >
                  <span className="text-xs font-semibold text-slate-800 truncate">{item.label}</span>
                  {item.section && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">{item.section}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMobileSearch(true)}
          className="md:hidden w-8 h-9 flex items-center justify-center text-slate-400 hover:text-purple-600 transition-colors"
          aria-label="Search pages"
          title="Search pages"
        >
          <HiSearch className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-0 sm:gap-1 md:gap-2">
          <button
            onClick={() => navigate("/dashboard/documents")}
            className="w-8 sm:w-9 h-9 flex items-center justify-center text-slate-400 hover:text-purple-600 transition-colors relative cursor-pointer"
            title="Documentation"
            aria-label="Documentation"
          >
            <HiDocumentText className="w-5 h-5" />
          </button>
          {/* The bell opens the inbox and only shows a dot when something is
              actually waiting. Roles without an inbox get no bell. */}
          {inbox && (
            <button
              onClick={() => navigate(inbox.path)}
              className="w-8 sm:w-9 h-9 flex items-center justify-center text-slate-400 hover:text-purple-600 transition-colors relative cursor-pointer"
              title={pending > 0 ? `Inbox — ${pending} waiting for you` : "Inbox — nothing waiting"}
              aria-label={pending > 0 ? `Inbox, ${pending} waiting` : "Inbox"}
            >
              <HiBell className="w-5 h-5" />
              {pending > 0 && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />}
            </button>
          )}
        </div>

        {/* The person's own avatar opens My Profile */}
        <div className="flex items-center gap-2 pl-1.5 sm:pl-2 md:pl-3 border-l border-slate-100">
          <button
            onClick={() => navigate("/dashboard/profile")}
            className="w-9 h-9 rounded-full bg-[#6D28D9] text-white font-bold text-xs flex items-center justify-center shadow-sm overflow-hidden border-2 border-transparent hover:border-purple-200 hover:shadow transition-all focus:outline-none"
            title="My Profile"
            aria-label="My Profile"
          >
            <GenderAvatar person={user} name={user?.name || user?.email || user?.identifier} onPhotoError={refreshOwnPhoto(refreshProfile)} />
          </button>
        </div>
      </div>
    </header>
  );
}

export default DashboardTopBar;
