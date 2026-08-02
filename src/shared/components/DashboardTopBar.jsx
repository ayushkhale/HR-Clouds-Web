import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { HiSearch, HiBell, HiQuestionMarkCircle, HiChevronDown, HiDocumentText } from "react-icons/hi";
import PolicyDocumentModal from "./PolicyDocumentModal";

function DashboardTopBar({ title = "HR Dashboard" }) {
  const { user, role } = useAuth();
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  return (
    <header className="bg-white border-b border-slate-100 px-8 py-5 flex items-center justify-between sticky top-0 z-20 font-sans">
      {/* Title */}
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>

      {/* Right controls: Search + Notifications + Help + Profile */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Search bar with ⌘K badge */}
        <div className="relative hidden md:flex items-center bg-slate-50/80 border border-slate-200/80 rounded-full px-4 py-2 text-xs w-64 lg:w-72 focus-within:bg-white focus-within:border-purple-400 transition-all">
          <HiSearch className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search by anything..."
            className="w-full bg-transparent text-slate-800 placeholder-slate-400 outline-none text-xs"
          />
          <kbd className="hidden sm:inline-block bg-slate-200/70 text-slate-500 font-mono text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0">
            ⌘K
          </kbd>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowPolicyModal(true)}
            className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 flex items-center justify-center text-indigo-600 transition-all cursor-pointer shadow-sm group relative"
            title="Company Policies"
          >
            <HiDocumentText className="w-4.5 h-4.5 group-hover:scale-110 transition-transform" />
          </button>
          <button className="w-9 h-9 rounded-full bg-white border border-slate-200/80 hover:bg-purple-50 flex items-center justify-center text-slate-600 hover:text-purple-600 transition-all relative cursor-pointer shadow-2xs">
            <HiBell className="w-4 h-4" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#6D28D9] ring-2 ring-white" />
          </button>
          <button className="w-9 h-9 rounded-full bg-white border border-slate-200/80 hover:bg-purple-50 flex items-center justify-center text-slate-600 hover:text-purple-600 transition-all cursor-pointer shadow-2xs">
            <HiQuestionMarkCircle className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* User profile dropdown badge */}
        <div className="flex items-center gap-2.5 pl-1 cursor-pointer group">
          <div className="w-9 h-9 rounded-full bg-[#6D28D9] text-white font-bold text-xs flex items-center justify-center shadow-sm">
            {(user?.identifier || "U").charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block text-left leading-tight">
            <p className="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
              {user?.identifier?.split("@")[0] || "User"}
            </p>
            <p className="text-[11px] text-slate-400 capitalize font-medium">
              {role || "Hr"}
            </p>
          </div>
          <HiChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors hidden sm:block" />
        </div>
      </div>

      {showPolicyModal && <PolicyDocumentModal onClose={() => setShowPolicyModal(false)} />}
    </header>
  );
}

export default DashboardTopBar;
