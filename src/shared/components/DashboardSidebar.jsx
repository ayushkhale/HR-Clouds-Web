import React, { useState, useEffect } from "react";

import { DICTIONARY } from "../config/dictionary";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSidebar } from "../contexts/SidebarContext";
import { tokenHelper } from "../api";
import OrgSwitcher from "./OrgSwitcher";
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
  HiQuestionMarkCircle,
  HiCog,
  HiSun,
  HiMoon,
  HiLocationMarker,
  HiLockClosed,
  HiDocumentReport,
  HiX
} from "react-icons/hi";

function DashboardSidebar({ role = "guest" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, orgId, organizations } = useAuth();
  const { isMobileSidebarOpen, closeSidebar } = useSidebar();

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
            { label: DICTIONARY.NAV.EMPLOYEES, path: "/dashboard/hr/employees", icon: HiUserGroup, active: location.pathname === "/dashboard/hr/employees" },
            { label: "Departments", path: "/dashboard/hr/departments", icon: HiOfficeBuilding, active: location.pathname === "/dashboard/hr/departments" },
          ],
        },
        {
          title: "ATTENDANCE",
          icon: HiClock,
          items: [
            { label: DICTIONARY.NAV.DIRECTORY, path: "/dashboard/hr/attendance/directory", icon: HiUserGroup, active: location.pathname === "/dashboard/hr/attendance/directory" },
            { label: "Policies", path: "/dashboard/hr/attendance/policies", icon: HiClipboardList, active: location.pathname === "/dashboard/hr/attendance/policies" },
            { label: "Shifts", path: "/dashboard/hr/attendance/shifts", icon: HiClock, active: location.pathname === "/dashboard/hr/attendance/shifts" },
            { label: "Roster", path: "/dashboard/hr/attendance/roster", icon: HiUserGroup, active: location.pathname === "/dashboard/hr/attendance/roster" },
            { label: "Locations", path: "/dashboard/hr/attendance/locations", icon: HiLocationMarker, active: location.pathname === "/dashboard/hr/attendance/locations" },
            { label: "Lock Periods", path: "/dashboard/hr/attendance/lock-periods", icon: HiLockClosed, active: location.pathname === "/dashboard/hr/attendance/lock-periods" },
            { label: DICTIONARY.NAV.REPORTS, path: "/dashboard/hr/reports", icon: HiDocumentReport, active: location.pathname === "/dashboard/hr/reports" },
          ],
        },
        {
          title: "TIME OFF & LEAVES",
          icon: HiCalendar,
          items: [
            { label: "Holidays", path: "/dashboard/hr/attendance/holidays", icon: HiCalendar, active: location.pathname === "/dashboard/hr/attendance/holidays" },
            { label: "Weekly Offs", path: "/dashboard/hr/attendance/weekly-offs", icon: HiTemplate, active: location.pathname === "/dashboard/hr/attendance/weekly-offs" },
            { label: "Comp Offs", path: "/dashboard/hr/attendance/comp-offs", icon: HiClock, active: location.pathname === "/dashboard/hr/attendance/comp-offs" },
          ],
        },

      ];
    }

    return [
      {
        title: "OVERVIEW",
        icon: HiTemplate,
        items: [
          { label: "Dashboard", path: `/dashboard/${role}`, icon: HiViewGrid, active: location.pathname === `/dashboard/${role}` },
        ],
      },
      ...(role === "employee" ? [{
        title: "ATTENDANCE",
        icon: HiClock,
        items: [
          { label: "Regularizations", path: `/dashboard/${role}/attendance/regularizations`, icon: HiClock, active: location.pathname === `/dashboard/${role}/attendance/regularizations` },
        ],
      }] : []),
      ...(role === "manager" ? [{
        title: "REQUESTS",
        icon: HiClipboardList,
        items: [
          { label: "Regularization Requests", path: "/dashboard/manager/requests/regularizations", icon: HiClock, active: location.pathname === "/dashboard/manager/requests/regularizations" },
          { label: "OverTime Requests", path: "/dashboard/manager/requests/overtime", icon: HiCalendar, active: location.pathname === "/dashboard/manager/requests/overtime" },
          { label: "Anomalies", path: "/dashboard/manager/team/anomalies", icon: HiChatAlt2, active: location.pathname === "/dashboard/manager/team/anomalies" },
          { label: "Comp Off Requests", path: "/dashboard/manager/requests/comp-offs", icon: HiCalendar, active: location.pathname === "/dashboard/manager/requests/comp-offs" },
        ],
      },
      {
        title: "TEAM",
        icon: HiUserGroup,
        forceDropdown: true,
        items: [
          { label: "Status", path: "/dashboard/manager/team/today", icon: HiUserGroup, active: location.pathname === "/dashboard/manager/team/today" },
          { label: "History", path: "/dashboard/manager/team/history", icon: HiCalendar, active: location.pathname === "/dashboard/manager/team/history" },
        ],
      }] : [])
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
    <>
      {/* Mobile Backdrop */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-100 flex flex-col justify-between h-screen overflow-y-auto transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:flex-shrink-0 font-sans ${isMobileSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        {/* Top Branding Logo */}
        <div>
          <div className="px-6 py-8 flex items-center justify-between lg:justify-center">
            <Link to="/">
              <img src="/logocolored.png" alt="HR Clouds" className="h-12 w-auto object-contain" />
            </Link>
            <button 
              onClick={closeSidebar}
              className="lg:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <HiX className="w-5 h-5" />
            </button>
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
            const isSingle = section.items.length === 1 && !section.forceDropdown;

            // Single item section — render directly as a link
            if (isSingle) {
              const item = section.items[0];
              const Icon = item.icon || section.icon;
              const isActive = item.active;

              return (
                <Link
                  key={section.title}
                  to={item.path}
                  className={`flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-bold transition-all ${isActive
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
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${isActive
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

      <div className="mt-auto px-4 pb-4 space-y-2">
        <button className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-default">
          <div className="flex items-center gap-3">
            <HiQuestionMarkCircle className="w-5 h-5 text-slate-400" />
            <span>Help Center</span>
          </div>
          <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">8</span>
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-default">
          <HiCog className="w-5 h-5 text-slate-400" />
          <span>Setting</span>
        </button>
      </div>
    </aside>
    </>
  );
}

export default DashboardSidebar;
