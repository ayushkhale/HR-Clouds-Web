import React, { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { attendanceAPI } from "../../../../shared/api";
import { attendanceErrorMessage } from "../../../../shared/utils/attendanceErrors";
import AssignShiftDialog from "../components/AssignShiftDialog";
import { shiftHours } from "../shiftMeta";
import { validateEndAssignment, hasErrors } from "../../../../shared/attendance/validation";
import { listFrom, personName, personEmail, employeeCode } from "../../../../shared/attendance/normalize";
import { fmtDate, todayYMD, ymdOnly } from "../../../../shared/attendance/dates";
import { emitAttendanceChanged, ATTENDANCE_EVENTS } from "../../../../shared/attendance/events";
import { EmptyState, ErrorState, FilterTabs, InlineAlert, Pagination, Spinner, Toast, useToast } from "../../../../shared/attendance/ui";
import { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";
import { HiUserGroup, HiPlus, HiX, HiSearch, HiDotsVertical, HiTrash, HiClock, HiCalendar, HiUser } from "react-icons/hi";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import GenderAvatar from "../../../../shared/components/GenderAvatar";

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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
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
            <label htmlFor="end-date" className="block text-xs font-bold text-slate-600 mb-1.5">Last Day on This Schedule <span className="text-rose-500">*</span></label>
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" role="dialog" aria-modal="true">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">Delete Shift Assignment</h2>
          <button type="button" onClick={onClose} disabled={loading} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
            <HiTrash className="w-6 h-6 text-rose-500" />
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-2">This is a permanent delete.</p>
          <p className="text-sm text-slate-500 mb-6">
            If {assignmentName(assignment)} has already worked on this schedule, <strong>end</strong> the assignment instead so past attendance keeps its shift context.
          </p>
          {error && <InlineAlert tone="rose" className="mb-6">{error}</InlineAlert>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={loading} className="flex-1 px-5 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50">Cancel</button>
            <button type="button" onClick={handleDelete} disabled={loading} className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-50">
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
  const [preview, setPreview] = useState(null);

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
      <DashboardTopBar title="Shift Management" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900"><HelpLabel text="Shift Management" help={{ surface: "attendance.roster", field: "page", label: "the Shift Management page" }} /></h1>
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
                        const label = a.shift?.name || a.rotation_pattern?.name || "N/A";
                        const times = a.shift
                          ? shiftHours(a.shift) || null
                          : a.rotation_pattern ? `Rotation · ${a.rotation_pattern.rotation_cycle_days ?? "?"}-day cycle` : null;
                        return (
                          <tr key={a.id} {...rowPreviewProps(() => setPreview(a), `View ${name}'s schedule`)}>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 text-xs"><GenderAvatar person={a.user || a} name={name} /></div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-800 truncate">{name}</p>
                                  {email && email !== name && <p className="text-[10px] text-slate-400 truncate">{email}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">{assignmentCode(a) || "N/A"}</td>
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
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full">Upcoming</span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-violet-50 text-violet-700 px-2.5 py-1 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Ongoing
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
                                      <button onClick={() => { setActiveMenuId(null); setEndModalAssignment(a); }} className="w-full text-left px-4 py-2 text-sm font-semibold text-fuchsia-600 hover:bg-fuchsia-50">
                                        End Assignment
                                      </button>
                                    )}
                                    <button onClick={() => { setActiveMenuId(null); setDeleteModalAssignment(a); }} className="w-full text-left px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">
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

      {showModal && <AssignShiftDialog onClose={() => setShowModal(false)} onSaved={(msg) => onSaved(msg, () => setShowModal(false))} />}
      {endModalAssignment && <EndShiftModal assignment={endModalAssignment} onClose={() => setEndModalAssignment(null)} onSaved={(msg) => onSaved(msg, () => setEndModalAssignment(null))} />}
      {deleteModalAssignment && <DeleteShiftModal assignment={deleteModalAssignment} onClose={() => setDeleteModalAssignment(null)} onSaved={(msg) => onSaved(msg, () => setDeleteModalAssignment(null))} />}
      {preview && (() => {
        const a = preview;
        const name = assignmentName(a);
        const email = personEmail(a.user || a);
        const state = assignmentState(a, today);
        const stateLabel = { ongoing: "Ongoing", scheduled: "Upcoming", ended: "Ended" }[state];
        const shift = a.shift;
        const rot = a.rotation_pattern;
        const secondaryBtn = "px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition";
        return (
          <DetailDialog
            eyebrow="Shift assignment"
            icon={HiUserGroup}
            title={name}
            subtitle={email && email !== name ? email : undefined}
            badge={<DetailPill tone="onDark">{stateLabel}</DetailPill>}
            onClose={() => setPreview(null)}
            footer={
              <>
                <button onClick={() => { setPreview(null); setDeleteModalAssignment(a); }} className={secondaryBtn}>Delete</button>
                {!a.effective_to && (
                  <button onClick={() => { setPreview(null); setEndModalAssignment(a); }} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200">End assignment</button>
                )}
              </>
            }
          >
            <DetailSection title="Employee" icon={HiUser}>
              <DetailGrid cols={3} items={[["Name", name], { label: "Employee code", value: assignmentCode(a), mono: true }, ["Email", email]]} />
            </DetailSection>
            <DetailSection title="Schedule" icon={HiClock}>
              <DetailGrid
                items={shift
                  ? [
                    ["Shift", shift.name],
                    ["Shift type", (shift.type || shift.shift_type || "").replace(/_/g, " ")],
                    ["Working hours", shiftHours(shift) || "Not set"],
                    ["Ends next day", shift.is_overnight ? "Yes" : "No"],
                  ]
                  : [
                    ["Rotation", rot?.name],
                    ["Schedule type", rot ? "Rotation" : null],
                    ["Repeats every", rot?.rotation_cycle_days != null ? `${rot.rotation_cycle_days} days` : null],
                    ["Rotation status", rot ? (rot.is_active === false ? "Inactive" : "Active") : null],
                  ]}
              />
            </DetailSection>
            <DetailSection title="Dates" icon={HiCalendar}>
              <DetailGrid
                cols={3}
                items={[
                  ["Effective from", fmtDate(ymdOnly(a.effective_from))],
                  ["Valid until", a.effective_to ? fmtDate(ymdOnly(a.effective_to)) : "Open-ended"],
                  ["Status", stateLabel],
                ]}
              />
            </DetailSection>
          </DetailDialog>
        );
      })()}
      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
