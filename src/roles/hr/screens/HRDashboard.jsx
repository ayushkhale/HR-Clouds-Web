import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../shared/contexts/AuthContext";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import {
  HiUserGroup,
  HiMail,
  HiClock,
  HiClipboardList,
  HiCalendar,
  HiTemplate,
  HiSparkles,
  HiPlus,
  HiMinus,
  HiSearch,
  HiChevronDown,
  HiChevronLeft,
  HiChevronRight,
  HiCheckCircle,
  HiExclamationCircle,
  HiChartBar
} from "react-icons/hi";
import { attendanceAPI } from "../../../shared/api";
import Skeleton from "../../../shared/components/Skeleton";
import AttendanceDirectory from "../components/AttendanceDirectory";
import { DICTIONARY } from "../../../shared/config/dictionary";

const CustomCapsuleBar = (props) => {
  const { x, y, width, height, fill } = props;
  
  if (!width || !height || height <= 0 || Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(width) || Number.isNaN(height)) {
    return null;
  }
  
  const dashHeight = 24; // Increased height of each dash to make them longer
  const gap = 4; // Gap between dashes
  const dashes = [];
  const radius = width / 2;
  
  let currentY = y + height;
  
  while (currentY - gap - dashHeight >= y) {
    currentY -= gap + dashHeight;
    dashes.push(
      <rect key={currentY} x={x} y={currentY} width={width} height={dashHeight} fill={fill} rx={radius} ry={radius} />
    );
  }
  
  // Remainder part
  const remainder = currentY - y;
  if (remainder > gap) {
    dashes.push(
      <rect key={y} x={x} y={y} width={width} height={remainder - gap} fill={fill} rx={radius} ry={radius} />
    );
  }
  
  return <g>{dashes}</g>;
};

function HRDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Keep dummy invitations state to prevent breaking the metrics cards
  const [invitations] = useState([]);

  // Phase 7 Dynamic Data
  const [liveDashboard, setLiveDashboard] = useState(null);
  const [dashboardGraphData, setDashboardGraphData] = useState(null);
  const [workModeData, setWorkModeData] = useState(null);
  const [defaultersData, setDefaultersData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [graphLoading, setGraphLoading] = useState(false);
  const [chartDate, setChartDate] = useState(new Date());
  const [defaulterTab, setDefaulterTab] = useState('most_absent');

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchGraphData(chartDate.getMonth() + 1, chartDate.getFullYear());
  }, [chartDate]);

  const fetchInitialData = async () => {
    try {
      const today = new Date().toISOString();
      const now = new Date();
      
      const [liveRes, workModeRes, defaultersRes] = await Promise.all([
        attendanceAPI.getLiveDashboard(),
        attendanceAPI.getWorkModeDistribution(today),
        attendanceAPI.getTopDefaulters(now.getMonth() + 1, now.getFullYear())
      ]);

      if (liveRes.success) setLiveDashboard(liveRes.data);
      if (workModeRes.success) setWorkModeData(workModeRes.data);
      if (defaultersRes.success) setDefaultersData(defaultersRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGraphData = async (month, year) => {
    try {
      setGraphLoading(true);
      const graphRes = await attendanceAPI.getDashboardGraphData(month, year);
      if (graphRes.success) setDashboardGraphData(graphRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setGraphLoading(false);
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
          final_present_count: 0,
          final_absent_count: 0,
          late_count: 0
        });
      }
    }
    return data;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
        <DashboardSidebar role="hr" />
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <DashboardTopBar title="HR Dashboard" />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <Skeleton type="dashboard" />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7FB] flex font-sans text-slate-800">
      <DashboardSidebar role="hr" />

      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopBar title="HR Dashboard" />

        <main className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl w-full mx-auto overflow-y-auto">
          {/* Hero Banner (Preserved as requested) */}
          <div className="bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95] rounded-3xl p-4 sm:p-5 text-white relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
            {/* Subtle background radial pattern rings */}
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
            <div className="absolute right-12 top-12 w-64 h-64 border border-white/20 rounded-full opacity-20 pointer-events-none" />
            <div className="absolute right-24 top-24 w-40 h-40 border border-white/20 rounded-full opacity-20 pointer-events-none" />

            <div className="relative z-10 max-w-2xl space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-white text-[10px] font-semibold tracking-wide border border-white/20 backdrop-blur-xs">
                <HiSparkles className="w-3 h-3 text-purple-200" />
                HR COMMAND CENTER
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Welcome back, {user?.identifier || "HR Administrator"}
              </h1>
              <p className="text-xs sm:text-sm text-purple-100/90 font-normal">
                Manage team invitations, attendance rules, shift rosters, and holidays.
              </p>
            </div>

            <img 
              src="https://cdn.iconscout.com/strapi/hero_image_3_D_characters_33a9f45068.png?f=webp&w=312" 
              alt="HR Team Characters" 
              className="relative z-10 w-36 sm:w-56 md:w-64 object-contain drop-shadow-2xl sm:mr-8 md:mr-16 -mb-6 sm:-mb-8"
            />
          </div>

          {/* Top Analytics Section */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            
            {/* Stats Grid (Now on the Right) */}
            <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-xs border border-slate-100 grid grid-cols-2 order-2 xl:order-2 gap-y-6 sm:gap-y-0">
              {/* Stat 1 */}
              <div className="sm:border-b border-r border-slate-100 sm:pb-8 pr-4 sm:pr-8">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-slate-100 flex items-center justify-center text-slate-500 mb-3 sm:mb-4 bg-slate-50">
                  <HiUserGroup className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="flex items-end gap-3 mb-1">
                  <span className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-800">{liveDashboard?.total_employees || 0}</span>
                </div>
                <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Total Org Personnel</div>
              </div>

              {/* Stat 2 */}
              <div className="sm:border-b border-slate-100 sm:pb-8 pl-4 sm:pl-8">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-slate-100 flex items-center justify-center text-slate-500 mb-3 sm:mb-4 bg-slate-50">
                  <HiCheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3 mb-1">
                  <span className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-800 leading-none">{liveDashboard?.final_present_count || 0}</span>
                  <span className="bg-purple-50 text-purple-600 text-[9px] sm:text-xs font-bold px-2 py-0.5 rounded-full flex items-center w-max mb-1 sm:mb-1.5">
                    {DICTIONARY.STATUS.PRESENT}
                  </span>
                </div>
                <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Today's Presence</div>
              </div>

              {/* Stat 3 */}
              <div className="border-r border-t sm:border-t-0 border-slate-100 pt-6 sm:pt-8 pr-4 sm:pr-8">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 mb-3 sm:mb-4 bg-slate-50">
                  <HiExclamationCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3 mb-1">
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{liveDashboard?.final_absent_count || 0}</span>
                  <span className="bg-purple-50 text-purple-600 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center w-max mb-1 sm:mb-1">
                    {DICTIONARY.STATUS.ABSENT}
                  </span>
                </div>
                <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Absent Today</div>
              </div>

              {/* Stat 4 */}
              <div className="border-t sm:border-t-0 border-slate-100 pt-6 sm:pt-8 pl-4 sm:pl-8">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 mb-3 sm:mb-4 bg-slate-50">
                  <HiClock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3 mb-1">
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{liveDashboard?.counts?.late || 0}</span>
                  <span className="bg-purple-50 text-purple-600 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center w-max mb-1 sm:mb-1">
                    {DICTIONARY.STATUS.LATE}
                  </span>
                </div>
                <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Late Arrivals</div>
              </div>
            </div>

            {/* Chart (Now on the Left) */}
            <div className="bg-white rounded-3xl p-8 shadow-xs border border-slate-100 flex flex-col justify-between order-1 xl:order-1">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">{DICTIONARY.HEADERS.TEAM_PERFORMANCE}</h3>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                      <span className="w-2 h-2 rounded-full bg-[#8B5CF6]"></span> {DICTIONARY.STATUS.PRESENT}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                      <span className="w-2 h-2 rounded-full bg-[#A78BFA]"></span> {DICTIONARY.STATUS.LATE}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                      <span className="w-2 h-2 rounded-full bg-[#DDD6FE]"></span> {DICTIONARY.STATUS.ABSENT}
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
                {graphLoading ? (
                  <div className="w-full h-full bg-slate-100 rounded-xl animate-pulse" />
                ) : (!dashboardGraphData?.daily || dashboardGraphData.daily.length === 0) ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                    <HiChartBar className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm font-semibold">No data present</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getPaddedChartData(dashboardGraphData?.daily)} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
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
                      <Bar dataKey="final_present_count" name={DICTIONARY.STATUS.PRESENT} stackId="a" fill="#8B5CF6" barSize={8} shape={CustomCapsuleBar} />
                      <Bar dataKey="late_count" name={DICTIONARY.STATUS.LATE} stackId="a" fill="#A78BFA" barSize={8} shape={CustomCapsuleBar} />
                      <Bar dataKey="final_absent_count" name={DICTIONARY.STATUS.ABSENT} stackId="a" fill="#DDD6FE" barSize={8} shape={CustomCapsuleBar} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Layout Container (Attendance Directory) */}
          <div className="mt-8">
            <AttendanceDirectory />
          </div>


          
        </main>
      </div>
    </div>
  );
}

export default HRDashboard;
