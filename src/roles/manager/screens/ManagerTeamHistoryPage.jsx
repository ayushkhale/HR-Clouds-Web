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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Historical Attendance</h1>
              <p className="text-sm text-slate-500 mt-1">Review past attendance records for your team based on date ranges.</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-6 sm:p-7 space-y-6">
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
