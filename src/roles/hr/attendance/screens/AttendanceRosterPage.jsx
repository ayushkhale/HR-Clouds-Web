import React, { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { attendanceAPI } from "../../../../shared/api";
import { attendanceErrorMessage } from "../../../../shared/utils/attendanceErrors";
import EmployeePicker from "../../../../shared/attendance/EmployeePicker";
import { validateAssignment, validateEndAssignment, hasErrors } from "../../../../shared/attendance/validation";
import { listFrom, personName, personEmail, employeeCode, initials } from "../../../../shared/attendance/normalize";
import { fmtDate, fmtClock, todayYMD, ymdOnly } from "../../../../shared/attendance/dates";
import { emitAttendanceChanged, ATTENDANCE_EVENTS } from "../../../../shared/attendance/events";
import { EmptyState, ErrorState, FieldError, FilterTabs, InlineAlert, Pagination, Spinner, Toast, useToast } from "../../../../shared/attendance/ui";
import { HiUserGroup, HiPlus, HiX, HiSearch, HiDotsVertical, HiTrash } from "react-icons/hi";

const PAGE_SIZE = 25;

// Assignment rows nest the user under `user` with role-specific profiles.
function assignmentCode(a) {
  return (
    a.user?.employee_profile?.employee_code ||
    a.user?.manager_profile?.employee_code ||
    a.user?.hr_profile?.employee_code ||
    employeeCode(a) ||
    ""
  );
}
const assignmentName = (a) => personName(a.user ? { ...a.user, profile: a.user.profile } : a);

function assignmentState(a, today) {
  const from = ymdOnly(a.effective_from);
  const to = ymdOnly(a.effective_to);
  if (to && to < today) return "ended";
  if (from && from > today) return "scheduled";
  return "ongoing";
}

/* ─── Assign Modal ───────────────────────────────────────────────────────── */
function AssignModal({ onClose, onSaved }) {
  const [shifts, setShifts] = useState([]);
  const [rotations, setRotations] = useState([]);
  const [dropLoading, setDropLoading] = useState(true);
  const [dropError, setDropError] = useState(null);
  const [form, setForm] = useState({ assignType: "shift", user_id: "", shift_id: "", rotation_pattern_id: "", effective_from: todayYMD(), effective_to: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([attendanceAPI.getShifts(), attendanceAPI.getRotations()])
      .then(([shiftRes, rotationRes]) => {
        if (!alive) return;
        setShifts(listFrom(shiftRes, ["shifts"]).filter((s) => s.is_active));
        setRotations(listFrom(rotationRes, ["rotations"]).filter((r) => r.is_active));
      })
      .catch((err) => alive && setDropError(err))
      .finally(() => alive && setDropLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (loading) return;
    const { errors: v, payload } = validateAssignment(form);
    const clean = Object.fromEntries(Object.entries(v).filter(([, m]) => m));
    setErrors(clean);
    if (hasErrors(clean)) return;
    setLoading(true);
    setError("");
    try {
      await attendanceAPI.assignShift(payload);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "assignment" });
      onSaved(form.assignType === "rotation" ? "Rotation assigned successfully." : "Shift assigned successfully.");
    } catch (err) {
      setError(attendanceErrorMessage(err, "Couldn't assign the shift."));
    } finally {
      setLoading(false);
    }
  }

  const selectClass = (invalid) => `w-full px-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white ${invalid ? "border-rose-300" : "border-slate-200"}`;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Assign Shift</h2>
            <p className="text-xs text-slate-400 mt-0.5">Pick an employee and the shift or rotation they should follow.</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5" noValidate>
          {error && <InlineAlert tone="rose">{error}</InlineAlert>}

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Employee <span className="text-red-400">*</span></label>
            <EmployeePicker value={form.user_id} onChange={(id) => set("user_id", id)} invalid={!!errors.user_id} disabled={loading} />
            <FieldError message={errors.user_id} />
          </div>

          <div>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">What kind of schedule?</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "shift", label: "Single Shift", desc: "Same shift every working day" },
                { value: "rotation", label: "Rotation", desc: "Cycles through shift phases" },
              ].map((t) => (
                <button key={t.value} type="button" onClick={() => set("assignType", t.value)} aria-pressed={form.assignType === t.value} className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition ${form.assignType === t.value ? "border-purple-500 bg-purple-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <span className={`text-xs font-bold ${form.assignType === t.value ? "text-purple-700" : "text-slate-700"}`}>{t.label}</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {dropLoading ? (
            <p className="text-xs text-slate-400 flex items-center gap-2"><Spinner className="w-3.5 h-3.5 text-purple-600" /> Loading shifts…</p>
          ) : dropError ? (
            <InlineAlert tone="rose">{attendanceErrorMessage(dropError, "Couldn't load shifts and rotations.")}</InlineAlert>
          ) : form.assignType === "shift" ? (
            <div>
              <label htmlFor="assign-shift" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Shift <span className="text-red-400">*</span></label>
              <select id="assign-shift" value={form.shift_id} onChange={(e) => set("shift_id", e.target.value)} className={selectClass(!!errors.shift_id)}>
                <option value="">Select a shift…</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.start_time && s.end_time ? `${fmtClock(s.start_time)}–${fmtClock(s.end_time)}` : `min ${s.min_hours ?? "—"} hrs`} · {s.type || s.shift_type}
                  </option>
                ))}
              </select>
              {shifts.length === 0 && <p className="text-[10px] text-slate-400 mt-1">No active shifts. Create one under Work Shifts.</p>}
              <FieldError message={errors.shift_id} />
            </div>
          ) : (
            <div>
              <label htmlFor="assign-rotation" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Rotation Pattern <span className="text-red-400">*</span></label>
              <select id="assign-rotation" value={form.rotation_pattern_id} onChange={(e) => set("rotation_pattern_id", e.target.value)} className={selectClass(!!errors.rotation_pattern_id)}>
                <option value="">Select a rotation…</option>
                {rotations.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} · {r.rotation_cycle_days}-day cycle</option>
                ))}
              </select>
              {rotations.length === 0 && <p className="text-[10px] text-slate-400 mt-1">No active rotation patterns. Create one under Work Shifts.</p>}
              <FieldError message={errors.rotation_pattern_id} />
            </div>
          )}

          <div>
            <label htmlFor="assign-from" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Effective From <span className="text-red-400">*</span></label>
            <input id="assign-from" type="date" value={form.effective_from} onChange={(e) => set("effective_from", e.target.value)} className={`w-full px-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition ${errors.effective_from ? "border-rose-300" : "border-slate-200"}`} />
            {errors.effective_from ? <FieldError message={errors.effective_from} /> : <p className="text-[10px] text-slate-400 mt-1">Attendance from this date is calculated against the selected schedule. Dates already locked for payroll aren't recalculated.</p>}
          </div>

          <div>
            <label htmlFor="assign-to" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Effective Until <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
            <input id="assign-to" type="date" min={form.effective_from || undefined} value={form.effective_to} onChange={(e) => set("effective_to", e.target.value)} className={`w-full px-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition ${errors.effective_to ? "border-rose-300" : "border-slate-200"}`} />
            {errors.effective_to ? <FieldError message={errors.effective_to} /> : <p className="text-[10px] text-slate-400 mt-1">Leave empty for an open-ended assignment. To change a schedule later, end this assignment and create a new one.</p>}
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={loading} className="px-6 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={loading || dropLoading} className="flex-1 inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition">
              {loading && <Spinner />}
              {loading ? "Saving…" : "Assign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── End Assignment Modal ───────────────────────────────────────────────── */
function EndShiftModal({ assignment, onClose, onSaved }) {
  const from = ymdOnly(assignment.effective_from);
  const [effectiveTo, setEffectiveTo] = useState(from && from > todayYMD() ? from : todayYMD());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    const { errors, payload } = validateEndAssignment({ effective_to: effectiveTo, effective_from: from });
    if (hasErrors(errors)) {
      setError(errors.effective_to);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await attendanceAPI.endShiftAssignment(assignment.id, payload);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "assignment" });
      onSaved("Assignment end date set.");
    } catch (err) {
      setError(attendanceErrorMessage(err, "Couldn't end the assignment."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" role="dialog" aria-modal="true">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">End Assignment</h2>
            <p className="text-xs text-slate-500 mt-1">{assignmentName(assignment)} · {assignment.shift?.name || assignment.rotation_pattern?.name || "Schedule"}</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5" noValidate>
          {error && <InlineAlert tone="rose">{error}</InlineAlert>}
          <div>
            <label htmlFor="end-date" className="block text-xs font-bold text-slate-600 mb-1.5">Last Day on This Schedule <span className="text-red-500">*</span></label>
            <input id="end-date" type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} min={from || undefined} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all" />
            <p className="text-[10px] text-slate-400 mt-1.5">Started {fmtDate(from)}. The history of this assignment is kept.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={loading} className="flex-1 px-5 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50">
              {loading && <Spinner />}
              {loading ? "Saving…" : "End Assignment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Delete Assignment Modal ────────────────────────────────────────────── */
function DeleteShiftModal({ assignment, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await attendanceAPI.deleteShiftAssignment(assignment.id);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "assignment" });
      onSaved("Shift assignment deleted permanently.");
    } catch (err) {
      setError(attendanceErrorMessage(err, "Couldn't delete the assignment."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" role="dialog" aria-modal="true">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">Delete Shift Assignment</h2>
          <button type="button" onClick={onClose} disabled={loading} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
            <HiTrash className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-2">This is a permanent delete.</p>
          <p className="text-sm text-slate-500 mb-6">
            If {assignmentName(assignment)} has already worked on this schedule, <strong>end</strong> the assignment instead so past attendance keeps its shift context.
          </p>
          {error && <InlineAlert tone="rose" className="mb-6">{error}</InlineAlert>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={loading} className="flex-1 px-5 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50">Cancel</button>
            <button type="button" onClick={handleDelete} disabled={loading} className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50">
              {loading && <Spinner />}
              {loading ? "Deleting…" : "Delete Permanently"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATE_FILTERS = [
  { value: "all", label: "All" },
  { value: "ongoing", label: "Ongoing" },
  { value: "scheduled", label: "Upcoming" },
  { value: "ended", label: "Ended" },
];

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function AttendanceRosterPage() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [endModalAssignment, setEndModalAssignment] = useState(null);
  const [deleteModalAssignment, setDeleteModalAssignment] = useState(null);
  const [stateFilter, setStateFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { toast, showToast, clearToast } = useToast();

  useEffect(() => {
    const handleClick = () => setActiveMenuId(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await attendanceAPI.getAssignments();
      setAssignments(listFrom(res, ["assignments"]));
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [stateFilter, search]);

  const today = todayYMD();
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assignments.filter((a) => {
      if (stateFilter !== "all" && assignmentState(a, today) !== stateFilter) return false;
      if (!q) return true;
      return [assignmentName(a), assignmentCode(a), personEmail(a.user || a), a.shift?.name, a.rotation_pattern?.name]
        .some((f) => f && String(f).toLowerCase().includes(q));
    });
  }, [assignments, stateFilter, search, today]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function onSaved(msg, close) {
    close();
    showToast(msg);
    load();
  }

  return (
    <>
      <DashboardTopBar title="Attendance" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Shift Roster</h1>
            <p className="text-sm text-slate-500 mt-1">View and manage which schedule each employee follows.</p>
          </div>
          <button onClick={() => setShowModal(true)} className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition">
            <HiPlus className="w-4 h-4" /> Assign Shift
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <FilterTabs options={STATE_FILTERS} value={stateFilter} onChange={setStateFilter} />
          <div className="relative w-full md:w-72">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee, code or shift…" className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
          </div>
        </div>

        {loading ? (
          <Skeleton type="table" rows={6} />
        ) : loadError ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <ErrorState error={loadError} onRetry={() => { setLoading(true); load(); }} fallback="Couldn't load the roster." />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {assignments.length === 0 ? (
              <EmptyState icon={HiUserGroup} title="No shift assignments yet" message="Assign shifts to employees so the attendance engine knows their expected working hours." />
            ) : filtered.length === 0 ? (
              <EmptyState icon={HiSearch} title="No matching assignments" message="Try a different filter or search term." />
            ) : (
              <>
                <div className={`overflow-x-auto ${pageRows.length <= 2 ? "min-h-[200px]" : ""}`}>
                  <table className="w-full min-w-[820px]">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Emp. Code</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Schedule</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Effective From</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valid Until</th>
                        <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {pageRows.map((a, rowIndex) => {
                        // The table scrolls horizontally, which clips overflow; the
                        // menu on the last rows opens upwards so it stays reachable.
                        const openUp = pageRows.length > 2 && rowIndex >= pageRows.length - 2;
                        const name = assignmentName(a);
                        const email = personEmail(a.user || a);
                        const state = assignmentState(a, today);
                        const label = a.shift?.name || a.rotation_pattern?.name || "—";
                        const times = a.shift?.start_time
                          ? `${fmtClock(a.shift.start_time)} – ${fmtClock(a.shift.end_time)}`
                          : a.rotation_pattern ? `Rotation · ${a.rotation_pattern.rotation_cycle_days ?? "?"}-day cycle` : null;
                        return (
                          <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{initials(name)}</div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-800 truncate">{name}</p>
                                  {email && email !== name && <p className="text-[10px] text-slate-400 truncate">{email}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">{assignmentCode(a) || "—"}</td>
                            <td className="px-6 py-4">
                              <p className="text-xs font-semibold text-slate-800">{label}</p>
                              {times && <p className="text-[10px] text-slate-400">{times}</p>}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-600">{fmtDate(ymdOnly(a.effective_from))}</td>
                            <td className="px-6 py-4">
                              {state === "ended" ? (
                                <span className="text-xs text-slate-500">Ended {fmtDate(ymdOnly(a.effective_to))}</span>
                              ) : a.effective_to ? (
                                <span className="text-xs text-slate-600">{fmtDate(ymdOnly(a.effective_to))}</span>
                              ) : state === "scheduled" ? (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-sky-50 text-sky-700 px-2.5 py-1 rounded-full">Upcoming</span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Ongoing
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => setActiveMenuId(activeMenuId === a.id ? null : a.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" aria-label={`Actions for ${name}`} aria-expanded={activeMenuId === a.id}>
                                  <HiDotsVertical className="w-5 h-5" />
                                </button>
                                {activeMenuId === a.id && (
                                  <div className={`absolute right-0 w-44 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-10 ${openUp ? "bottom-full mb-1" : "mt-1"}`}>
                                    {!a.effective_to && (
                                      <button onClick={() => { setActiveMenuId(null); setEndModalAssignment(a); }} className="w-full text-left px-4 py-2 text-sm font-semibold text-amber-600 hover:bg-amber-50">
                                        End Assignment
                                      </button>
                                    )}
                                    <button onClick={() => { setActiveMenuId(null); setDeleteModalAssignment(a); }} className="w-full text-left px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-4 border-t border-slate-50">
                  <Pagination page={safePage} totalPages={totalPages} total={filtered.length} limit={PAGE_SIZE} onPageChange={setPage} />
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {showModal && <AssignModal onClose={() => setShowModal(false)} onSaved={(msg) => onSaved(msg, () => setShowModal(false))} />}
      {endModalAssignment && <EndShiftModal assignment={endModalAssignment} onClose={() => setEndModalAssignment(null)} onSaved={(msg) => onSaved(msg, () => setEndModalAssignment(null))} />}
      {deleteModalAssignment && <DeleteShiftModal assignment={deleteModalAssignment} onClose={() => setDeleteModalAssignment(null)} onSaved={(msg) => onSaved(msg, () => setDeleteModalAssignment(null))} />}
      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
