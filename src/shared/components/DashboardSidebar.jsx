import React from "react";
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
  HiCurrencyRupee,
  HiChartBar,
  HiCog,
  HiLogout,
  HiOfficeBuilding,
  HiMail,
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
          items: [
            { label: "Dashboard", path: "/dashboard/guest", icon: HiTemplate, active: true },
            { label: "Register Org", path: "/register-organization", icon: HiOfficeBuilding },
          ],
        },
        {
          title: "HELP & SUPPORT",
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
          title: "MANAGEMENT",
          items: [
            { label: "Team", path: "/dashboard/hr", icon: HiUserGroup, active: true },
          ],
        },
      ];
    }

    return [
      {
        title: "MENU",
        items: [
          { label: "Dashboard", path: `/dashboard/${role}`, icon: HiTemplate, active: location.pathname.includes(`/dashboard/${role}`) },
        ],
      },
    ];
  };

  const navSections = getNavSections();

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
        <div className="px-4 py-6 space-y-6">
          {navSections.map((section) => (
            <div key={section.title}>
              <p className="px-3 text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-2">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.active;

                  if (item.external) {
                    return (
                      <a
                        key={item.label}
                        href={item.path}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-purple-600 hover:bg-purple-50/50 transition-all"
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </a>
                    );
                  }

                  return (
                    <Link
                      key={item.label}
                      to={item.path}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? "bg-purple-600 text-white shadow-md shadow-purple-200"
                          : "text-slate-500 hover:text-purple-600 hover:bg-purple-50/50"
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400 group-hover:text-purple-600"}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
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
