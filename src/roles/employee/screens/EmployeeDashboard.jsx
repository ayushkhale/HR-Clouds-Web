import React, { useState, useEffect } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import AttendanceCard from "../components/AttendanceCard";
import { attendanceAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import { HiSparkles, HiClock, HiCheckCircle, HiArrowSmUp, HiArrowSmDown, HiUserGroup, HiLogin, HiLogout } from "react-icons/hi";
import { formatDecimalHours } from "../../../shared/utils/formatUtils";

function EmployeeDashboard() {
  const { user } = useAuth();
  const [currentState, setCurrentState] = useState(null);
  const [shiftData, setShiftData] = useState(null);
  const [graphData, setGraphData] = useState(null);

  useEffect(() => {
    fetchStatus();
    fetchShift();
    fetchGraphData();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await attendanceAPI.getToday();
      if (res.success) {
        setCurrentState(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchShift = async () => {
    try {
      const res = await attendanceAPI.getMyShift();
      if (res.success) {
        setShiftData(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGraphData = async () => {
    try {
      const now = new Date();
      const res = await attendanceAPI.getGraphData(now.getMonth() + 1, now.getFullYear());
      if (res.success) {
        setGraphData(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };


  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="employee" />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Employee Portal" />

        <main className="p-6 sm:p-8 max-w-[1400px] w-full mx-auto flex-1 space-y-6">
          
          {/* Hero Banner */}
          <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-sm">
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            <div className="absolute right-12 top-12 w-64 h-64 border border-white/20 rounded-full opacity-20 pointer-events-none" />
            <div className="absolute right-24 top-24 w-40 h-40 border border-white/20 rounded-full opacity-20 pointer-events-none" />

            <div className="relative z-10 max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold tracking-wide border border-white/20 backdrop-blur-xs">
                <HiSparkles className="w-3.5 h-3.5 text-purple-200" />
                EMPLOYEE PORTAL
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-2">
                Good Afternoon, {user?.identifier?.split('@')[0] || "Employee"}!
              </h1>
              <p className="text-xs sm:text-sm text-purple-100/80 font-normal pt-2">
                Manage your daily attendance, track working history, and view your team's status.
              </p>
            </div>

            <img 
              src="https://d1i7580riw15wg.cloudfront.net/gd-assets/header-images/hero-about-us-3e62e8f762b357820226797094331409508ee0cdbd5b085cc16b9aa9cf712b09.webp" 
              alt="Employee Character" 
              className="relative z-10 w-36 sm:w-56 md:w-72 object-contain drop-shadow-2xl sm:mr-4 md:mr-8"
            />
          </div>

          {/* Row 1: Attendance Card, Combined Stats & Chart */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* 1. Today's Punch Card */}
            <div className="xl:col-span-1">
              <AttendanceCard currentState={currentState} fetchStatus={fetchStatus} shiftData={shiftData} />
            </div>

            {/* 2 & 3. Combined Stats Grid & Donut Chart */}
            <div className="xl:col-span-2 bg-white rounded-3xl shadow-xs border border-slate-100 grid grid-cols-1 md:grid-cols-2 overflow-hidden">
              
              {/* Left Side: 2x2 Stats Grid */}
              <div className="md:border-r border-b md:border-b-0 border-slate-100 grid grid-cols-2 gap-y-6 sm:gap-y-0 p-5 sm:p-8">
                {/* Average hours */}
                <div className="sm:border-b border-r border-slate-100 sm:pb-8 pr-4 sm:pr-8 flex flex-col justify-start">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-purple-100 flex items-center justify-center text-purple-600 mb-3 sm:mb-4 bg-purple-50">
                    <HiClock className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="flex items-end gap-3 mb-1">
                    <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{formatDecimalHours(graphData?.summary?.average_hours_per_day)}</span>
                  </div>
                  <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Average Hours</div>
                </div>
                {/* Total Hours */}
                <div className="sm:border-b border-slate-100 sm:pb-8 pl-4 sm:pl-8 flex flex-col justify-start">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-purple-100 flex items-center justify-center text-purple-600 mb-3 sm:mb-4 bg-purple-50">
                    <HiClock className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3 mb-1">
                    <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{formatDecimalHours(graphData?.summary?.total_hours_worked)}</span>
                  </div>
                  <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Total Hours</div>
                </div>
                {/* On-time arrival */}
                <div className="border-r border-t sm:border-t-0 border-slate-100 pt-6 sm:pt-8 pr-4 sm:pr-8 flex flex-col justify-start">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-purple-100 flex items-center justify-center text-purple-600 mb-3 sm:mb-4 bg-purple-50">
                    <HiCheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3 mb-1">
                    <span className="text-2xl sm:text-3xl font-bold tracking-tight text-purple-600 leading-none">{graphData?.summary?.punctuality_percentage || 0}%</span>
                  </div>
                  <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">On-time Arrival</div>
                </div>
                {/* Overtime */}
                <div className="border-t sm:border-t-0 border-slate-100 pt-6 sm:pt-8 pl-4 sm:pl-8 flex flex-col justify-start">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-purple-100 flex items-center justify-center text-purple-600 mb-3 sm:mb-4 bg-purple-50">
                    <HiClock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3 mb-1">
                    <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{graphData?.summary?.total_overtime_minutes || 0}m</span>
                  </div>
                  <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Overtime (mins)</div>
                </div>
              </div>

              {/* Right Side: My Attendance Donut */}
              <div className="p-6 sm:p-8 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-sm font-bold text-slate-800">My Attendance</h3>
                  <span className="text-xs font-semibold text-purple-600 cursor-pointer">View Stats</span>
                </div>
                
                <div className="flex-1 flex items-center justify-between gap-4">
                  {/* Legend */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-purple-600"></div>
                      <span className="text-xs font-bold text-slate-800">{graphData?.summary?.present_days || 0}</span>
                      <span className="text-[11px] font-medium text-slate-400">present</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                      <span className="text-xs font-bold text-slate-800">{graphData?.summary?.half_days || 0}</span>
                      <span className="text-[11px] font-medium text-slate-400">half days</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                      <span className="text-xs font-bold text-slate-800">{graphData?.summary?.late_days || 0}</span>
                      <span className="text-[11px] font-medium text-slate-400">late</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                      <span className="text-xs font-bold text-slate-800">{graphData?.summary?.absent_days || 0}</span>
                      <span className="text-[11px] font-medium text-slate-400">absent</span>
                    </div>
                  </div>

                  {/* Donut */}
                  <div className="relative w-28 h-28 flex-shrink-0 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" stroke="#E2E8F0" strokeWidth="8" fill="none" />
                      {/* Purple Segment */}
                      <circle cx="50" cy="50" r="40" stroke="#9333EA" strokeWidth="8" fill="none" strokeDasharray="251.2" strokeDashoffset="50" className="transition-all duration-1000" />
                      {/* Indigo Segment */}
                      <circle cx="50" cy="50" r="40" stroke="#818CF8" strokeWidth="8" fill="none" strokeDasharray="251.2" strokeDashoffset="180" className="transition-all duration-1000" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-sm font-extrabold text-slate-800">{graphData?.summary?.present_days || 0}</span>
                      <span className="text-[9px] font-bold text-slate-400">/{(graphData?.summary?.present_days || 0) + (graphData?.summary?.absent_days || 0)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl text-[11px] font-bold">
                  <HiCheckCircle className="w-4 h-4" />
                  Better than 91.3% employees!
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Team Table and History Table */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            
            {/* My Team */}
            <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 flex flex-col justify-center items-center text-center min-h-[300px]">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <HiUserGroup className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">My Team</h3>
              <p className="text-xs text-slate-500 max-w-xs">
                Team attendance data is not available for standard employee accounts. If this is required, please request a team endpoint from the backend.
              </p>
            </div>

            {/* Working History */}
            <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 overflow-hidden flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-slate-800">Working History</h3>
                <select className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 outline-none">
                  <option>Show all</option>
                </select>
              </div>

              {/* Mini Legend */}
              <div className="flex flex-wrap items-center gap-4 mb-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>meeting criteria</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400"></div>criteria unmet</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div>action needed</div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-separate border-spacing-y-2">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="px-4 py-2 rounded-l-xl">Date</th>
                      <th className="px-4 py-2">Late (mins)</th>
                      <th className="px-4 py-2">Overtime (mins)</th>
                      <th className="px-4 py-2 rounded-r-xl">Effective time</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs font-semibold text-slate-700">
                    {(graphData?.daily || []).slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className="inline-block bg-slate-100 text-slate-600 px-2 py-1 rounded-md mr-2">{new Date(row.date).getDate()}</span>
                          <span className={"text-slate-500"}>{new Date(row.date).toLocaleDateString()}</span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-amber-500">{row.late_minutes > 0 ? `${row.late_minutes}m` : '-'}</td>
                        <td className="px-4 py-2.5 text-purple-500 font-medium">{row.overtime_minutes > 0 ? `${row.overtime_minutes}m` : '-'}</td>
                        <td className="px-4 py-2.5 flex items-center gap-3">
                          <div>
                            <p>{row.effective_hours ? `${row.effective_hours} hours` : '-'}</p>
                            <p className="text-[9px] font-medium text-slate-400 uppercase">{row.status}</p>
                          </div>
                          <div className={`w-4 h-4 rounded-full border-2 ${row.status === 'present' ? 'border-emerald-500' : row.status === 'late' ? 'border-amber-400' : row.status === 'absent' ? 'border-rose-500' : 'border-slate-300'}`}></div>
                        </td>
                      </tr>
                    ))}
                    {(!graphData || !graphData.daily || graphData.daily.length === 0) && (
                      <tr><td colSpan="4" className="text-center py-4 text-slate-400">No records found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

            </div>

          </div>

        </main>
      </div>
    </div>
  );
}

export default EmployeeDashboard;
