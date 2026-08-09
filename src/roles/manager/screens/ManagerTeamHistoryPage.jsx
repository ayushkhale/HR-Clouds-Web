import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import TeamHistoryTable from "../components/TeamHistoryTable";
import { attendanceAPI } from "../../../shared/api";
import { HiSparkles, HiFilter } from "react-icons/hi";

function ManagerTeamHistoryPage() {
  const [history, setHistory] = useState([]);
  
  // Default to past 7 days
  const defaultEnd = new Date().toISOString().split('T')[0];
  const defaultStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await attendanceAPI.getManagerTeamHistory({ start_date: startDate, end_date: endDate });
      if (res.success) {
        setHistory(res.data || []);
      }
    } catch (err) { console.error(err); }
  };

  const handleFilter = (e) => {
    e.preventDefault();
    fetchHistory();
  };

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="manager" />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Team History" />

        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xs">
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            <div className="relative z-10 max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold tracking-wide border border-white/20 backdrop-blur-xs">
                <HiSparkles className="w-3.5 h-3.5 text-purple-200" />
                TEAM
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Historical Attendance
              </h1>
              <p className="text-xs sm:text-sm text-purple-100/90 font-normal">
                Review past attendance records for your team based on date ranges.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mt-6">
            <form onSubmit={handleFilter} className="flex flex-col sm:flex-row items-end gap-4 mb-2">
              <div className="flex-1 w-full">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Start Date</label>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)} 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div className="flex-1 w-full">
                <label className="block text-xs font-semibold text-slate-500 mb-1">End Date</label>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)} 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <button 
                type="submit"
                className="w-full sm:w-auto px-6 py-2 bg-primary-800 text-white font-bold text-sm rounded-lg hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
              >
                <HiFilter className="w-4 h-4" /> Filter
              </button>
            </form>
          </div>

          <TeamHistoryTable history={history} />
        </main>
      </div>
    </div>
  );
}

export default ManagerTeamHistoryPage;
