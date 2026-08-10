import React, { useState, useEffect } from "react";
import { attendanceAPI } from "../../../../shared/api";
import { DICTIONARY } from "../../../../shared/config/dictionary";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { HiCheckCircle, HiExclamationCircle, HiClock, HiChartBar, HiTrendingUp } from "react-icons/hi";

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

  const baseData = history.map(r => ({
    date: r.date,
    present: r.status === "present" ? 1 : 0,
    absent: r.status === "absent" ? 1 : 0,
    late: r.status === "late" ? 1 : 0,
  })).sort((a, b) => new Date(a.date) - new Date(b.date));

  let chartData = [...baseData];
  
  // Pad forward to ensure at least 15 days are shown (matches HRDashboard logic)
  if (chartData.length > 0 && chartData.length < 15) {
    let lastDate = new Date(chartData[chartData.length - 1].date);
    for (let i = chartData.length; i < 15; i++) {
      lastDate.setDate(lastDate.getDate() + 1);
      chartData.push({
        date: lastDate.toISOString().split("T")[0],
        present: 0,
        absent: 0,
        late: 0,
      });
    }
  } else if (chartData.length === 0) {
    // If absolutely no data, generate first 15 days of the selected month
    for (let i = 1; i <= 15; i++) {
      const d = new Date(year, month - 1, i);
      chartData.push({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        present: 0,
        absent: 0,
        late: 0,
      });
    }
  }

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

      {/* Today's Status Banner */}
      {todayRecord && (
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5 shadow-xs flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] font-bold text-purple-600 mb-1 tracking-widest uppercase">Today • {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}</p>
            {(() => {
              const cfg = DICTIONARY.STATUS_CONFIG[todayRecord.status];
              return <span className="text-lg font-bold text-slate-800">{cfg ? cfg.label : todayRecord.status}</span>;
            })()}
          </div>
          <div className="flex gap-6 text-sm">
            {todayRecord.clock_in && (
              <div className="text-center">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Clock In</p>
                <p className="font-bold text-slate-700 text-sm">{todayRecord.clock_in}</p>
              </div>
            )}
            {todayRecord.clock_out && (
              <div className="text-center">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Clock Out</p>
                <p className="font-bold text-slate-700 text-sm">{todayRecord.clock_out}</p>
              </div>
            )}
            {todayRecord.effective_hours != null && (
              <div className="text-center">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Eff. Hrs</p>
                <p className="font-bold text-slate-700 text-sm">{todayRecord.effective_hours}h</p>
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
        <h3 className="text-sm font-bold text-slate-700 mb-1">Attendance Pattern</h3>
        <div className="flex items-center gap-4 mb-5">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400"><span className="w-2 h-2 rounded-full bg-purple-700" />{DICTIONARY.STATUS.PRESENT}</span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400"><span className="w-2 h-2 rounded-full bg-purple-400" />{DICTIONARY.STATUS.LATE}</span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400"><span className="w-2 h-2 rounded-full bg-purple-200" />{DICTIONARY.STATUS.ABSENT}</span>
        </div>
        {chartData.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-slate-400">
            <HiChartBar className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm font-semibold">No data for this month</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }} barGap={1}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 600 }} tickFormatter={v => new Date(v).getDate()} interval="preserveStartEnd" />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 9 }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgb(0 0 0 / 0.1)", fontSize: "11px" }} labelFormatter={v => new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
              <Bar dataKey="present" name={DICTIONARY.STATUS.PRESENT} fill="#6D28D9" barSize={6} radius={[3, 3, 0, 0]} />
              <Bar dataKey="late" name={DICTIONARY.STATUS.LATE} fill="#A78BFA" barSize={6} radius={[3, 3, 0, 0]} />
              <Bar dataKey="absent" name={DICTIONARY.STATUS.ABSENT} fill="#DDD6FE" barSize={6} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
