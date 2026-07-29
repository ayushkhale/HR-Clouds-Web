import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { HiSearch, HiBell, HiQuestionMarkCircle } from "react-icons/hi";

function DashboardTopBar({ title = "Dashboard" }) {
  const { user, role } = useAuth();

  return (
    <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between sticky top-0 z-20 font-sans">
      {/* Title */}
      <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">{title}</h1>

      {/* Right controls: Search + Notifications + Profile */}
      <div className="flex items-center gap-4">
        {/* Search bar */}
        <div className="relative hidden md:flex items-center">
          <input
            type="text"
            placeholder="Search by anything..."
            className="w-64 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 pr-10 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all"
          />
          <button className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center cursor-pointer hover:bg-purple-700 transition-colors">
            <HiSearch className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-100 flex items-center justify-center text-slate-500 hover:text-purple-600 transition-all relative cursor-pointer">
            <HiBell className="w-4 h-4" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-purple-600 ring-2 ring-white" />
          </button>
          <button className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-100 flex items-center justify-center text-slate-500 hover:text-purple-600 transition-all cursor-pointer">
            <HiQuestionMarkCircle className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* User avatar badge */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-sm shadow-purple-200">
            {(user?.identifier || "U").charAt(0).toUpperCase()}
          </div>
          <div className="hidden lg:block text-left">
            <p className="text-xs font-bold text-slate-800 leading-none">{user?.identifier?.split("@")[0] || "User"}</p>
            <p className="text-[10px] text-purple-600 font-semibold capitalize mt-0.5">{role || "Member"}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

export default DashboardTopBar;
