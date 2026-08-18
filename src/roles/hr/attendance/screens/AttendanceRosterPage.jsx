import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { attendanceAPI, organizationAPI } from "../../../../shared/api";
import {
  HiUserGroup, HiPlus, HiX, HiCheckCircle,
  HiExclamationCircle, HiSearch,
} from "react-icons/hi";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Resolve employee display name from the nested structure returned by GET /shifts/assignments
function resolveEmployeeName(a) {
  const profile = a.user?.profile;
  if (profile?.display_name) return profile.display_name;
  if (profile?.first_name) return `${profile.first_name}${profile.last_name ? " " + profile.last_name : ""}`.trim();
  return a.user?.identifier || (a.user_id ? a.user_id.slice(0, 8) + "…" : "—");
}

function resolveEmployeeInitial(a) {
  return resolveEmployeeName(a).charAt(0).toUpperCase();
}

function resolveEmployeeEmail(a) {
  return a.user?.identifier_type === "email" ? a.user.identifier : null;
}

function resolveEmployeeCode(a) {
  return (
    a.user?.employee_profile?.employee_code ||
    a.user?.manager_profile?.employee_code ||
    a.user?.hr_profile?.employee_code ||
    null
  );
}

/* ─── Toast ─────────────────────────────────────────────────────────────── */
function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold ${ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
      {ok ? <HiCheckCircle className="w-5 h-5 text-emerald-500" /> : <HiExclamationCircle className="w-5 h-5 text-red-500" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 text-slate-400" /></button>
    </div>
  );
}

/* ─── Assign Modal ───────────────────────────────────────────────────────── */
function AssignModal({ onClose, onSaved }) {
  const [shifts, setShifts] = useState([]);
  const [rotations, setRotations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignType, setAssignType] = useState("shift"); // "shift" | "rotation"
  const [form, setForm] = useState({
    user_id: "",
    shift_id: "",
    rotation_pattern_id: "",
    effective_from: new Date().toISOString().split("T")[0],
  });
  const [loading, setLoading] = useState(false);
  const [dropLoading, setDropLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Load shifts + rotations + employees simultaneously
  useEffect(() => {
    Promise.all([
      attendanceAPI.getShifts(),
      attendanceAPI.getRotations(),
      organizationAPI.getEmployees({ purpose: "shift_assignment" }),
    ])
      .then(([shiftRes, rotationRes, empRes]) => {
        setShifts(shiftRes.data || []);
        setRotations(rotationRes.data || []);
        const members = empRes.data || [];
        setEmployees(Array.isArray(members) ? members : (members.employees || members.members || []));
      })
      .catch(() => {})
      .finally(() => setDropLoading(false));
  }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  // Filter employees for the search box — employees from org API have simpler structure
  const filteredEmployees = employees.filter((e) => {
    const name = e.profile?.display_name || e.profile?.first_name || e.user?.name || e.name || e.identifier || "";
    const email = e.identifier || e.user?.identifier || "";
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      email.toLowerCase().includes(search.toLowerCase())
    );
  });

  function getEmployeeId(e) {
    return e.user_id || e.employee_id || e.id;
  }

  function getEmployeeDisplayName(e) {
    if (e.profile?.display_name) return e.profile.display_name;
    if (e.profile?.first_name) return `${e.profile.first_name} ${e.profile.last_name || ""}`.trim();
    if (e.user?.name) return e.user.name;
    return e.name || e.identifier || getEmployeeId(e);
  }

  function getEmployeeEmail(e) {
    return e.identifier || e.user?.identifier || e.email || "";
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!form.user_id) { setError("Please select an employee."); return; }
    if (assignType === "shift" && !form.shift_id) { setError("Please select a shift."); return; }
    if (assignType === "rotation" && !form.rotation_pattern_id) { setError("Please select a rotation pattern."); return; }
    if (!form.effective_from) { setError("Please select an effective from date."); return; }
    setLoading(true); setError("");
    try {
      const payload = {
        user_id: form.user_id,
        effective_from: new Date(form.effective_from).toISOString(),
      };
      if (assignType === "shift") {
        payload.shift_id = form.shift_id;
      } else {
        payload.rotation_pattern_id = form.rotation_pattern_id;
      }
      await attendanceAPI.assignShift(payload);
      onSaved("Shift assigned successfully.");
    } catch (err) {
      setError(err.message || "Failed to assign shift.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Assign Shift</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Pick an employee and choose which shift they should work. Their current shift ends the day before the new one starts.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {dropLoading ? (
            <div className="py-8 flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-400">Loading employees and shifts…</p>
            </div>
          ) : (
            <>
              {/* Employee Search + Select */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Employee <span className="text-red-400">*</span></label>
                <div className="relative mb-2">
                  <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search employee…"
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
                </div>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-50">
                  {filteredEmployees.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-slate-400">
                      {employees.length === 0 ? "No employees found. Invite employees first." : "No results."}
                    </p>
                  ) : (
                    filteredEmployees.map((e) => {
                      const id = getEmployeeId(e);
                      const name = getEmployeeDisplayName(e);
                      const email = getEmployeeEmail(e);
                      const isSelected = form.user_id === id;
                      return (
                        <button key={id} type="button" onClick={() => set("user_id", id)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${isSelected ? "bg-purple-50" : "hover:bg-slate-50"}`}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isSelected ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold truncate ${isSelected ? "text-purple-700" : "text-slate-800"}`}>{name}</p>
                            {email && <p className="text-[10px] text-slate-400 truncate">{email}</p>}
                          </div>
                          {isSelected && <HiCheckCircle className="w-4 h-4 text-purple-500 ml-auto flex-shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Assignment Type Toggle */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">What kind of shift?</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "shift", label: "Fixed Shift", desc: "Same shift every day" },
                    { value: "rotation", label: "Rotating Shifts", desc: "Shifts change on a cycle" },
                  ].map((t) => (
                    <button key={t.value} type="button" onClick={() => setAssignType(t.value)}
                      className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition ${assignType === t.value ? "border-purple-500 bg-purple-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <span className={`text-xs font-bold ${assignType === t.value ? "text-purple-700" : "text-slate-700"}`}>{t.label}</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Shift or Rotation Select */}
              {assignType === "shift" ? (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Select Shift <span className="text-red-400">*</span></label>
                  <select value={form.shift_id} onChange={(e) => set("shift_id", e.target.value)}
                    className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white">
                    <option value="">Select a shift…</option>
                    {shifts.filter((s) => s.is_active).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.start_time && s.end_time ? `(${s.start_time} – ${s.end_time})` : `(${s.type})`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Select Rotation Pattern <span className="text-red-400">*</span></label>
                  <select value={form.rotation_pattern_id} onChange={(e) => set("rotation_pattern_id", e.target.value)}
                    className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white">
                    <option value="">Select a rotation…</option>
                    {rotations.filter((r) => r.is_active).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.rotation_cycle_days}-day cycle)
                      </option>
                    ))}
                  </select>
                  {rotations.length === 0 && (
                    <p className="text-[10px] text-slate-400 mt-1">No rotation patterns found. Create one in Shift Templates.</p>
                  )}
                </div>
              )}

              {/* Effective From */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Starting From <span className="text-red-400">*</span></label>
                <input type="date" value={form.effective_from} onChange={(e) => set("effective_from", e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
                <p className="text-[10px] text-slate-400 mt-1">Their current shift ends the day before this date.</p>
              </div>
            </>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={loading || dropLoading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition">
              {loading ? "Assigning…" : "Assign Shift"}
            </button>
            <button type="button" onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function AttendanceRosterPage() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    try {
      const res = await attendanceAPI.getAssignments();
      setAssignments(res.data || []);
    } catch {
      showToast("Failed to load roster.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-[#1F2937]">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Attendance" />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Shift Roster</h1>
              <p className="text-sm text-slate-500 mt-1">View and manage shift assignments for all employees.</p>
            </div>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition">
              <HiPlus className="w-4 h-4" /> Assign Shift
            </button>
          </div>

          {/* Table */}
          {loading ? (
            <Skeleton type="table" rows={6} />
          ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {assignments.length === 0 ? (
              <div className="p-16 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <HiUserGroup className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No shift assignments yet</p>
                <p className="text-xs text-slate-400 max-w-xs">Assign shifts to employees so the attendance engine knows their expected working hours.</p>
                <button onClick={() => setShowModal(true)}
                  className="mt-2 flex items-center gap-2 bg-purple-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl">
                  <HiPlus className="w-4 h-4" /> Assign Shift
                </button>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Emp. Code</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Shift</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Effective From</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valid Until</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {assignments.map((a) => {
                    const name = resolveEmployeeName(a);
                    const initial = resolveEmployeeInitial(a);
                    const email = resolveEmployeeEmail(a);
                    const empCode = resolveEmployeeCode(a);
                    const shiftLabel = a.shift?.name || a.rotation_pattern?.name || "—";
                    const shiftTimes = a.shift?.start_time
                      ? `${a.shift.start_time.slice(0, 5)} – ${a.shift.end_time?.slice(0, 5) || "?"}`
                      : a.rotation_pattern ? "Rotation" : null;

                    return (
                      <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {initial}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-800">{name}</p>
                              {email && <p className="text-[10px] text-slate-400">{email}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">{empCode || "—"}</td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{shiftLabel}</p>
                            {shiftTimes && (
                              <p className="text-[10px] text-slate-400">{shiftTimes}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-600">{fmtDate(a.effective_from)}</td>
                        <td className="px-6 py-4">
                          {a.effective_to ? (
                            <span className="text-xs text-slate-600">{fmtDate(a.effective_to)}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Ongoing
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          )}
        </main>
      </div>

      {showModal && (
        <AssignModal
          onClose={() => setShowModal(false)}
          onSaved={(msg) => { setShowModal(false); showToast(msg); load(); }}
        />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
