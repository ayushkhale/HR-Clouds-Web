import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import DashboardSidebar from "../components/DashboardSidebar";
import DashboardTopBar from "../components/DashboardTopBar";
import { HiDocumentText, HiOutlineFolder, HiCheckCircle, HiExclamation, HiChevronLeft, HiChevronRight, HiSearch } from "react-icons/hi";
import { attendanceAPI } from "../api";
import docsData from "../data/docs.json";

function DocumentsPage() {
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

  return (
    <div className="min-h-screen bg-white flex font-sans text-slate-800">
      <DashboardSidebar role={currentRole} />

      <div className="flex-1 flex flex-col min-w-0 border-l border-slate-100">
        <DashboardTopBar title="Documentation" />

        <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 space-y-6 max-w-6xl w-full mx-auto overflow-y-auto">
          {/* Minimal Header: Tabs & Search */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 w-full">
            <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar w-full md:w-auto pb-1 md:pb-0">
              {filteredTabs.length === 0 ? (
                <div className="px-4 py-2 text-sm text-slate-400">No matching tabs found</div>
              ) : (
                filteredTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                        isActive
                          ? "bg-indigo-50 text-indigo-700 shadow-xs"
                          : "text-slate-500 hover:text-slate-900 hover:bg-white"
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                      {tab.label}
                    </button>
                  );
                })
              )}
            </nav>

            <div className="relative w-full md:w-64 shrink-0">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search documentation..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-slate-400 transition-colors shadow-sm"
              />
            </div>
          </div>

          {/* Document Content View (No bounding boxes) */}
          <div className="flex-1 min-h-[500px]">
            <div className="w-full pb-10">
              
              <div className="mb-5 border-b border-slate-100 pb-4">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-1">
                  {tabs.find(t => t.id === activeTab)?.label}
                </h2>
                {activeContent.subtitle && (
                  <p className="text-sm text-slate-500 font-medium">
                    {activeContent.subtitle}
                  </p>
                )}
              </div>

              <div className="prose prose-slate max-w-3xl text-slate-700 text-sm sm:text-base leading-relaxed space-y-5">
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
                                  Late Grace Period: <strong>{policy.grace_minutes} minutes</strong>
                                </span>
                              </li>
                              
                              <li className="flex items-start gap-2.5">
                                <HiCheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                <span>
                                  Early Exit Allowance: <strong>{policy.early_exit_threshold_minutes} minutes</strong>
                                </span>
                              </li>

                              <li className="flex items-start gap-2.5">
                                <HiCheckCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                <span>
                                  Late Mark Threshold: <strong>{policy.late_threshold_minutes} minutes</strong> (marked as half-day if exceeded)
                                </span>
                              </li>

                              <li className="flex items-start gap-2.5">
                                <HiCheckCircle className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                                <span>
                                  Minimum Hours: <strong>{policy.half_day_min_hours} hrs</strong> (Half Day) / <strong>{policy.full_day_min_hours} hrs</strong> (Full Day)
                                </span>
                              </li>

                              <li className="flex items-start gap-2.5">
                                <HiCheckCircle className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                                <span>
                                  Regularization Window: <strong>{policy.regularization_window_days} days</strong>
                                </span>
                              </li>
                              
                              {policy.late_count_half_day_threshold && (
                                <li className="flex items-start gap-2.5">
                                  <HiExclamation className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                  <span>
                                    Deduction Rule: <strong>Half Day</strong> deducted per <strong>{policy.late_count_half_day_threshold} late marks</strong>
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
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
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
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
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
        </main>
      </div>
    </div>
  );
}

export default DocumentsPage;
