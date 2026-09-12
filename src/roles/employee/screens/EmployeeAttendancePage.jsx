import React, { useState, useEffect, useCallback } from "react";
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
    <>
        <DashboardTopBar title="My Attendance" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-[1400px] mx-auto w-full space-y-6">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                  <HiClock className="w-5 h-5" />
                </div>
                My Attendance
              </h1>
              <p className="text-sm text-slate-500 mt-1">Track your daily attendance, hours, and trends.</p>
            </div>
            
            <div className="flex items-center gap-2 bg-white rounded-2xl border border-slate-100 p-1.5 shadow-xs">
              <button onClick={() => handleMonthChange(-1)} className="p-2 hover:bg-purple-50 hover:text-purple-600 rounded-xl transition text-slate-500"><HiArrowLeft className="w-4 h-4" /></button>
              <span className="text-sm font-bold text-slate-700 min-w-[140px] text-center uppercase tracking-wide">
                {new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => handleMonthChange(1)} className="p-2 hover:bg-purple-50 hover:text-purple-600 rounded-xl transition text-slate-500"><HiArrowRight className="w-4 h-4" /></button>
            </div>
          </div>

          {loading ? (
            <Skeleton type="dashboard" />
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-start">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-purple-100 flex items-center justify-center text-purple-600 mb-3 sm:mb-4 bg-purple-50">
                    <HiCheckCircle className="w-5 h-5" />
                  </div>
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{summary?.present_days || 0}</span>
                  <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Present Days</div>
                </div>
                
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-start">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-purple-100 flex items-center justify-center text-purple-600 mb-3 sm:mb-4 bg-purple-50">
                    <HiXCircle className="w-5 h-5" />
                  </div>
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{summary?.absent_days || 0}</span>
                  <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Absent Days</div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-start">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-purple-100 flex items-center justify-center text-purple-600 mb-3 sm:mb-4 bg-purple-50">
                    <HiExclamationCircle className="w-5 h-5" />
                  </div>
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{summary?.late_days || 0}</span>
                  <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Late Days</div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xs flex flex-col justify-start">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-purple-100 flex items-center justify-center text-purple-600 mb-3 sm:mb-4 bg-purple-50">
                    <HiClock className="w-5 h-5" />
                  </div>
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 leading-none">{summary?.total_effective_hours || "0.0"}</span>
                  <div className="text-[10px] sm:text-sm font-semibold text-slate-500 mt-1 sm:mt-2">Total Hours</div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Left Column: History & Weekly */}
                <div className="xl:col-span-2 space-y-6">
                  {/* Weekly Strip */}
                  <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <HiCalendar className="text-purple-600 w-5 h-5" /> This Week's Status
                    </h3>
                    <div className="flex gap-2 justify-between">
                      {(Array.isArray(weekly) ? weekly : []).map((day, i) => (
                        <div key={i} className="flex flex-col items-center flex-1 bg-purple-50/40 p-3 sm:p-4 rounded-2xl border border-purple-100/50 text-center hover:bg-purple-50 transition-colors">
                          <span className="text-[10px] font-bold uppercase text-purple-500 mb-1">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                          <span className="text-sm sm:text-lg font-extrabold text-slate-800 mb-2">{new Date(day.date).getDate()}</span>
                          <span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full 
                            ${day.status === 'present' ? 'bg-purple-600' : 
                              day.status === 'absent' ? 'bg-slate-300' : 
                              day.status === 'half-day' ? 'bg-indigo-400' : 
                              day.status === 'weekly-off' ? 'bg-purple-200' : 
                              day.status === 'holiday' ? 'bg-purple-300' : 
                              'bg-rose-500'}`} 
                            title={day.status}
                          />
                        </div>
                      ))}
                      {(!Array.isArray(weekly) || weekly.length === 0) && <div className="text-sm text-slate-400 py-4 w-full text-center">No weekly data available.</div>}
                    </div>
                  </div>

                  {/* History Table */}
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden flex flex-col">
                    <div className="px-6 py-6 border-b border-slate-100">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <HiClock className="text-purple-600 w-5 h-5" /> Attendance History
                      </h3>
                    </div>
                    <div className="overflow-x-auto p-4 sm:p-6 pt-0">
                      <table className="w-full text-left border-separate border-spacing-y-2">
                        <thead>
                          <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            <th className="px-4 py-2 rounded-l-xl">Date</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2">First In</th>
                            <th className="px-4 py-2">Last Out</th>
                            <th className="px-4 py-2">Total Hrs</th>
                            <th className="px-4 py-2 rounded-r-xl"></th>
                          </tr>
                        </thead>
                        <tbody className="text-xs font-semibold text-slate-700">
                          {history.length === 0 ? (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">No records found for this month.</td></tr>
                          ) : (
                            history.map(record => (
                              <tr key={record.date} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3">
                                  <span className="inline-block bg-slate-100 text-slate-600 px-2 py-1 rounded-md mr-2">{new Date(record.date).getDate()}</span>
                                  <span className="text-slate-500">{new Date(record.date).toLocaleDateString()}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-block px-2.5 py-1 text-[10px] font-bold rounded-full capitalize
                                    ${record.status === 'present' ? 'bg-purple-100 text-purple-700' : 
                                      record.status === 'absent' ? 'bg-slate-100 text-slate-600' : 
                                      record.status === 'half-day' ? 'bg-indigo-100 text-indigo-700' : 
                                      record.status === 'late' ? 'bg-rose-100 text-rose-700' :
                                      'bg-purple-50 text-purple-600'}`}>
                                    {record.status?.replace(/-/g, ' ')}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-600">{fmtTime(record.clock_in_time)}</td>
                                <td className="px-4 py-3 text-slate-600">{fmtTime(record.clock_out_time)}</td>
                                <td className="px-4 py-3 text-slate-800 font-bold">{parseFloat(record.effective_hours || 0).toFixed(2)}h</td>
                                <td className="px-4 py-3 text-right">
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
                <div className="space-y-6">
                  <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <HiChartBar className="text-purple-600 w-5 h-5" /> Working Hours Trend
                    </h3>
                    <CustomBarChart data={getTrendData()} maxValue={trendMax} />
                  </div>
                </div>
              </div>
            </>
          )}
        </main>

      {viewLogDate && (
        <DailyLogModal date={viewLogDate} onClose={() => setViewLogDate(null)} />
      )}
    </>
  );
}
