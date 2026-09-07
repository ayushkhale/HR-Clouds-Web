import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../shared/api";
import {
  HiClock,
  HiCalendar,
  HiChartBar,
  HiCheckCircle,
  HiXCircle,
  HiExclamationCircle,
  HiX,
  HiArrowRight,
  HiArrowLeft
} from "react-icons/hi";
import Skeleton from "../../../shared/components/Skeleton";

// Custom chart bar component to avoid external dependencies
function CustomBarChart({ data, maxValue }) {
  if (!data || data.length === 0) return <div className="text-slate-400 text-sm text-center py-4">No trend data available</div>;
  
  return (
    <div className="flex items-end justify-between h-40 gap-2 mt-4 px-2">
      {data.map((item, i) => {
        const heightPct = maxValue ? Math.max((item.value / maxValue) * 100, 5) : 5;
        return (
          <div key={i} className="flex flex-col items-center flex-1 gap-2 group">
            <div className="w-full relative flex items-end justify-center h-full rounded-t-md hover:bg-slate-50 transition-colors">
              <div 
                className="w-full max-w-[32px] bg-purple-500 rounded-t-md group-hover:bg-purple-600 transition-all duration-300" 
                style={{ height: `${heightPct}%` }}
              >
                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded font-bold whitespace-nowrap z-10 transition-opacity">
                  {item.value} {item.unit || "hrs"}
                </div>
              </div>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function DailyLogModal({ date, onClose }) {
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    attendanceAPI.getDailyLog(date)
      .then(res => setLog(res.data))
      .catch(err => setError(err.message || "Failed to load daily log."))
      .finally(() => setLoading(false));
  }, [date]);

  const fmtTime = (t) => t ? new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
  const fmtDur = (m) => m ? `${Math.floor(m / 60)}h ${m % 60}m` : "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Daily Log - {new Date(date).toLocaleDateString()}</h2>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div></div>
          ) : error ? (
             <div className="text-sm text-red-600 bg-red-50 p-4 rounded-xl">{error}</div>
          ) : !log || log.length === 0 ? (
             <div className="text-sm text-slate-500 text-center py-8">No punches found for this date.</div>
          ) : (
            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[15px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-slate-200">
              {log.map((entry, idx) => (
                <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-slate-200 text-slate-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <HiClock className="w-4 h-4" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400">{entry.type}</span>
                      <span className="text-xs font-semibold text-slate-800">{fmtTime(entry.timestamp)}</span>
                    </div>
                    {entry.device_name && <span className="text-[10px] text-slate-500">Device: {entry.device_name}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmployeeAttendancePage() {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  
  const [viewLogDate, setViewLogDate] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, histRes, weekRes, trendRes] = await Promise.all([
        attendanceAPI.getSummary(month, year),
        attendanceAPI.getHistory({ month, year }),
        attendanceAPI.getWeeklyCalendar(),
        attendanceAPI.getTrends(6) // last 6 months
      ]);
      setSummary(sumRes.data);
      setHistory(histRes.data?.records || histRes.data || []);
      setWeekly(weekRes.data || []);
      setTrends(trendRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMonthChange = (offset) => {
    let newMonth = month + offset;
    let newYear = year;
    if (newMonth > 12) { newMonth = 1; newYear += 1; }
    else if (newMonth < 1) { newMonth = 12; newYear -= 1; }
    setMonth(newMonth);
    setYear(newYear);
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const fmtTime = (t) => t ? new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
  
  const getTrendData = () => {
    if (!trends || !Array.isArray(trends)) return [];
    return trends.map(t => ({
      label: t.month,
      value: parseFloat(t.total_effective_hours || 0).toFixed(1),
      unit: "hrs"
    }));
  };
  const trendMax = Math.max(...(getTrendData().map(t => parseFloat(t.value)) || [0]), 10);

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="employee" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="My Attendance" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full space-y-8">
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiClock className="text-purple-600" /> My Attendance
              </h1>
              <p className="text-sm text-slate-500 mt-1">Track your daily attendance, hours, and trends.</p>
            </div>
            <div className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 p-1">
              <button onClick={() => handleMonthChange(-1)} className="p-2 hover:bg-slate-100 rounded-lg transition"><HiArrowLeft className="w-4 h-4 text-slate-500" /></button>
              <span className="text-sm font-bold text-slate-700 min-w-[120px] text-center">
                {new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => handleMonthChange(1)} className="p-2 hover:bg-slate-100 rounded-lg transition"><HiArrowRight className="w-4 h-4 text-slate-500" /></button>
            </div>
          </div>

          {loading ? (
            <Skeleton type="dashboard" />
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10"><HiCheckCircle className="w-12 h-12 text-emerald-500" /></div>
                  <p className="text-3xl font-extrabold text-emerald-600">{summary?.present_days || 0}</p>
                  <p className="text-xs font-bold text-slate-400 uppercase mt-2">Present Days</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10"><HiXCircle className="w-12 h-12 text-rose-500" /></div>
                  <p className="text-3xl font-extrabold text-rose-600">{summary?.absent_days || 0}</p>
                  <p className="text-xs font-bold text-slate-400 uppercase mt-2">Absent Days</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10"><HiExclamationCircle className="w-12 h-12 text-amber-500" /></div>
                  <p className="text-3xl font-extrabold text-amber-500">{summary?.late_days || 0}</p>
                  <p className="text-xs font-bold text-slate-400 uppercase mt-2">Late Days</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10"><HiClock className="w-12 h-12 text-purple-500" /></div>
                  <p className="text-3xl font-extrabold text-purple-600">{summary?.total_effective_hours || "0.0"}</p>
                  <p className="text-xs font-bold text-slate-400 uppercase mt-2">Total Hours</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: History & Weekly */}
                <div className="lg:col-span-2 space-y-8">
                  {/* Weekly Strip */}
                  <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <HiCalendar className="text-purple-500 w-5 h-5" /> This Week's Status
                    </h3>
                    <div className="flex gap-2 justify-between">
                      {weekly.map((day, i) => (
                        <div key={i} className="flex flex-col items-center flex-1 bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                          <span className="text-[10px] font-bold uppercase text-slate-400 mb-1">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                          <span className="text-sm font-extrabold text-slate-800 mb-2">{new Date(day.date).getDate()}</span>
                          <span className={`w-3 h-3 rounded-full 
                            ${day.status === 'present' ? 'bg-emerald-500' : 
                              day.status === 'absent' ? 'bg-rose-500' : 
                              day.status === 'half-day' ? 'bg-amber-500' : 
                              day.status === 'weekly-off' ? 'bg-blue-400' : 
                              day.status === 'holiday' ? 'bg-indigo-400' : 
                              'bg-slate-300'}`} 
                            title={day.status}
                          />
                        </div>
                      ))}
                      {weekly.length === 0 && <div className="text-sm text-slate-400 py-4 w-full text-center">No weekly data available.</div>}
                    </div>
                  </div>

                  {/* History Table */}
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <HiClock className="text-purple-500 w-5 h-5" /> Attendance History
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">First In</th>
                            <th className="px-6 py-4">Last Out</th>
                            <th className="px-6 py-4">Total Hrs</th>
                            <th className="px-6 py-4"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 text-sm">
                          {history.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-xs">No records found for this month.</td></tr>
                          ) : (
                            history.map(record => (
                              <tr key={record.date} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-700">{fmtDate(record.date)}</td>
                                <td className="px-6 py-4">
                                  <span className={`inline-block px-2.5 py-1 text-[10px] font-bold rounded-full border capitalize
                                    ${record.status === 'present' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                      record.status === 'absent' ? 'bg-rose-50 text-rose-700 border-rose-200' : 
                                      record.status === 'half-day' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                                      'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                    {record.status?.replace(/-/g, ' ')}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-slate-600">{fmtTime(record.clock_in_time)}</td>
                                <td className="px-6 py-4 text-slate-600">{fmtTime(record.clock_out_time)}</td>
                                <td className="px-6 py-4 text-slate-600 font-semibold">{parseFloat(record.effective_hours || 0).toFixed(2)}</td>
                                <td className="px-6 py-4 text-right">
                                  <button 
                                    onClick={() => setViewLogDate(record.date)}
                                    className="text-[10px] font-bold uppercase text-purple-600 hover:text-purple-800 bg-purple-50 px-3 py-1.5 rounded-lg transition"
                                  >
                                    View Log
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right Column: Trends */}
                <div className="space-y-8">
                  <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <HiChartBar className="text-purple-500 w-5 h-5" /> Working Hours Trend
                    </h3>
                    <CustomBarChart data={getTrendData()} maxValue={trendMax} />
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {viewLogDate && (
        <DailyLogModal date={viewLogDate} onClose={() => setViewLogDate(null)} />
      )}
    </div>
  );
}
