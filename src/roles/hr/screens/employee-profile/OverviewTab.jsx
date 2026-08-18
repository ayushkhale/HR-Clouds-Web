import React, { useState, useEffect, useRef } from "react";
import { attendanceAPI } from "../../../../shared/api";
import { DICTIONARY } from "../../../../shared/config/dictionary";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { HiCheckCircle, HiExclamationCircle, HiClock, HiChartBar, HiTrendingUp } from "react-icons/hi";

function LiveEffectiveHours({ effectiveHours, clockInTime, clockOutTime, className = "text-slate-800" }) {
  const isActive = !!clockInTime && !clockOutTime;

  const computeHours = () => {
    if (!clockInTime) return null;
    const start = new Date(clockInTime).getTime();
    const end = clockOutTime ? new Date(clockOutTime).getTime() : Date.now();
    return (end - start) / 3_600_000; // ms → hours
  };

  const [displayHours, setDisplayHours] = useState(() => {
    return isActive ? computeHours() : (effectiveHours ?? computeHours());
  });

  useEffect(() => {
    if (!isActive) {
      setDisplayHours(effectiveHours ?? computeHours());
      return;
    }
    setDisplayHours(computeHours());
    const id = setInterval(() => setDisplayHours(computeHours()), 60_000);
    return () => clearInterval(id);
  }, [clockInTime, clockOutTime, effectiveHours]);

  if (displayHours === null) {
    return <span className="text-xs text-slate-400 italic">&mdash;</span>;
  }

  const totalMins = Math.floor(displayHours * 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  return (
    <span className={`font-extrabold ${className}`}>
      {hrs > 0 && <>{hrs}<span className="text-[10px] opacity-75 font-normal ml-0.5">h </span></>}
      {mins}<span className="text-[10px] opacity-75 font-normal ml-0.5">m</span>
      {isActive && (
        <span
          className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse align-middle"
          title="Live — updating every minute"
        />
      )}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs flex flex-col gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800">{value ?? "—"}</p>
        <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function OverviewTab({ userId, employeeRole }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const isManager = employeeRole === "manager";
    const summaryFn = isManager
      ? attendanceAPI.getIndividualManagerMonthlySummary
      : attendanceAPI.getIndividualEmployeeMonthlySummary;
    const historyFn = isManager
      ? attendanceAPI.getIndividualManagerAttendanceDetail
      : attendanceAPI.getIndividualEmployeeAttendanceDetail;

    Promise.all([
      summaryFn(userId, month, year).catch(() => null),
      historyFn(userId, { month, year, page: 1, limit: 31 }).catch(() => null),
    ]).then(([sum, hist]) => {
      setSummary(sum?.data || null);
      setHistory(hist?.data?.records || []);
    }).finally(() => setLoading(false));
  }, [userId, month, year, employeeRole]);



  const todayStr = now.toISOString().split("T")[0];
  const todayRecord = history.find(r => r.date === todayStr);

  const handlePrev = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const handleNext = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const monthName = new Date(year, month - 1).toLocaleString("default", { month: "long", year: "numeric" });

  const formatTime = (isoString) => {
    if (!isoString) return "—";
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit', hour12: true });
  };

  return (
    <div className="space-y-6">
      {/* Month Navigator */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">Monthly Overview</h2>
        <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white shadow-xs">
          <button onClick={handlePrev} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">&#8249;</button>
          <span className="w-32 text-center select-none">{monthName}</span>
          <button onClick={handleNext} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">&#8250;</button>
        </div>
      </div>

      {/* Stat Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-slate-100 rounded-2xl border border-slate-100 p-5 h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Days Present"
            value={summary?.present_days ?? history.filter(r => r.status === "present").length}
            icon={HiCheckCircle}
            color="bg-purple-50 text-purple-700"
          />
          <StatCard
            label="Days Absent"
            value={summary?.absent_days ?? history.filter(r => r.status === "absent").length}
            icon={HiExclamationCircle}
            color="bg-purple-100 text-purple-500"
          />
          <StatCard
            label="Late Arrivals"
            value={summary?.late_days ?? history.filter(r => r.status === "late").length}
            icon={HiClock}
            color="bg-violet-50 text-violet-500"
          />
          <StatCard
            label="Effective Hrs"
            value={summary?.total_effective_hours != null ? `${summary.total_effective_hours}h` : "—"}
            icon={HiTrendingUp}
            color="bg-indigo-50 text-indigo-500"
          />
        </div>
      )}

      {/* Side-by-side Today's Status & Attendance Pattern Cards */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
        {/* Left Card: Today's Status Details */}
        <div className="md:col-span-4 bg-white rounded-3xl border border-slate-100 p-4 shadow-xs flex flex-col justify-between">
          <div className="h-full flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-bold text-purple-600 tracking-wider uppercase bg-purple-50 px-2 py-0.5 rounded-md">
                Today • {now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </span>
              <div className="mt-3">
                {todayRecord ? (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      {(() => {
                        const cfg = DICTIONARY.STATUS_CONFIG[todayRecord.status];
                        return (
                          <span className="text-base font-extrabold text-slate-800">
                            {cfg ? cfg.label : todayRecord.status}
                          </span>
                        );
                      })()}
                      {todayRecord.status === "in_progress" && (
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50/50">
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Clock In</span>
                        <span className="font-extrabold text-slate-700">{formatTime(todayRecord.clock_in_time)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50/50">
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Clock Out</span>
                        <span className="font-extrabold text-slate-700">{formatTime(todayRecord.clock_out_time)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-purple-50/40 border border-purple-100/50">
                        <span className="text-purple-600 font-bold uppercase tracking-wider text-[9px]">Effective Hours</span>
                        <LiveEffectiveHours
                          effectiveHours={todayRecord.effective_hours}
                          clockInTime={todayRecord.clock_in_time}
                          clockOutTime={todayRecord.clock_out_time}
                          className="text-purple-700 text-sm"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base font-extrabold text-slate-400">Not Marked</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50/50">
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Clock In</span>
                        <span className="font-extrabold text-slate-400">—</span>
                      </div>
                      <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50/50">
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Clock Out</span>
                        <span className="font-extrabold text-slate-400">—</span>
                      </div>
                      <div className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50/50">
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Effective Hours</span>
                        <span className="font-extrabold text-slate-400">—</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Card: Attendance Pattern */}
        <div className="md:col-span-8 bg-white rounded-3xl border border-slate-100 p-4 shadow-xs">
          <h3 className="text-xs font-bold text-slate-700 mb-1">Attendance Pattern</h3>
          
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 mb-4 mt-1.5">
            <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-[2px] bg-[#6D28D9] border border-[#6D28D9]" /> Present
            </span>
            <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-[2px] bg-[#A78BFA] border border-[#A78BFA]" /> Late
            </span>
            <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-[2px] bg-[#DDD6FE] border border-[#DDD6FE]" /> Leave
            </span>
            <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-[2px] bg-white border border-slate-300" /> Absent
            </span>
            <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-[2px] bg-slate-50 border border-slate-200" /> No Data
            </span>
          </div>

          {/* Contribution Graph */}
          <div className="grid gap-2 w-full" style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}>
            {Array.from({ length: new Date(year, month, 0).getDate() }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const record = history.find(r => r.date === dateStr);
              const status = record?.status || "none";
              
              let colorClass = "bg-slate-50 border-slate-200 text-slate-300"; // default/none
              if (status === "present") colorClass = "bg-[#6D28D9] border-[#6D28D9] text-white";
              else if (status === "late") colorClass = "bg-[#A78BFA] border-[#A78BFA] text-purple-900";
              else if (status === "leave" || status === "half_day") colorClass = "bg-[#DDD6FE] border-[#DDD6FE] text-purple-800";
              else if (status === "absent") colorClass = "bg-white border-slate-200 text-slate-400";

              return (
                <div
                  key={day}
                  title={`${new Date(dateStr).toLocaleDateString("en-IN", { weekday: "long", month: "short", day: "numeric" })}: ${status.replace('_', ' ').toUpperCase()}`}
                  className={`w-full aspect-square rounded-md border flex items-center justify-center text-[10px] sm:text-xs font-bold ${colorClass} cursor-help transition-all hover:scale-105 hover:shadow-xs`}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
