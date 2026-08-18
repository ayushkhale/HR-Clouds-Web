import React, { useState, useEffect, useRef } from "react";
import { attendanceAPI } from "../../../../shared/api";
import { DICTIONARY } from "../../../../shared/config/dictionary";
import {
  HiChevronLeft, HiChevronRight, HiX, HiClock, HiLightningBolt,
  HiExclamationCircle, HiCheckCircle, HiArrowRight
} from "react-icons/hi";

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
    <span className={`font-bold ${className}`}>
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

/* ─────────────────────────────────────────────────────────────
   Daily Log Drilldown Modal (API 7.10.1)
───────────────────────────────────────────────────────────── */
function DailyLogModal({ userId, date, employeeRole, onClose }) {
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId || !date) return;
    setLoading(true);
    setError(null);

    const fn =
      employeeRole === "manager"
        ? attendanceAPI.getManagerDailyLog
        : employeeRole === "hr"
        ? attendanceAPI.getHRDailyLog
        : attendanceAPI.getEmployeeDailyLog;

    fn(userId, date)
      .then((res) => setLog(res?.data || null))
      .catch(() => setError("Failed to load daily log."))
      .finally(() => setLoading(false));
  }, [userId, date, employeeRole]);

  const fmt = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };
  const fmtMins = (m) => {
    if (!m) return "0m";
    const h = Math.floor(m / 60);
    const min = m % 60;
    return h > 0 ? `${h}h ${min}m` : `${min}m`;
  };

  const dateLabel = date
    ? new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const statusCfg = log ? DICTIONARY.STATUS_CONFIG[log.status] : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mb-0.5">
              Daily Log
            </p>
            <h2 className="text-base font-bold text-slate-800">{dateLabel}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-10 text-slate-400 gap-2">
              <HiExclamationCircle className="w-8 h-8 text-rose-300" />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          ) : !log ? (
            <div className="text-center py-10 text-slate-400 text-sm">No data for this day.</div>
          ) : (
            <>
              {/* Status + Clock In/Out Banner */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {statusCfg ? (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${statusCfg.className}`}>
                      {statusCfg.icon && <statusCfg.icon className="w-3.5 h-3.5" />}
                      {statusCfg.label}
                    </span>
                  ) : (
                    <span className="px-3 py-1.5 bg-slate-200 text-slate-600 rounded-full text-xs font-bold capitalize">
                      {log.status?.replace("_", " ")}
                    </span>
                  )}
                  {log.is_regularized && (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                      Regularized
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <span className="text-slate-400 text-xs font-medium">IN</span>
                  <span>{fmt(log.clock_in_time)}</span>
                  <HiArrowRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-slate-400 text-xs font-medium">OUT</span>
                  <span>{fmt(log.clock_out_time)}</span>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    label: "Effective Hrs",
                    value: (
                      <LiveEffectiveHours
                        effectiveHours={log.effective_hours}
                        clockInTime={log.clock_in_time}
                        clockOutTime={log.clock_out_time}
                        className="text-slate-800 text-sm font-bold"
                      />
                    ),
                  },
                  { label: "Break Time", value: fmtMins(log.break_duration_minutes) },
                  { label: "Late", value: log.late_minutes > 0 ? `${log.late_minutes}m` : "On Time ✓", warn: log.late_minutes > 0 },
                  { label: "Overtime", value: log.overtime_minutes > 0 ? fmtMins(log.overtime_minutes) : "—" },
                  { label: "Early Exit", value: log.early_exit_minutes > 0 ? fmtMins(log.early_exit_minutes) : "—" },
                  { label: "Work Mode", value: log.work_mode ? log.work_mode.charAt(0).toUpperCase() + log.work_mode.slice(1) : "—" },
                ].map(({ label, value, warn }) => (
                  <div key={label} className="bg-white border border-slate-100 rounded-xl p-3 shadow-xs">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                    <p className={`text-sm font-bold ${warn ? "text-amber-600" : "text-slate-800"}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Shift Info */}
              {log.shift && (
                <div className="border border-slate-100 rounded-xl p-4 bg-white">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Applied Shift</p>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">{log.shift.name}</p>
                    <span className="text-xs text-slate-500 font-medium">
                      {log.shift.start_time} → {log.shift.end_time}
                      <span className="ml-2 text-[10px] text-slate-400 capitalize">({log.shift.type})</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Sessions Timeline */}
              {log.sessions?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Sessions</p>
                  <div className="space-y-2">
                    {log.sessions.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-xs">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${s.status === "open" ? "bg-green-400 animate-pulse" : "bg-purple-400"}`} />
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 flex-1">
                          <HiClock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{fmt(s.opened_at)}</span>
                          <HiArrowRight className="w-3.5 h-3.5 text-slate-300" />
                          <span>{s.closed_at ? fmt(s.closed_at) : <span className="text-green-500 text-xs animate-pulse">Active</span>}</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.status === "open" ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"}`}>
                          {s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Breaks */}
              {log.breaks?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Breaks <span className="text-slate-400 font-normal normal-case ml-1">({log.breaks.length} total • {fmtMins(log.break_duration_minutes)})</span>
                  </p>
                  <div className="space-y-2">
                    {log.breaks.map((b, i) => (
                      <div key={i} className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                        <span className="text-base">☕</span>
                        <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 flex-1">
                          <span>{fmt(b.start_time)}</span>
                          <HiArrowRight className="w-3.5 h-3.5 text-amber-300" />
                          <span>{fmt(b.end_time)}</span>
                        </div>
                        <span className="text-xs font-bold text-amber-600">{fmtMins(b.duration_minutes)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Anomalies */}
              {log.anomalies?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-rose-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <HiExclamationCircle className="w-3.5 h-3.5" /> Anomalies
                  </p>
                  <div className="space-y-2">
                    {log.anomalies.map((a, i) => (
                      <div key={i} className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-rose-700 capitalize">{a.type?.replace(/_/g, " ")}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${a.severity === "high" ? "bg-rose-200 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                            {a.severity}
                          </span>
                        </div>
                        {a.description && <p className="text-xs text-rose-500 mt-0.5">{a.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All clear */}
              {!log.anomalies?.length && log.clock_in_time && (
                <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                  <HiCheckCircle className="w-4 h-4" />
                  No anomalies flagged for this day.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main AttendanceTab
───────────────────────────────────────────────────────────── */
export default function AttendanceTab({ userId, employeeRole }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null); // drilldown

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const isManager = employeeRole === "manager";
    const fn = isManager
      ? attendanceAPI.getIndividualManagerAttendanceDetail
      : attendanceAPI.getIndividualEmployeeAttendanceDetail;

    fn(userId, { month, year, page, limit: 20 })
      .then((res) => {
        setRecords(res?.data?.records || []);
        setTotalPages(res?.data?.pagination?.total_pages || 1);
      })
      .catch(() => { setRecords([]); })
      .finally(() => setLoading(false));
  }, [userId, month, year, page, employeeRole]);

  const handlePrev = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
    setPage(1);
  };
  const handleNext = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
    setPage(1);
  };

  const monthName = new Date(year, month - 1).toLocaleString("default", { month: "long", year: "numeric" });

  const formatTime = (isoString) => {
    if (!isoString) return "—";
    return new Date(isoString).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const renderBadge = (status) => {
    const cfg = DICTIONARY.STATUS_CONFIG[status];
    if (cfg) {
      const Icon = cfg.icon;
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold w-max ${cfg.className}`}>
          {Icon && <Icon className="w-3.5 h-3.5" />}
          {cfg.label}
        </span>
      );
    }
    return <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-[11px] font-bold">{status || "—"}</span>;
  };

  return (
    <div className="space-y-5">
      {/* Month Navigator */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800">Attendance History</h2>
          <p className="text-xs text-slate-400 mt-0.5">Click any row to view the full daily breakdown.</p>
        </div>
        <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white shadow-xs">
          <button onClick={handlePrev} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
            <HiChevronLeft className="w-4 h-4" />
          </button>
          <span className="w-32 text-center select-none">{monthName}</span>
          <button onClick={handleNext} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
            <HiChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 text-xs font-semibold uppercase tracking-wide">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Day</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Clock In</th>
                <th className="px-6 py-4">Clock Out</th>
                <th className="px-6 py-4 text-right">Eff. Hrs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-slate-100 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-16 text-center text-slate-400 text-sm font-medium">
                    No attendance records for {monthName}.
                  </td>
                </tr>
              ) : (
                records.map((record, i) => {
                  const d = new Date(record.date);
                  return (
                    <tr
                      key={i}
                      onClick={() => setSelectedDate(record.date)}
                      className="hover:bg-purple-50/30 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 font-semibold text-slate-800">
                        {d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {d.toLocaleDateString("en-IN", { weekday: "long" })}
                      </td>
                      <td className="px-6 py-4">{renderBadge(record.status)}</td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{formatTime(record.clock_in_time)}</td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{formatTime(record.clock_out_time)}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-800">
                        <LiveEffectiveHours
                          effectiveHours={record.effective_hours}
                          clockInTime={record.clock_in_time}
                          clockOutTime={record.clock_out_time}
                          className="text-slate-800"
                        />
                        <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-purple-400 font-semibold">Details →</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">Page {page} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Daily Log Drilldown Modal */}
      {selectedDate && (
        <DailyLogModal
          userId={userId}
          date={selectedDate}
          employeeRole={employeeRole}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
