import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import AttendanceCard from "../../employee/components/AttendanceCard";
import { attendanceAPI } from "../../../shared/api";
import { useAuth } from "../../../shared/contexts/AuthContext";
import Skeleton from "../../../shared/components/Skeleton";
import {
  HiSparkles,
  HiUserGroup,
  HiClock,
  HiCalendar,
  HiClipboardList,
  HiChevronDown,
  HiChevronLeft,
  HiChevronRight
} from "react-icons/hi";

function ManagerDashboard() {
  const { user } = useAuth();
  
  // For Manager's own attendance
  const [currentState, setCurrentState] = useState(null);
  const [shiftData, setShiftData] = useState(null);

  // For Manager's Team data
  const [teamSummary, setTeamSummary] = useState(null);
  const [teamGraphData, setTeamGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartDate, setChartDate] = useState(new Date());
  
  useEffect(() => {
    fetchStatus();
    fetchShift();
    fetchTeamSummaryData();
  }, []);

  useEffect(() => {
    fetchTeamGraphData(chartDate.getMonth() + 1, chartDate.getFullYear());
  }, [chartDate]);

  const fetchStatus = async () => {
    try {
      const res = await attendanceAPI.getToday();
      if (res.success) {
        setCurrentState(res.data);
      }
    } catch (err) { console.error(err); }
  };

  const fetchShift = async () => {
    try {
      const res = await attendanceAPI.getMyShift();
      if (res.success) {
        setShiftData(res.data);
      }
    } catch (err) { console.error(err); }
  };

  const fetchTeamSummaryData = async () => {
    try {
      const today = new Date().toISOString();
      const summaryRes = await attendanceAPI.getTeamSummary(today);
      if (summaryRes.success) setTeamSummary(summaryRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamGraphData = async (month, year) => {
    try {
      const graphRes = await attendanceAPI.getTeamGraphData(month, year);
      if (graphRes.success) setTeamGraphData(graphRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrevMonth = () => {
    setChartDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  };

  const handleNextMonth = () => {
    setChartDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  };

  // Helper to ensure the bar chart has at least 15 days on the X-axis
  const getPaddedChartData = (dailyData) => {
    if (!dailyData || dailyData.length === 0) return [];
    const data = [...dailyData];
    if (data.length < 15) {
      let lastDate = new Date(data[data.length - 1].date);
      for (let i = data.length; i < 15; i++) {
        lastDate.setDate(lastDate.getDate() + 1);
        data.push({
          date: lastDate.toISOString().split('T')[0],
          present_count: 0,
          absent_count: 0,
          late_count: 0
        });
      }
    }
    return data;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
        <DashboardSidebar role="manager" />
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <DashboardTopBar title="Manager Dashboard" />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <Skeleton type="dashboard" />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="manager" />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="Manager Workspace" />

        <main className="p-6 sm:p-8 space-y-6 max-w-7xl w-full mx-auto overflow-y-auto">
          {/* Hero Banner */}
          <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xs">
            {/* Subtle background radial pattern rings */}
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            <div className="absolute right-12 top-12 w-64 h-64 border border-white/20 rounded-full opacity-20 pointer-events-none" />
            <div className="absolute right-24 top-24 w-40 h-40 border border-white/20 rounded-full opacity-20 pointer-events-none" />

            <div className="relative z-10 max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] font-semibold tracking-wide border border-white/20 backdrop-blur-xs">
                <HiSparkles className="w-3.5 h-3.5 text-purple-200" />
                MANAGER WORKSPACE
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Welcome back, {user?.identifier || "Manager"}
              </h1>
              <p className="text-xs sm:text-sm text-purple-100/90 font-normal">
                Review pending requests, monitor team attendance, and track performance in real-time.
              </p>
            </div>

            <img 
              src="https://cdn3d.iconscout.com/3d/premium/thumb/empresario-haciendo-meditacion-3d-icon-png-download-8179740.png" 
              alt="Manager Character" 
              className="relative z-10 w-28 sm:w-40 md:w-48 object-contain drop-shadow-2xl sm:mr-8 md:mr-16 -mb-6 sm:-mb-8"
            />
          </div>

          {/* Middle Layout Container */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            
            {/* Clock-In Card (Col span 2) */}
            <div className="lg:col-span-2 flex flex-col">
              <AttendanceCard currentState={currentState} fetchStatus={fetchStatus} shiftData={shiftData} />
            </div>

            {/* Team Stats Chart Card (Col span 1) */}
            <div className="lg:col-span-1 bg-white rounded-3xl p-8 shadow-xs border border-slate-100 flex flex-col h-full">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">Team Stats</h3>
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 cursor-pointer hover:text-slate-700">
                  Today <HiChevronDown />
                </span>
              </div>

              {/* CSS Donut Chart */}
              <div className="relative w-40 h-40 mx-auto mb-8">
                <div 
                  className="w-full h-full rounded-full flex items-center justify-center relative"
                  style={{
                    background: "conic-gradient(#9333ea 0% 83%, #f1f5f9 83% 100%)"
                  }}
                >
                  <div className="w-[115px] h-[115px] bg-white rounded-full flex flex-col items-center justify-center shadow-inner relative z-10">
                    <span className="text-3xl font-extrabold text-slate-800 tracking-tight">{teamSummary?.team_size || 0}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Total Team</span>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="mt-auto space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Present</span>
                  </div>
                  <span className="text-sm font-bold text-slate-800">{teamSummary?.counts?.present || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-200"></span>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Absent/Leave</span>
                  </div>
                  <span className="text-sm font-bold text-slate-800">{(teamSummary?.counts?.absent || 0) + (teamSummary?.counts?.on_leave || 0)}</span>
                </div>
              </div>
            </div>
            
          </div>

          {/* Top Analytics Container */}
          <div className="bg-white rounded-3xl p-8 shadow-xs border border-slate-100 flex flex-col xl:flex-row gap-12">
            
            {/* Left Side: 2x2 Stats Grid */}
            <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-10">
              {/* Stat 1 */}
              <div>
                <div className="w-12 h-12 rounded-full border border-slate-100 flex items-center justify-center text-slate-500 mb-4 bg-slate-50">
                  <HiUserGroup className="w-5 h-5" />
                </div>
                <div className="flex items-end gap-3 mb-1">
                  <span className="text-4xl font-bold tracking-tight text-slate-800">{teamSummary?.team_size || 0}</span>
                </div>
                <div className="text-sm font-semibold text-slate-500 mt-2">Total Team Members</div>
              </div>

              {/* Stat 2 */}
              <div>
                <div className="w-12 h-12 rounded-full border border-slate-100 flex items-center justify-center text-slate-500 mb-4 bg-slate-50">
                  <HiClock className="w-5 h-5" />
                </div>
                <div className="flex items-end gap-3 mb-1">
                  <span className="text-4xl font-bold tracking-tight text-slate-800">{teamSummary?.counts?.present || 0}</span>
                  <span className="bg-purple-50 text-purple-600 text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 flex items-center">
                    <svg className="w-2.5 h-2.5 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                    Present
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-500 mt-2">Today's Attendance</div>
              </div>

              {/* Stat 3 */}
              <div className="pt-2">
                <div className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 mb-4 bg-slate-50">
                  <HiCalendar className="w-4 h-4" />
                </div>
                <div className="flex items-end gap-3 mb-1">
                  <span className="text-3xl font-bold tracking-tight text-slate-800">{teamSummary?.counts?.on_leave || 0}</span>
                </div>
                <div className="text-sm font-semibold text-slate-500 mt-2">On Leave Today</div>
              </div>

              {/* Stat 4 */}
              <div className="pt-2">
                <div className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 mb-4 bg-slate-50">
                  <HiClipboardList className="w-4 h-4" />
                </div>
                <div className="flex items-end gap-3 mb-1">
                  <span className="text-3xl font-bold tracking-tight text-slate-800">{teamSummary?.counts?.absent || 0}</span>
                </div>
                <div className="text-sm font-semibold text-slate-500 mt-2">Absent Today</div>
              </div>
            </div>

            {/* Right Side: Chart Placeholder */}
            <div className="flex-1 xl:max-w-xl flex flex-col justify-between pt-2">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Team Attendance Trends</h3>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                      <span className="w-2 h-2 rounded-full bg-purple-700"></span> Present
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                      <span className="w-2 h-2 rounded-full bg-purple-400"></span> Late/Leave
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600">
                  <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors">
                    <HiChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="w-20 text-center select-none">
                    {chartDate.toLocaleString('default', { month: 'short', year: 'numeric' })}
                  </span>
                  <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors">
                    <HiChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="relative w-full h-56 mt-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getPaddedChartData(teamGraphData?.daily)} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                      tickFormatter={(val) => new Date(val).getDate()}
                      interval="preserveStartEnd"
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}
                    />
                    <Bar dataKey="present_count" name="Present" stackId="a" fill="#6D28D9" barSize={16} radius={[0, 0, 2, 2]} />
                    <Bar dataKey="late_count" name="Late/Leave" stackId="a" fill="#A78BFA" barSize={16} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          
        </main>
      </div>
    </div>
  );
}

export default ManagerDashboard;
