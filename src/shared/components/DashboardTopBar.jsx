import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { tokenHelper } from "../api";
import { useSidebar } from "../contexts/SidebarContext";
import { HiSearch, HiBell, HiQuestionMarkCircle, HiChevronDown, HiDocumentText, HiLogout, HiMenuAlt2 } from "react-icons/hi";

function DashboardTopBar({ title = "HR Dashboard" }) {
  const { user, role, orgId, logout, updateTokens, getDashboardPath } = useAuth();
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const { toggleSidebar } = useSidebar();
  const navigate = useNavigate();

  const handleLogout = () => {
    tokenHelper.clear();
    logout();
    navigate("/");
  };

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

  // Mock organizations for UI if backend doesn't provide it yet
  const organizations = user?.organizations || [];
  const currentOrg = organizations.find(o => o.org_id === orgId) || { name: "Current Workspace", role };

  return (
    <header className="bg-white px-4 md:px-8 py-4 md:py-5 flex items-center justify-between sticky top-0 z-20 font-sans gap-4 md:gap-6 lg:gap-0 border-b lg:border-none border-slate-100 shadow-sm lg:shadow-none">
      
      {/* Left: Hamburger & Search Bar */}
      <div className="flex items-center gap-3 w-full lg:w-80 flex-1 lg:flex-none">
        {/* Mobile Hamburger Menu */}
        <button 
          onClick={toggleSidebar}
          className="lg:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors shrink-0"
        >
          <HiMenuAlt2 className="w-5 h-5" />
        </button>

        <div className="w-full relative flex items-center bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm focus-within:bg-white focus-within:border-purple-400 transition-all">
        <HiSearch className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search anything..."
          className="w-full bg-transparent text-slate-800 placeholder-slate-400 outline-none text-xs font-medium"
        />
        <kbd className="hidden sm:inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-500 font-bold text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 shadow-sm">
          ⌘F
        </kbd>
      </div>
      </div>

      {/* Middle: Navigation Links */}
      <nav className="hidden lg:flex items-center gap-8">
      </nav>

      {/* Right controls: Notifications + Profile */}
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        {/* Icons */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate("/dashboard/documents")}
            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-purple-600 transition-colors relative cursor-pointer"
            title="Documents"
          >
            <HiDocumentText className="w-5 h-5" />
          </button>
          <button className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-purple-600 transition-colors relative cursor-pointer">
            <HiBell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
          </button>
        </div>

        {/* Workspace Switcher */}
        {organizations.length > 0 && (
          <div className="relative hidden sm:block">
            <button 
              onClick={() => setShowOrgDropdown(!showOrgDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">Workspace</span>
                <span className="text-xs font-bold text-slate-800 truncate max-w-[120px]">{currentOrg.name}</span>
              </div>
              <HiChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showOrgDropdown ? "rotate-180" : ""}`} />
            </button>

            {showOrgDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-100 rounded-xl shadow-lg py-2 z-50 animate-slide-up">
                <div className="px-3 pb-2 mb-2 border-b border-slate-50">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Switch Workspace</p>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {organizations.map(org => (
                    <button
                      key={org.org_id}
                      onClick={() => handleSwitchOrg(org.org_id)}
                      disabled={isSwitching}
                      className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-purple-50 transition-colors text-left ${orgId === org.org_id ? "bg-slate-50" : ""}`}
                    >
                      <div>
                        <p className={`text-sm font-semibold ${orgId === org.org_id ? "text-purple-700" : "text-slate-700"}`}>{org.name}</p>
                        <p className="text-[10px] text-slate-500 capitalize">{org.role}</p>
                      </div>
                      {orgId === org.org_id && <div className="w-2 h-2 rounded-full bg-purple-600" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* User profile avatar with Dropdown */}
        <div className="relative">
          <div 
            className="flex items-center gap-2 pl-2 border-l border-slate-100 cursor-pointer group"
            onClick={() => setShowUserDropdown(!showUserDropdown)}
          >
            <div className="w-9 h-9 rounded-full bg-[#6D28D9] text-white font-bold text-xs flex items-center justify-center shadow-sm overflow-hidden border-2 border-transparent group-hover:border-purple-200 transition-all">
              <img 
                src="https://cdn3d.iconscout.com/3d/premium/thumb/woman-avatar-3d-icon-png-download-4118353.png" 
                alt="Avatar" 
                className="w-full h-full object-cover bg-purple-100"
              />
            </div>
          </div>

          {showUserDropdown && (
            <div className="absolute right-0 mt-3 w-48 bg-white border border-slate-100 rounded-xl shadow-lg py-2 z-50 animate-slide-up">
              <div className="px-4 py-2 border-b border-slate-50 mb-1">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {user?.identifier?.split("@")[0] || user?.name || "User"}
                </p>
                <p className="text-[10px] text-slate-400 capitalize font-medium">
                  {role || "Hr"}
                </p>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full text-left px-4 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <HiLogout className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default DashboardTopBar;
