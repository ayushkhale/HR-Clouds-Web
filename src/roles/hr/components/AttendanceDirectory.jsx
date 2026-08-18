import React, { useState, useEffect, useRef } from "react";
import Skeleton from "../../../shared/components/Skeleton";
import { attendanceAPI } from "../../../shared/api";
import { DICTIONARY } from "../../../shared/config/dictionary";
import {
  HiSearch,
  HiChevronLeft,
  HiChevronRight,
  HiCheckCircle,
  HiExclamationCircle,
  HiClock,
  HiUsers,
  HiBriefcase
} from "react-icons/hi";
import { useNavigate } from "react-router-dom";

/**
 * Smart cell component: shows real-time effective hours for active employees.
 *
 * - Active (no clock_out_time): ticks every 60s using (now - clock_in_time).
 *   Note: break data isn't available in the directory listing API, so gross
 *   elapsed time is shown. For break-adjusted hours, the individual profile
 *   detail endpoint would be needed.
 * - Clocked out: shows backend's effective_hours which already has breaks
 *   subtracted server-side.
 */
function LiveEffectiveHours({ effectiveHours, clockInTime, clockOutTime }) {
  const isActive = !!clockInTime && !clockOutTime;

  const computeHours = () => {
    if (!clockInTime) return null;
    const start = new Date(clockInTime).getTime();
    const end = clockOutTime ? new Date(clockOutTime).getTime() : Date.now();
    return (end - start) / 3_600_000; // ms → hours
  };

  const [displayHours, setDisplayHours] = useState(() => {
    // For active sessions: compute live. For finished: prefer backend value.
    return isActive ? computeHours() : (effectiveHours ?? computeHours());
  });

  useEffect(() => {
    if (!isActive) {
      // Already clocked out — use backend value (break-adjusted) and stop.
      setDisplayHours(effectiveHours ?? computeHours());
      return;
    }
    // Live ticker for active sessions.
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
    <span className="font-bold text-slate-800">
      {hrs > 0 && <>{hrs}<span className="text-xs text-slate-400 font-normal ml-0.5">h </span></>}
      {mins}<span className="text-xs text-slate-400 font-normal ml-0.5">m</span>
      {isActive && (
        <span
          className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse align-middle"
          title="Live — updating every minute"
        />
      )}
    </span>
  );
}

function AttendanceDirectory() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("employees"); // "employees" or "managers"
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const getApiDateString = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  useEffect(() => {
    fetchAttendance();
  }, [activeTab, page, currentDate]);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 10, date: getApiDateString(currentDate) };

      let res;
      if (activeTab === "employees") {
        res = await attendanceAPI.getAllEmployeesAttendance(params);
      } else if (activeTab === "managers") {
        res = await attendanceAPI.getAllManagersAttendance(params);
      } else if (activeTab === "hr") {
        res = await attendanceAPI.getAllHRsAttendance(params);
      }

      if (res && res.success) {
        const fetchedAt = Date.now();
        setRecords((res.data?.records || []).map(r => ({ ...r, fetchedAt })));
        setTotalPages(res.data?.pagination?.total_pages || 1);
        setTotalRecords(res.data?.pagination?.total || 0);
      } else {
        // If success is false, ensure we show nothing
        setRecords([]);
        setTotalPages(1);
        setTotalRecords(0);
      }
    } catch (err) {
      console.error(err);
      // If the API request completely fails (e.g. 404, 500), clear the table
      setRecords([]);
      setTotalPages(1);
      setTotalRecords(0);
    } finally {
      setLoading(false);

      
    }
  };

  const renderStatusBadge = (status) => {
    const config = DICTIONARY.STATUS_CONFIG[status];
    if (config) {
      const Icon = config.icon;
      return (
        <span className={`px-2 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 w-max ${config.className}`}>
          {Icon && <Icon className="w-3.5 h-3.5 opacity-80" />} 
          {config.label}
        </span>
      );
    }
    // Fallback for unknown statuses
    return <span className="px-2 py-1 bg-slate-100 border border-slate-200 text-slate-500 shadow-xs rounded-full text-[11px] font-bold w-max">{status}</span>;
  };

  const handleRowClick = (userId) => {
    navigate(`/dashboard/hr/employees/${userId}?tab=attendance`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">{DICTIONARY.HEADERS.ATTENDANCE_DIRECTORY}</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            {DICTIONARY.DESCRIPTIONS.ATTENDANCE_DIRECTORY}
          </p>
        </div>
      </div>

      {/* Tabs & Controls */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center p-1 bg-slate-100 rounded-lg w-max">
          <button
            onClick={() => { setActiveTab("employees"); setPage(1); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
              activeTab === "employees" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <HiUsers className="w-4 h-4" /> Employees
          </button>
          <button
            onClick={() => { setActiveTab("managers"); setPage(1); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
              activeTab === "managers" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <HiBriefcase className="w-4 h-4" /> Managers
          </button>
          <button
            onClick={() => { setActiveTab("hr"); setPage(1); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
              activeTab === "hr" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <HiUsers className="w-4 h-4" /> HR
          </button>
        </div>

        <div className="flex items-center gap-1 border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-600 bg-white shadow-xs">
          <button 
            onClick={() => {
              setCurrentDate(prev => {
                const d = new Date(prev);
                d.setDate(d.getDate() - 1);
                return d;
              });
              setPage(1);
            }} 
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
          >
            <HiChevronLeft className="w-4 h-4" />
          </button>
          
          <span className="w-36 text-center select-none">
            {currentDate.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </span>
          
          <button 
            onClick={() => {
              setCurrentDate(prev => {
                const d = new Date(prev);
                // Prevent going into future days
                if (d.toDateString() === new Date().toDateString()) return prev;
                d.setDate(d.getDate() + 1);
                return d;
              });
              setPage(1);
            }} 
            disabled={currentDate.toDateString() === new Date().toDateString()}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            <HiChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Data Table */}
      {loading ? (
        <Skeleton type="table" rows={5} />
      ) : (
      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500 font-semibold">
              <tr>
                <th className="px-6 py-4 text-xs uppercase tracking-wide">Employee ID</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wide">Employee</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wide">Department</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wide">Status</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wide">Clock In</th>
                <th className="px-6 py-4 text-xs uppercase tracking-wide">Clock Out</th>
                <th className="px-6 py-4 text-right text-xs uppercase tracking-wide">Eff. Hrs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {records.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-slate-400 font-medium">
                    No attendance records found for your search.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr 
                    key={record.user_id} 
                    onClick={() => handleRowClick(record.user_id)}
                    className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {record.employee_code || <span className="text-slate-300 font-normal">—</span>}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-800 text-sm truncate max-w-[140px] sm:max-w-[180px]" title={record.name}>{record.name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-700 text-sm">{record.department || "—"}</p>
                      {record.designation && <p className="text-xs text-slate-400 mt-0.5">{record.designation}</p>}
                    </td>
                    <td className="px-6 py-4">
                      {renderStatusBadge(record.status)}
                    </td>
                    <td className="px-6 py-4">
                      {record.clock_in_time
                        ? <span className="font-semibold text-slate-700 text-sm">{new Date(record.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        : <span className="text-xs text-slate-400 italic">Not clocked in</span>}
                      {record.late_minutes > 0 && <p className="text-[10px] text-amber-600 font-bold mt-0.5">+{record.late_minutes}m late</p>}
                    </td>
                    <td className="px-6 py-4">
                      {record.clock_out_time
                        ? <span className="font-semibold text-slate-700 text-sm">{new Date(record.clock_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        : <span className="text-xs text-slate-400 italic">Not clocked out</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <LiveEffectiveHours
                        effectiveHours={record.effective_hours}
                        clockInTime={record.clock_in_time}
                        clockOutTime={record.clock_out_time}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {!loading && records.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">
              Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, totalRecords)} of {totalRecords} records
            </p>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                <HiChevronLeft className="w-4 h-4" />
              </button>
              
              <div className="flex gap-1 px-1">
                {Array.from({ length: Math.min(5, totalPages) }).map((_, idx) => {
                  let pageNum = idx + 1;
                  if (totalPages > 5) {
                    if (page > 3) {
                      pageNum = page - 2 + idx;
                    }
                    if (page > totalPages - 2) {
                      pageNum = totalPages - 4 + idx;
                    }
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-semibold transition-all ${
                        page === pageNum
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                <HiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

export default AttendanceDirectory;
