import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { HiX, HiDocumentText, HiOutlineFolder, HiCheckCircle, HiExclamation, HiChevronLeft, HiChevronRight, HiSearch } from "react-icons/hi";
import { attendanceAPI } from "../api";
import docsData from "../data/docs.json";

function PolicyDocumentModal({ onClose }) {
  const { role: authRole } = useAuth();
  const location = useLocation();

  let currentRole = "employee";
  if (location.pathname.includes("/dashboard/hr") || authRole === "hr") {
    currentRole = "hr";
  } else if (location.pathname.includes("/dashboard/manager") || authRole === "manager") {
    currentRole = "manager";
  }

  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [attendancePolicies, setAttendancePolicies] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (activeTab === "attendance") {
      fetchAttendancePolicies();
    }
  }, [activeTab]);

  async function fetchAttendancePolicies() {
    try {
      setLoading(true);
      const res = await attendanceAPI.getPolicies();
      setAttendancePolicies(res?.data || []);
    } catch (err) {
      console.error("Failed to fetch policies:", err);
    } finally {
      setLoading(false);
    }
  }

  const tabs = docsData.tabs.map(tab => ({
    ...tab,
    icon: tab.id === "attendance" ? HiDocumentText : HiOutlineFolder
  }));

  const filteredTabs = tabs.filter(tab => {
    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    if (tab.label.toLowerCase().includes(lowerQuery)) return true;
    
    const content = docsData.content[tab.id]?.[currentRole];
    if (content) {
      if (content.intro?.toLowerCase().includes(lowerQuery)) return true;
      if (content.paragraphs?.some(p => p.toLowerCase().includes(lowerQuery))) return true;
      if (content.duties?.some(d => d.toLowerCase().includes(lowerQuery))) return true;
    }
    return false;
  });

  const currentIndex = tabs.findIndex((t) => t.id === activeTab);
  const prevTab = currentIndex > 0 ? tabs[currentIndex - 1] : null;
  const nextTab = currentIndex < tabs.length - 1 ? tabs[currentIndex + 1] : null;

  const roleTitles = {
    hr: "HR Administrator Perspective",
    manager: "Managerial & Team Lead Perspective",
    employee: "Employee Self-Service Perspective",
  };

  const activeContent = docsData.content[activeTab]?.[currentRole] || {};

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6 font-sans">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-5xl h-[90vh] sm:h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 sm:px-8 sm:py-4 border-b border-slate-100 bg-white z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
              <HiDocumentText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900 text-base sm:text-lg">Organization Policies</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold capitalize">
                  {currentRole} Mode
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">{roleTitles[currentRole]}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Narrow Sidebar */}
          <div className="w-48 sm:w-52 border-r border-slate-100 bg-slate-50/50 flex flex-col shrink-0 overflow-y-auto">
            <div className="p-3">
              <div className="relative">
                <HiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search docs..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-400"
                />
              </div>
            </div>
            <div className="px-3 pb-2 pt-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Tabs
            </div>
            <div className="px-2 space-y-1 pb-4">
              {filteredTabs.length === 0 ? (
                <div className="px-3 py-4 text-xs text-slate-400 text-center">No results found</div>
              ) : (
                filteredTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-indigo-200" : "text-slate-400"}`} />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              }))}
            </div>
          </div>

          {/* Main Document Viewer */}
          <div className="flex-1 flex flex-col bg-white overflow-y-auto relative">
            <div className="max-w-2xl mx-auto w-full px-6 py-8 sm:px-10 sm:py-10 flex-1">
              
              <div className="mb-6 border-b border-slate-100 pb-5">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
                  {tabs.find(t => t.id === activeTab)?.label}
                </h1>
                {activeContent.subtitle && (
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">
                    {activeContent.subtitle}
                  </p>
                )}
              </div>

              <div className="prose prose-slate max-w-none text-slate-700 text-sm sm:text-base leading-relaxed space-y-6">
                {activeTab === "attendance" ? (
                  <div className="space-y-6">
                    <p>{activeContent.intro}</p>

                    {loading ? (
                      <div className="animate-pulse space-y-4">
                        <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                        <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                      </div>
                    ) : attendancePolicies.length > 0 ? (
                      attendancePolicies.map((policy, idx) => (
                        <div key={policy.id || idx} className="bg-indigo-50/50 rounded-2xl p-5 border border-indigo-100 shadow-sm">
                          <h3 className="text-lg font-bold text-indigo-900 mt-0 mb-3">{policy.name}</h3>
                          
                          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3 text-xs sm:text-sm">
                            <p className="font-semibold text-slate-800 m-0">Active Policy Parameters:</p>
                            
                            <ul className="space-y-2.5 m-0 list-none pl-0">
                              <li className="flex items-start gap-2.5">
                                <HiCheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                <span>
                                  Late Grace Period: <strong>{policy.late_grace_time_minutes} minutes</strong>
                                </span>
                              </li>
                              
                              <li className="flex items-start gap-2.5">
                                <HiCheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                <span>
                                  Early Exit Allowance: <strong>{policy.early_leave_grace_time_minutes} minutes</strong>
                                </span>
                              </li>

                              <li className="flex items-start gap-2.5">
                                <HiCheckCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                <span>
                                  Half-Day Threshold: <strong>{policy.mark_half_day_after_late_minutes} minutes</strong>
                                </span>
                              </li>
                              
                              {policy.deduct_leave_for_late_marks && (
                                <li className="flex items-start gap-2.5">
                                  <HiExclamation className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                  <span>
                                    Deduction Rule: <strong>{policy.leave_deduction_amount} day(s)</strong> per <strong>{policy.late_marks_for_deduction} late marks</strong>
                                  </span>
                                </li>
                              )}
                            </ul>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 text-center text-xs sm:text-sm">
                        <p className="text-slate-500 mb-0 font-medium">Standard attendance rules apply.</p>
                      </div>
                    )}

                    {activeContent.duties && (
                      <>
                        <h3 className="font-bold text-slate-900 mt-6 mb-3 text-sm sm:text-base">Responsibilities</h3>
                        <ul className="space-y-2.5 list-none pl-0 text-xs sm:text-sm">
                          {activeContent.duties.map((duty, i) => (
                            <li key={i} className="flex items-start gap-2.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div>
                              <span>{duty}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeContent.paragraphs?.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Next / Previous Navigation Footer */}
              <div className="mt-12 pt-6 border-t border-slate-100 flex items-center justify-between gap-4">
                <button
                  disabled={!prevTab}
                  onClick={() => prevTab && setActiveTab(prevTab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    prevTab
                      ? "bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 cursor-pointer"
                      : "opacity-40 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <HiChevronLeft className="w-4 h-4" />
                  <span>Previous: {prevTab?.label || "None"}</span>
                </button>

                <button
                  disabled={!nextTab}
                  onClick={() => nextTab && setActiveTab(nextTab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    nextTab
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs cursor-pointer"
                      : "opacity-40 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <span>Next: {nextTab?.label || "End"}</span>
                  <HiChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default PolicyDocumentModal;
