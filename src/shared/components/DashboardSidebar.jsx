import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { tokenHelper } from "../api";
import OrgSwitcher from "./OrgSwitcher";
import hrcloudsLogo from "../../assets/logo2.png";
import {
  HiTemplate,
  HiChatAlt2,
  HiCalendar,
  HiUserGroup,
  HiClock,
  HiLogout,
  HiOfficeBuilding,
  HiMail,
  HiClipboardList,
  HiChevronDown,
  HiChevronRight,
  HiViewGrid,
} from "react-icons/hi";

function DashboardSidebar({ role = "guest" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, orgId, organizations } = useAuth();

  function handleLogout() {
    tokenHelper.clear();
    logout();
    navigate("/");
  }

  // Sidebar link items based on role
  const getNavSections = () => {
    if (role === "guest") {
      return [
        {
          title: "MENU",
          icon: HiTemplate,
          items: [
            { label: "Dashboard", path: "/dashboard/guest", icon: HiTemplate, active: location.pathname === "/dashboard/guest" },
            { label: "Register Org", path: "/register-organization", icon: HiOfficeBuilding, active: location.pathname === "/register-organization" },
          ],
        },
        {
          title: "HELP & SUPPORT",
          icon: HiChatAlt2,
          items: [
            { label: "Check Invites", path: "/dashboard/guest", icon: HiMail },
            { label: "Support", path: "mailto:support@hrclouds.in", icon: HiChatAlt2, external: true },
          ],
        },
      ];
    }

    if (role === "hr") {
      return [
        {
          title: "OVERVIEW",
          icon: HiTemplate,
          items: [
            { label: "Dashboard", path: "/dashboard/hr", icon: HiViewGrid, active: location.pathname === "/dashboard/hr" },
            { label: "Employees", path: "/dashboard/hr/employees", icon: HiUserGroup, active: location.pathname === "/dashboard/hr/employees" },
          ],
        },
        {
          title: "ATTENDANCE",
          icon: HiClock,
          items: [
            { label: "Policies", path: "/dashboard/hr/attendance/policies", icon: HiClipboardList, active: location.pathname === "/dashboard/hr/attendance/policies" },
            { label: "Shifts", path: "/dashboard/hr/attendance/shifts", icon: HiClock, active: location.pathname === "/dashboard/hr/attendance/shifts" },
            { label: "Roster", path: "/dashboard/hr/attendance/roster", icon: HiUserGroup, active: location.pathname === "/dashboard/hr/attendance/roster" },
            { label: "Holidays", path: "/dashboard/hr/attendance/holidays", icon: HiCalendar, active: location.pathname === "/dashboard/hr/attendance/holidays" },
            { label: "Weekly Offs", path: "/dashboard/hr/attendance/weekly-offs", icon: HiTemplate, active: location.pathname === "/dashboard/hr/attendance/weekly-offs" },
          ],
        },
      ];
    }

    return [
      {
        title: "MENU",
        icon: HiTemplate,
        items: [
          { label: "Dashboard", path: `/dashboard/${role}`, icon: HiTemplate, active: location.pathname.includes(`/dashboard/${role}`) },
        ],
      },
    ];
  };

  const navSections = getNavSections();

  const [openSections, setOpenSections] = useState({
    ATTENDANCE: true,
    OVERVIEW: true,
  });

  useEffect(() => {
    navSections.forEach((section) => {
      const hasActiveItem = section.items.some((item) => item.active);
      if (hasActiveItem) {
        setOpenSections((prev) => ({ ...prev, [section.title]: true }));
      }
    });
  }, [location.pathname]);

  const toggleSection = (title) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-100 flex flex-col justify-between min-h-screen sticky top-0 h-screen overflow-y-auto flex-shrink-0 z-30 font-sans">
      {/* Top Branding Logo */}
      <div>
        <div className="px-6 py-6 flex items-center justify-between">
          <Link to="/">
            <img src={hrcloudsLogo} alt="HR Clouds" className="h-9 w-auto object-contain" />
          </Link>
        </div>

        {/* Multi-Org Switcher dropdown inside sidebar if orgs exist */}
        {organizations && organizations.length > 1 && (
          <div className="px-5 py-3 border-b border-slate-100">
            <OrgSwitcher organizations={organizations} currentOrgId={orgId} />
          </div>
        )}

        {/* Navigation Section */}
        <div className="px-4 py-4 space-y-4">
          {navSections.map((section) => {
            const isSingle = section.items.length === 1;

            // Single item section — render directly as a link
            if (isSingle) {
              const item = section.items[0];
              const Icon = item.icon || section.icon;
              const isActive = item.active;

              return (
                <Link
                  key={section.title}
                  to={item.path}
                  className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-bold transition-all ${
                    isActive
                      ? "bg-[#F3E8FF] text-[#7E22CE] shadow-2xs"
                      : "text-slate-600 hover:bg-slate-50 hover:text-purple-700"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-[#7E22CE]" : "text-slate-400"}`} />
                  {item.label}
                </Link>
              );
            }

            // Multi-item section — render with collapsible header
            const isOpen = openSections[section.title] !== false;

            return (
              <div key={section.title} className="space-y-1">
                {/* Section Header */}
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-4 py-2 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors"
                >
                  <span>{section.title}</span>
                  {isOpen ? (
                    <HiChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <HiChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>

                {/* Sub-items list */}
                {isOpen && (
                  <div className="space-y-1 pl-2">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.active;

                      return (
                        <Link
                          key={item.label}
                          to={item.path}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
                            isActive
                              ? "text-[#7E22CE] font-bold bg-[#F3E8FF]/60"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                          }`}
                        >
                          <Icon className={`w-4 h-4 ${isActive ? "text-[#7E22CE]" : "text-slate-400"}`} />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sidebar Footer User Profile */}
      <div className="p-5 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-full bg-[#6D28D9] text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
            {(user?.identifier || "U").charAt(0).toUpperCase()}
          </div>
          <div className="truncate leading-tight">
            <p className="text-xs font-bold text-slate-900 truncate">{user?.identifier?.split("@")[0] || "User"}</p>
            <p className="text-[11px] text-slate-400 font-medium capitalize mt-0.5">{role || "Hr"}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          title="Sign out"
          className="text-slate-400 hover:text-slate-600 transition-colors p-2 rounded-xl hover:bg-slate-100 cursor-pointer flex-shrink-0"
        >
          <HiLogout className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}

export default DashboardSidebar;
