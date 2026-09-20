import React, { useState, useEffect } from "react";
import DashboardTopBar from "../../../shared/components/DashboardTopBar";
import { organizationAPI, leaveAPI, attendanceAPI } from "../../../shared/api";
import {
  HiUserGroup, HiOutlineCalendar, HiPencil, HiX,
  HiCheckCircle, HiExclamationCircle, HiClock, HiSearch
} from "react-icons/hi";
import { usePagedList } from "../../../shared/attendance/usePagedList";
import { num, personName, unwrap } from "../../../shared/attendance/normalize";
import { fmtDate, fmtHours, fmtMinutes, fmtTime, monthRange, ymdOnly } from "../../../shared/attendance/dates";
import { ErrorState, LoadingRows, Pagination, StatusBadge } from "../../../shared/attendance/ui";
import { dayChip, isSynthesizedDay, isWorkingDay, metric } from "../../../shared/attendance/dayStatus";
import GenderAvatar from "../../../shared/components/GenderAvatar";


// ─── Edit Profile Modal ───────────────────────────────────────────────────────
function EditProfileModal({ employee, onClose, onSuccess }) {
  const employeeId = employee.user_id || employee.id || employee._id;
  const blank = { name: "", phone_number: "", avatar_url: "" };
  const [form, setForm] = useState({ ...blank, name: employee.name || "" });
  const [initial, setInitial] = useState({ ...blank, name: employee.name || "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // The roster projection doesn't carry phone/avatar, so load the full record
  // before editing — otherwise saving would post empty strings over real values.
  useEffect(() => {
    if (!employeeId) {
      setError("This team member has no resolvable id.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    organizationAPI.getEmployee(employeeId)
      .then((res) => {
        if (cancelled) return;
        const d = res?.data || {};
        const seeded = {
          name: d.name || employee.name || "",
          phone_number: d.phone_number || d.contact || "",
          avatar_url: d.avatar || d.avatar_url || "",
        };
        setForm(seeded);
        setInitial(seeded);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.data?.message || "Could not load the current profile. Only fields you edit will be saved.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!employeeId) return;
    if (!form.name.trim()) {
      setError("Name cannot be empty.");
      return;
    }

    // Send only what actually changed, so untouched fields are never cleared.
    const payload = {};
    if (form.name.trim() !== initial.name) payload.name = form.name.trim();
    if (form.phone_number.trim() !== initial.phone_number) payload.phone_number = form.phone_number.trim();
    if (form.avatar_url.trim() !== initial.avatar_url) payload.avatar_url = form.avatar_url.trim();

    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      await organizationAPI.updateEmployeeProfile(employeeId, payload);
      onSuccess("Profile updated successfully!");
    } catch (err) {
      setError(err?.data?.message || err.message || "Failed to update profile.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Edit Profile</h2>
            <p className="text-xs text-slate-400 mt-0.5">Update {employee.name}'s details.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <HiX className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Name</label>
            <input type="text" name="name" value={form.name} onChange={handleChange} className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" required />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Phone Number</label>
            <input type="text" name="phone_number" value={form.phone_number} onChange={handleChange} className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Avatar URL</label>
            <input type="url" name="avatar_url" value={form.avatar_url} onChange={handleChange} placeholder="https://..." className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting || loading} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-60">
              {loading ? "Loading…" : submitting ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-3 font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── View Leave History Modal ─────────────────────────────────────────────────
function ViewLeaveHistoryModal({ employee, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    leaveAPI.getTeamMemberRequests(employee.user_id || employee.id || employee._id)
      .then(res => setHistory(res.data || []))
      .catch(err => setError(err.message || "Failed to load leave history."))
      .finally(() => setLoading(false));
  }, [employee]);

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "N/A";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800">Leave History</h2>
            <p className="text-xs text-slate-400 mt-0.5">{employee.name}'s past and upcoming leaves.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <HiX className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <HiOutlineCalendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold">No leave history found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map(req => (
                <div key={req.id || req._id} className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-slate-800">{req.leave_type?.name || "Leave"}</h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border 
                        ${req.status === 'approved' ? 'bg-violet-50 text-violet-700 border-violet-200' : 
                          req.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : 
                          req.status === 'cancelled' ? 'bg-slate-100 text-slate-600 border-slate-200' : 
                          'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200'}`}>
                        {req.status?.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {fmtDate(req.start_date)} {req.start_date !== req.end_date && `– ${fmtDate(req.end_date)}`} 
                      <span className="mx-2">•</span> 
                      {parseFloat(req.total_days).toFixed(1)} days
                    </p>
                  </div>
                  {req.reason && (
                    <div className="text-xs text-slate-500 bg-white px-3 py-2 rounded-lg border border-slate-200 max-w-[200px] truncate">
                      <span className="italic">"{req.reason}"</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── View Attendance Modal ────────────────────────────────────────────────────
function ViewAttendanceModal({ employee, onClose }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [summaryState, setSummaryState] = useState({ data: null, loading: true, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const empId = employee.user_id || employee.id || employee._id;
  const maxMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // M15 takes a date range + pagination (not month/year).
  const historyList = usePagedList(
    ({ page, limit }) => attendanceAPI.getTeamMemberHistory(empId, { ...monthRange(year, month), page, limit }),
    { limit: 31, keys: ["records"], filterKey: `${empId}-${year}-${month}` }
  );

  useEffect(() => {
    let alive = true;
    setSummaryState((s) => ({ ...s, loading: true, error: null }));
    attendanceAPI.getTeamMemberSummary(empId, month, year)
      .then((res) => alive && setSummaryState({ data: unwrap(res), loading: false, error: null }))
      .catch((error) => alive && setSummaryState({ data: null, loading: false, error }));
    return () => { alive = false; };
  }, [empId, month, year, reloadKey]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const summary = summaryState.data;
  const history = historyList.items;
  const loading = summaryState.loading && historyList.loading && history.length === 0;
  const error = summaryState.error || historyList.error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800">Attendance Details</h2>
            <p className="text-xs text-slate-400 mt-0.5">{personName(employee)}'s attendance record.</p>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="month"
              max={maxMonth}
              value={`${year}-${String(month).padStart(2, '0')}`}
              onChange={e => {
                if (!e.target.value) return;
                const [y, m] = e.target.value.split('-');
                setYear(parseInt(y, 10));
                setMonth(parseInt(m, 10));
              }}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-purple-500"
            />
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
              <HiX className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {loading ? (
            <LoadingRows rows={5} />
          ) : error ? (
            <ErrorState error={error} onRetry={() => { historyList.reload(); setReloadKey((k) => k + 1); }} fallback="Couldn't load attendance data." />
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ["Present", num(summary?.present_days), "text-violet-600"],
                  ["Half days", num(summary?.half_days), "text-indigo-600"],
                  ["Absent", num(summary?.absent_days), "text-rose-600"],
                  ["On leave", num(summary?.on_leave_days), "text-purple-600"],
                  ["Late", num(summary?.late_days), "text-fuchsia-500"],
                  // Summary keys per contract §4.2 (older payloads used holidays / weekly_offs).
                  ["Holidays / offs", num(summary?.holiday_days ?? summary?.holidays) + num(summary?.weekly_off_days ?? summary?.weekly_offs), "text-slate-600"],
                  ["Hours worked", fmtHours(summary?.total_hours_worked ?? summary?.total_effective_hours, "0m"), "text-purple-600"],
                  ["Overtime", fmtMinutes(summary?.total_overtime_minutes, "0m"), "text-indigo-600"],
                ].map(([label, value, tone]) => (
                  <div key={label} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm text-center">
                    <p className={`text-xl font-bold ${tone}`}>{value}</p>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {/* History Table */}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Clock In</th>
                      <th className="px-4 py-3">Clock Out</th>
                      <th className="px-4 py-3">Effective</th>
                      <th className="px-4 py-3">Late</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y divide-slate-50 text-sm ${historyList.loading ? "opacity-60" : ""}`}>
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">No attendance records for this month.</td>
                      </tr>
                    ) : (
                      history.map((record) => {
                        const chip = dayChip(record);
                        const late = metric(record.late_minutes);
                        const dash = <span className="text-slate-300">—</span>;
                        return (
                        <tr key={record.id || record.date} className={isSynthesizedDay(record) ? (isWorkingDay(record) ? "" : "bg-slate-50/40") : "hover:bg-slate-50/50"}>
                          <td className={`px-4 py-3 font-medium whitespace-nowrap ${isWorkingDay(record) ? "text-slate-700" : "text-slate-400"}`}>{fmtDate(ymdOnly(record.date), { weekday: "short", day: "numeric", month: "short" })}</td>
                          <td className="px-4 py-3"><StatusBadge status={chip.key === "late" ? "present" : chip.key} label={chip.label} /></td>
                          <td className="px-4 py-3 text-slate-600">{record.clock_in_time ? fmtTime(record.clock_in_time) : dash}</td>
                          <td className="px-4 py-3 text-slate-600">{record.clock_out_time ? fmtTime(record.clock_out_time) : dash}</td>
                          <td className="px-4 py-3 text-slate-600">{metric(record.effective_hours) === null ? dash : fmtHours(record.effective_hours)}</td>
                          <td className="px-4 py-3 text-fuchsia-600">{late === null ? dash : late > 0 ? fmtMinutes(late) : <span className="text-slate-500">0m</span>}</td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                <div className="px-4 py-3 border-t border-slate-50">
                  <Pagination page={historyList.page} totalPages={historyList.totalPages} total={historyList.total} limit={historyList.limit} onPageChange={historyList.setPage} disabled={historyList.loading} noun="day" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Roster Page ─────────────────────────────────────────────────────────
export default function ManagerTeamRosterPage() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [viewingLeaveHistory, setViewingLeaveHistory] = useState(null);
  const [viewingAttendance, setViewingAttendance] = useState(null);
  const [toast, setToast] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchTeam = async () => {
    setLoading(true);
    try {
      const res = await organizationAPI.getEmployees({ purpose: "shift_assignment" }); // Scoped to direct reports automatically
      setTeam(Array.isArray(res.data) ? res.data : (res.data?.employees || []));
    } catch (err) {
      setError(err.message || "Failed to load team roster.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredTeam = q
    ? team.filter((emp) => [emp.name, emp.email, emp.employee_code, emp.emp_id].some((v) => String(v || "").toLowerCase().includes(q)))
    : team;

  return (
    <>
        <DashboardTopBar title="My Team Roster" />

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 max-w-7xl w-full mx-auto flex-1 overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">My Team Roster</h1>
              <p className="text-sm text-slate-500 mt-1">View and manage your direct reports.</p>
            </div>
          </div>

          {toast && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border ${toast.type === "success" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-red-50 text-red-700 border-red-200"}`}>
              {toast.type === "success" ? <HiCheckCircle className="w-5 h-5 shrink-0" /> : <HiExclamationCircle className="w-5 h-5 shrink-0" />}
              {toast.msg}
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm border border-red-100">
              {error}
            </div>
          )}

          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs p-6 sm:p-7 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="relative flex-1 sm:w-72 sm:max-w-xs">
                <HiSearch className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search member or email…"
                  className="w-full bg-slate-50/70 border border-slate-200/80 rounded-full pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-purple-500 focus:bg-white transition-all"
                />
              </div>
              {!loading && <p className="text-xs font-semibold text-slate-400">{filteredTeam.length} {filteredTeam.length === 1 ? "member" : "members"}</p>}
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="bg-white rounded-[20px] h-64 border border-slate-100 animate-pulse"></div>
                ))}
              </div>
            ) : team.length === 0 ? (
              <div className="py-16 text-center">
                <HiUserGroup className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-slate-800">No direct reports found</h3>
                <p className="text-slate-500 text-sm mt-1">It looks like you don&apos;t have any team members assigned to you.</p>
              </div>
            ) : filteredTeam.length === 0 ? (
              <div className="py-16 text-center text-slate-400 font-medium">
                <HiUserGroup className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                No members matching &quot;{searchQuery}&quot;
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredTeam.map((emp) => {
                  const empCode = emp.employee_code || emp.emp_id;
                  const isActive = String(emp.status || "active").toLowerCase() === "active";
                  return (
                    <div key={emp.user_id || emp.id || emp._id} className="bg-white rounded-[20px] border border-slate-100 hover:border-purple-200 hover:shadow-md transition-all duration-200 group flex flex-col overflow-hidden shadow-sm">
                      <div className="p-6 flex-1 flex flex-col">
                        {/* Status & Emp Code Row */}
                        <div className="flex justify-between items-center mb-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-full ${isActive ? "bg-violet-50 text-violet-600 border border-violet-100" : "bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-violet-500" : "bg-fuchsia-500"}`} />
                            {isActive ? "Active" : "Inactive"}
                          </span>
                          {empCode ? (
                            <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">{empCode}</span>
                          ) : (
                            <span className="font-mono text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200" title="No employee code on file">N/A</span>
                          )}
                        </div>

                        {/* Profile Section */}
                        <div className="flex flex-col items-center text-center mb-2">
                          <div className="relative mb-4">
                            <div className="w-20 h-20 rounded-full shadow-sm overflow-hidden bg-slate-50 shrink-0 ring-2 ring-purple-100 flex items-center justify-center">
                              <GenderAvatar person={emp} name={emp.name} />
                            </div>
                            {isActive && <div className="absolute bottom-0.5 right-0.5 w-4.5 h-4.5 bg-violet-500 border-2 border-white rounded-full shadow-sm" />}
                          </div>
                          <h3 className="text-[17px] font-bold text-slate-900 leading-tight px-2 truncate w-full">{emp.name || "Employee"}</h3>
                          <p className="text-xs font-semibold text-slate-400 mt-1 uppercase truncate w-full">{emp.designation || emp.role || "Member"}</p>
                          {emp.email && <p className="text-[11px] text-slate-400 mt-1 truncate w-full">{emp.email}</p>}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="border-t border-slate-100 bg-slate-50 flex divide-x divide-slate-100">
                        <button onClick={() => setViewingAttendance(emp)} className="flex-1 py-3 text-[11px] font-bold text-slate-600 hover:bg-slate-100 hover:text-purple-700 transition flex items-center justify-center gap-1.5">
                          <HiClock className="w-3.5 h-3.5" /> Attendance
                        </button>
                        <button onClick={() => setViewingLeaveHistory(emp)} className="flex-1 py-3 text-[11px] font-bold text-slate-600 hover:bg-slate-100 hover:text-purple-700 transition flex items-center justify-center gap-1.5">
                          <HiOutlineCalendar className="w-3.5 h-3.5" /> Leaves
                        </button>
                        <button onClick={() => setEditingEmployee(emp)} className="flex-1 py-3 text-[11px] font-bold text-slate-600 hover:bg-slate-100 hover:text-purple-700 transition flex items-center justify-center gap-1.5">
                          <HiPencil className="w-3.5 h-3.5" /> Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

      {editingEmployee && (
        <EditProfileModal 
          employee={editingEmployee} 
          onClose={() => setEditingEmployee(null)} 
          onSuccess={(msg) => {
            setEditingEmployee(null);
            showToast(msg);
            fetchTeam();
          }}
        />
      )}

      {viewingLeaveHistory && (
        <ViewLeaveHistoryModal 
          employee={viewingLeaveHistory}
          onClose={() => setViewingLeaveHistory(null)}
        />
      )}

      {viewingAttendance && (
        <ViewAttendanceModal 
          employee={viewingAttendance}
          onClose={() => setViewingAttendance(null)}
        />
      )}
    </>
  );
}
