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
  HiCollection,
  HiChevronDown,
  HiChevronRight,
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
            { label: "Dashboard", path: "/dashboard/hr", icon: HiTemplate, active: location.pathname === "/dashboard/hr" },
          ],
        },
        {
          title: "ATTENDANCE",
          icon: HiClock,
          items: [
            { label: "Policies", path: "/dashboard/hr/attendance/policies", icon: HiClipboardList, active: location.pathname === "/dashboard/hr/attendance/policies" },
            { label: "Shifts", path: "/dashboard/hr/attendance/shifts", icon: HiClock, active: location.pathname === "/dashboard/hr/attendance/shifts" },
            { label: "Roster", path: "/dashboard/hr/attendance/roster", icon: HiCollection, active: location.pathname === "/dashboard/hr/attendance/roster" },
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

  // Track open/closed state of accordion dropdown sections
  const [openSections, setOpenSections] = useState({
    MANAGEMENT: true,
    ATTENDANCE: true,
    MENU: true,
    "HELP & SUPPORT": true,
  });

  // Auto-expand section if its route is currently active
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
        <div className="px-6 py-6 border-b border-slate-50 flex items-center justify-between">
          <Link to="/">
            <img src={hrcloudsLogo} alt="HR Clouds" className="h-9 w-auto object-contain" />
          </Link>
        </div>

        {/* Multi-Org Switcher dropdown inside sidebar if orgs exist */}
        {organizations && organizations.length > 1 && (
          <div className="px-5 py-3 border-b border-slate-50">
            <OrgSwitcher organizations={organizations} currentOrgId={orgId} />
          </div>
        )}

        {/* Navigation Section */}
        <div className="px-4 py-6 space-y-2">
          {navSections.map((section) => {
            const isSingle = section.items.length === 1;

            // Single item section — render directly as a link (no dropdown arrow!)
            if (isSingle) {
              const item = section.items[0];
              const Icon = item.icon || section.icon;
              const isActive = item.active;

              if (item.external) {
                return (
                  <a
                    key={section.title}
                    href={item.path}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-500 hover:text-purple-600 hover:bg-purple-50/50 transition-all"
                  >
                    <Icon className="w-4 h-4 text-slate-400" />
                    {item.label}
                  </a>
                );
              }

              return (
                <Link
                  key={section.title}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? "bg-purple-600 text-white shadow-md shadow-purple-200"
                      : "text-slate-600 hover:text-purple-600 hover:bg-purple-50/50"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
                  {item.label}
                </Link>
              );
            }

            // Multi-item section — render as a collapsible dropdown accordion
            const isOpen = openSections[section.title] !== false;
            const hasActiveChild = section.items.some((item) => item.active);
            const SectionIcon = section.icon;

            return (
              <div key={section.title} className="rounded-xl overflow-hidden pt-1">
                {/* Section Dropdown Header */}
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all ${
                    hasActiveChild
                      ? "bg-purple-50/70 text-purple-700 font-semibold"
                      : "hover:bg-slate-50 text-slate-600 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {SectionIcon && (
                      <SectionIcon
                        className={`w-4 h-4 ${
                          hasActiveChild ? "text-purple-600" : "text-slate-400"
                        }`}
                      />
                    )}
                    <span className="text-[11px] tracking-wider uppercase font-medium">
                      {section.title}
                    </span>
                  </div>
                  {isOpen ? (
                    <HiChevronDown className={`w-4 h-4 transition-transform ${hasActiveChild ? "text-purple-600" : "text-slate-400"}`} />
                  ) : (
                    <HiChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {/* Sub-items (Dropdown body) */}
                {isOpen && (
                  <div className="pl-3 pr-1 py-1 space-y-1 mt-1 border-l-2 border-slate-100 ml-3">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.active;

                      if (item.external) {
                        return (
                          <a
                            key={item.label}
                            href={item.path}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-purple-600 hover:bg-purple-50/50 transition-all"
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {item.label}
                          </a>
                        );
                      }

                      return (
                        <Link
                          key={item.label}
                          to={item.path}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                            isActive
                              ? "bg-purple-600 text-white shadow-md shadow-purple-200"
                              : "text-slate-500 hover:text-purple-600 hover:bg-purple-50/50"
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-400"}`} />
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

      {/* Sidebar Footer User Info */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
              {(user?.identifier || "U").charAt(0).toUpperCase()}
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-slate-800 truncate">{user?.identifier || "User"}</p>
              <p className="text-[10px] text-slate-400 capitalize">{role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 cursor-pointer"
          >
            <HiLogout className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default DashboardSidebar;
