import React, { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import AttendanceCard from "../../employee/components/AttendanceCard";
import { attendanceAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import Skeleton from "../../../shared/components/Skeleton";
import {
  HiSparkles, HiUserGroup, HiClock,
  HiChevronLeft, HiChevronRight,
  HiCheckCircle, HiExclamationCircle, HiChartBar,
} from "react-icons/hi";



/* ─── Team Directory Table (AttendanceDirectory-style) ───────────── */
function TeamDirectoryTable() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [records, setRecords] = useState([]);
  const [tableLoading, setTableLoading] = useState(true);

  useEffect(() => { fetchTeamForDate(); }, [currentDate]);

  const fetchTeamForDate = async () => {
    setTableLoading(true);
    try {
      const res = await attendanceAPI.getManagerTeamToday();
      setRecords(res.success ? (res.data || []) : []);
    } catch (err) { console.error(err); setRecords([]); }
    finally { setTableLoading(false); }
  };

  const getBadge = (status) => {
    if (!status) return { cls: "bg-slate-100 text-slate-500 border-slate-200", label: "Unknown" };
    const s = status.toLowerCase();
    if (s === 'completed' || s === 'present') return { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Present" };
    if (s === 'in_progress')                  return { cls: "bg-blue-50 text-blue-700 border-blue-200", label: "Active" };
    if (s.includes('break'))                  return { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "On Break" };
    if (s === 'absent')                       return { cls: "bg-rose-50 text-rose-700 border-rose-200", label: "Absent" };
    if (s === 'late')                         return { cls: "bg-orange-50 text-orange-700 border-orange-200", label: "Late" };
    if (s === 'on_leave')                     return { cls: "bg-purple-50 text-purple-700 border-purple-200", label: "On Leave" };
    return { cls: "bg-slate-100 text-slate-600 border-slate-200", label: status.replace(/_/g, ' ') };
  };

  const fmtTime = (iso) => {
    if (!iso) return <span className="text-xs text-slate-400 italic">—</span>;
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getName = (mem) =>
    mem.user?.profile?.display_name ||
    `${mem.user?.profile?.first_name || ''} ${mem.user?.profile?.last_name || ''}`.trim() ||
    mem.user?.identifier || 'Unknown';

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800">Team Status Today</h2>
        </div>
        <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-600 bg-white shadow-xs">
          <button onClick={() => setCurrentDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 1); return d; })} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
            <HiChevronLeft className="w-4 h-4" />
          </button>
          <span className="w-36 text-center select-none">
            {currentDate.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </span>
          <button
            onClick={() => setCurrentDate(prev => { const d = new Date(prev); if (d.toDateString() === new Date().toDateString()) return prev; d.setDate(d.getDate() + 1); return d; })}
            disabled={currentDate.toDateString() === new Date().toDateString()}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <HiChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {tableLoading ? <Skeleton type="table" rows={5} /> : (
        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden flex-1">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500 font-semibold">
                <tr>
                  <th className="px-6 py-4 text-xs uppercase tracking-wide">Employee</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-wide">Status</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-wide">Clock In</th>
                  <th className="px-6 py-4 text-xs uppercase tracking-wide">Clock Out</th>
                  <th className="px-6 py-4 text-right text-xs uppercase tracking-wide">Lateness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {records.length === 0 ? (
                  <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-400 font-medium">No team attendance records for this date.</td></tr>
                ) : records.map((mem, idx) => {
                  const badge = getBadge(mem.status);
                  const name = getName(mem);
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{name.charAt(0).toUpperCase()}</div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{name}</p>
                            {mem.user?.identifier && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[160px]">{mem.user.identifier}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 w-max border ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-700">{fmtTime(mem.clock_in_time)}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-700">{fmtTime(mem.clock_out_time)}</td>
                      <td className="px-6 py-4 text-right">
                        {mem.late_minutes > 0
                          ? <span className="text-rose-600 font-bold text-xs">+{mem.late_minutes}m late</span>
                          : <span className="text-emerald-600 font-bold text-xs">On Time</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Manager Dashboard ──────────────────────────────────────────── */
function ManagerDashboard() {
  const { user } = useAuth();
  const [currentState, setCurrentState]   = useState(null);
  const [shiftData, setShiftData]         = useState(null);
  const [teamSummary, setTeamSummary]     = useState(null);
  const [teamGraphData, setTeamGraphData] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [graphLoading, setGraphLoading]   = useState(false);
  const [chartDate, setChartDate]         = useState(new Date());
  const [chartPage, setChartPage]         = useState(0);
  const chartScrollTimeout                = useRef(0);

  useEffect(() => { fetchStatus(); fetchShift(); fetchTeamSummaryData(); }, []);
  useEffect(() => { fetchTeamGraphData(chartDate.getMonth() + 1, chartDate.getFullYear()); }, [chartDate]);

  const fetchStatus = async () => {
    try {
      const res = await attendanceAPI.getToday();
      console.log("attendanceAPI.getToday() RESPONSE:", res);
      if (res.success) setCurrentState(res.data);
    } catch (err) {
      console.error(err);
    }
  };
  const fetchShift = async () => {
    try { const res = await attendanceAPI.getMyShift(); if (res.success) setShiftData(res.data); } catch (err) { console.error(err); }
  };
  const fetchTeamSummaryData = async () => {
    try { const res = await attendanceAPI.getTeamSummary(new Date().toISOString()); if (res.success) setTeamSummary(res.data); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };
  const fetchTeamGraphData = async (month, year) => {
    try { setGraphLoading(true); const res = await attendanceAPI.getTeamGraphData(month, year); if (res.success) setTeamGraphData(res.data); }
    catch (err) { console.error(err); } finally { setGraphLoading(false); }
  };

  const handlePrevMonth = () => {
    setChartDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; });
    setChartPage(0);
  };
  const handleNextMonth = () => {
    setChartDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; });
    setChartPage(0);
  };

  const handleChartWheel = (e) => {
    const now = Date.now();
    if (now - chartScrollTimeout.current < 400) return;

    if (e.deltaX > 15 || e.deltaY > 15) {
      if (chartPage < totalChartPages - 1) {
        setChartPage(p => p + 1);
        chartScrollTimeout.current = now;
      }
    } else if (e.deltaX < -15 || e.deltaY < -15) {
      if (chartPage > 0) {
        setChartPage(p => p - 1);
        chartScrollTimeout.current = now;
      }
    }
  };

  const getNormalizedChartData = (dailyData) => {
    if (!dailyData || dailyData.length === 0) return [];
    return dailyData.map(d => ({ 
      ...d, 
      on_time_count: Math.max(0, (d.final_present_count || 0) - (d.late_count || 0)) 
    }));
  };

  const getPaginatedChartData = (dailyData) => {
    const data = getNormalizedChartData(dailyData);
    if (data.length === 0) return [];
    const itemsPerPage = Math.ceil(data.length / 2);
    const startIdx = chartPage * itemsPerPage;
    return data.slice(startIdx, startIdx + itemsPerPage);
  };

  const totalChartPages = teamGraphData?.daily && teamGraphData.daily.length > 0 ? 2 : 1;

  if (loading) return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="manager" />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <DashboardTopBar title="Manager Dashboard" />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"><Skeleton type="dashboard" /></main>
      </div>
    </div>
  );

  const presentCount = teamSummary?.final_present_count || 0;
  const absentCount  = teamSummary?.final_absent_count  || 0;
  const lateCount    = teamSummary?.counts?.late        || 0;
  const teamSize     = teamSummary?.team_size           || 0;

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="manager" />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Manager Workspace" />
        <main className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl w-full mx-auto overflow-y-auto">

          {/* Hero Banner */}
          <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-3xl p-4 sm:p-6 text-white relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            <div className="absolute right-12 top-12 w-64 h-64 border border-white/20 rounded-full opacity-20 pointer-events-none" />
            <div className="absolute right-24 top-24 w-40 h-40 border border-white/20 rounded-full opacity-20 pointer-events-none" />
            <div className="relative z-10 max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold tracking-wide border border-white/20 backdrop-blur-xs">
                <HiSparkles className="w-3.5 h-3.5 text-purple-200" /> MANAGER WORKSPACE
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Welcome back, {user?.identifier || "Manager"}</h1>
              <p className="text-xs sm:text-sm text-purple-100/90 font-normal">Monitor team attendance, review pending requests, and track your team's performance.</p>
            </div>
            <img src="https://cdn3d.iconscout.com/3d/premium/thumb/empresario-haciendo-meditacion-3d-icon-png-download-8179740.png" alt="Manager Character" className="relative z-10 w-24 sm:w-32 md:w-40 object-contain drop-shadow-2xl sm:mr-4 md:mr-8 -mb-2 sm:-mb-4" />
          </div>

          {/* Top Row: My Attendance & Team Directory */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* My Attendance (Clock In / Out) */}
            <div className="lg:col-span-1 flex flex-col">
              <div className="mb-4">
                <h2 className="text-xl font-bold tracking-tight text-slate-800">My Attendance</h2>
              </div>
              <div className="flex-1 flex flex-col">
                <AttendanceCard currentState={currentState} fetchStatus={fetchStatus} shiftData={shiftData} />
              </div>
            </div>

            {/* Team Directory */}
            <div className="lg:col-span-2 flex flex-col">
              {/* To align the tables nicely with the heading of My Attendance */}
              <div className="h-full">
                <TeamDirectoryTable />
              </div>
            </div>
          </div>

          {/* Bottom Row: Stats + Chart */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* Stats Grid */}
            <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-xs border border-slate-100 grid grid-cols-2 order-2 xl:order-2 gap-y-6 sm:gap-y-0">
              <div className="sm:border-b border-r border-slate-100 sm:pb-8 pr-4 sm:pr-8">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-slate-100 flex items-center justify-center text-slate-500 mb-3 sm:mb-4 bg-slate-50"><HiUserGroup className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                <div className="flex items-end gap-3 mb-1"><span className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-800">{teamSize}</span></div>
                <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Total Team Members</div>
              </div>
              <div className="sm:border-b border-slate-100 sm:pb-8 pl-4 sm:pl-8">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-slate-100 flex items-center justify-center text-slate-500 mb-3 sm:mb-4 bg-slate-50"><HiCheckCircle className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3 mb-1">
                  <span className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-800 leading-none">{presentCount}</span>
                  <span className="bg-purple-50 text-purple-600 text-[9px] sm:text-xs font-bold px-2 py-0.5 rounded-full flex items-center w-max mb-1 sm:mb-1.5">Present</span>
                </div>
                <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Today's Presence</div>
              </div>
              <div className="border-r border-t sm:border-t-0 border-slate-100 pt-6 sm:pt-8 pr-4 sm:pr-8">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 mb-3 sm:mb-4 bg-slate-50"><HiExclamationCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3 mb-1">
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{absentCount}</span>
                  <span className="bg-rose-50 text-rose-600 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center w-max mb-1 sm:mb-1">Absent</span>
                </div>
                <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Absent Today</div>
              </div>
              <div className="border-t sm:border-t-0 border-slate-100 pt-6 sm:pt-8 pl-4 sm:pl-8">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 mb-3 sm:mb-4 bg-slate-50"><HiClock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3 mb-1">
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{lateCount}</span>
                  <span className="bg-amber-50 text-amber-600 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center w-max mb-1 sm:mb-1">Late</span>
                </div>
                <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Late Arrivals</div>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-white rounded-3xl p-8 shadow-xs border border-slate-100 flex flex-col justify-between order-1 xl:order-1">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Team Attendance Trends</h3>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><span className="w-2 h-2 rounded-full bg-[#8B5CF6]"></span> On Time</span>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><span className="w-2 h-2 rounded-full bg-[#F59E0B]"></span> Late</span>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><span className="w-2 h-2 rounded-full bg-[#DDD6FE]"></span> Absent</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {/* Page Pagination */}
                  <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600">
                    <button onClick={() => setChartPage(p => Math.max(0, p - 1))} disabled={chartPage === 0} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400 transition-colors">
                      <HiChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-center select-none w-14">Pg {chartPage + 1}/{totalChartPages}</span>
                    <button onClick={() => setChartPage(p => Math.min(totalChartPages - 1, p + 1))} disabled={chartPage >= totalChartPages - 1} className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-400 transition-colors">
                      <HiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Month Pagination */}
                  <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600">
                    <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors"><HiChevronLeft className="w-4 h-4" /></button>
                    <span className="w-20 text-center select-none">{chartDate.toLocaleString('default', { month: 'short', year: 'numeric' })}</span>
                    <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors"><HiChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
              <div className="relative w-full h-56 mt-auto" onWheel={handleChartWheel}>
                {graphLoading ? (
                  <div className="w-full h-full bg-slate-100 rounded-xl animate-pulse" />
                ) : (!teamGraphData?.daily || teamGraphData.daily.length === 0) ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                    <HiChartBar className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm font-semibold">No data present</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getPaginatedChartData(teamGraphData?.daily)} margin={{ top: 5, right: 0, left: -20, bottom: 0 }} barGap={2} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} tickFormatter={(val) => new Date(val).getDate()} interval="preserveStartEnd" />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} />
                      <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }} />
                      <Bar dataKey="on_time_count" name="On Time" fill="#8B5CF6" maxBarSize={8} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="late_count" name="Late" fill="#F59E0B" maxBarSize={8} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="final_absent_count" name="Absent" fill="#DDD6FE" maxBarSize={8} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

export default ManagerDashboard;
