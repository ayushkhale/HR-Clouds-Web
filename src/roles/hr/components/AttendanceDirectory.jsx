import React, { useState, useEffect } from "react";
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

function AttendanceDirectory() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("employees"); // "employees" or "managers"
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  useEffect(() => {
    fetchAttendance();
  }, [activeTab, page]);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1); // Reset to first page on search
      fetchAttendance();
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 10 };
      if (search) params.search = search;

      let res;
      if (activeTab === "employees") {
        res = await attendanceAPI.getAllEmployeesAttendance(params);
      } else {
        res = await attendanceAPI.getAllManagersAttendance(params);
      }

      if (res && res.success) {
        setRecords(res.data?.records || []);
        setTotalPages(res.data?.pagination?.total_pages || 1);
        setTotalRecords(res.data?.pagination?.total || 0);
      }
    } catch (err) {
      console.error(err);
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
    navigate(`/hr/attendance/${userId}?type=${activeTab}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">{DICTIONARY.HEADERS.ATTENDANCE_DIRECTORY}</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            View and manage attendance records for the organization.
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
        </div>

        <div className="relative">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 w-full sm:w-64"
          />
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
                      <p className="font-bold text-slate-800 text-sm">{record.name}</p>
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
                        : <span className="text-xs text-slate-400 italic">{record.clock_in_time ? "Still active" : "—"}</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {record.effective_hours
                        ? <span className="font-bold text-slate-800">{record.effective_hours.toFixed(1)}<span className="text-xs text-slate-400 font-normal ml-0.5">h</span></span>
                        : <span className="text-xs text-slate-400 italic">—</span>}
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
            <div className="flex gap-1">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                <HiChevronLeft className="w-4 h-4" />
              </button>
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
