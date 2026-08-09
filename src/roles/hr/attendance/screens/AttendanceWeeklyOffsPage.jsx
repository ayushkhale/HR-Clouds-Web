import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { attendanceAPI } from "../../../../shared/api";
import {
  HiTemplate, HiPlus, HiX, HiCheckCircle,
  HiExclamationCircle, HiTrash, HiPencil,
} from "react-icons/hi";

const DAYS = [
  { label: "Sun", full: "Sunday", value: 0 },
  { label: "Mon", full: "Monday", value: 1 },
  { label: "Tue", full: "Tuesday", value: 2 },
  { label: "Wed", full: "Wednesday", value: 3 },
  { label: "Thu", full: "Thursday", value: 4 },
  { label: "Fri", full: "Friday", value: 5 },
  { label: "Sat", full: "Saturday", value: 6 },
];

function dayName(v) {
  return DAYS.find((d) => d.value === v)?.full || `Day ${v}`;
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

/* ─── Create Modal ───────────────────────────────────────────────────────── */
function WeeklyOffModal({ shifts, onClose, onSaved }) {
  const [scope, setScope] = useState("global"); // "global" | "shift"
  const [selectedDays, setSelectedDays] = useState([]);
  const [selectedShift, setSelectedShift] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleDay(val) {
    setSelectedDays((prev) =>
      prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (selectedDays.length === 0) { setError("Please select at least one day."); return; }
    if (scope === "shift" && !selectedShift) { setError("Please select a shift."); return; }
    setLoading(true); setError("");
    try {
      for (const day of selectedDays) {
        const payload = {
          day_of_week: day,
          effective_from: new Date(effectiveFrom).toISOString(),
        };
        if (scope === "shift") payload.shift_id = selectedShift;
        await attendanceAPI.createWeeklyOff(payload);
      }
      onSaved(`Weekly off rule${selectedDays.length > 1 ? "s" : ""} saved successfully.`);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Add Day Off Rule</h2>
            <p className="text-xs text-slate-400 mt-0.5">Choose which days are non-working for your whole company or a specific shift.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {/* Scope */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Who does this apply to?</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "global", label: "Everyone", desc: "All employees company-wide" },
                { value: "shift", label: "One Shift Only", desc: "Override for a specific shift" },
              ].map((s) => (
                <button key={s.value} type="button" onClick={() => setScope(s.value)}
                  className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition ${
                    scope === s.value ? "border-purple-500 bg-purple-50" : "border-slate-200 hover:border-slate-300"
                  }`}>
                  <span className={`text-xs font-bold ${scope === s.value ? "text-purple-700" : "text-slate-700"}`}>{s.label}</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Shift Selector */}
          {scope === "shift" && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Select Shift</label>
              <select value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white">
                <option value="">Select a shift…</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
                ))}
              </select>
            </div>
          )}

          {/* Day Chips */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Days Off</label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map((d) => {
                const active = selectedDays.includes(d.value);
                return (
                  <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border-2 transition ${
                      active
                        ? "bg-purple-600 text-white border-purple-600 shadow-sm shadow-purple-200"
                        : "bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:text-purple-600"
                    }`}>
                    {d.label}
                  </button>
                );
              })}
            </div>
            {selectedDays.length > 0 && (
              <p className="text-[10px] text-slate-400 mt-2">
                Selected: {selectedDays.map((v) => DAYS.find((d) => d.value === v)?.full).join(", ")}
              </p>
            )}
          </div>

          {/* Effective From */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Starting From</label>
            <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
            <p className="text-[10px] text-slate-400 mt-1">These days will be treated as non-working from this date onwards.</p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition">
              {loading ? "Saving…" : "Save Rules"}
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

/* ─── Edit Modal ─────────────────────────────────────────────────────────── */
function EditWeeklyOffModal({ rule, shifts, onClose, onSaved }) {
  const [dayOfWeek, setDayOfWeek] = useState(rule.day_of_week);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await attendanceAPI.updateWeeklyOff(rule.id, { day_of_week: dayOfWeek });
      onSaved("Weekly off rule updated.");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Find shift name for this rule
  const shiftObj = shifts.find((s) => s.id === rule.shift_id);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Edit Weekly Off Rule</h2>
            {rule.shift_id && (
              <p className="text-xs text-slate-400 mt-0.5">Applies to: {shiftObj?.name || rule.shift_id}</p>
            )}
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
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Off Day</label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map((d) => (
                <button key={d.value} type="button" onClick={() => setDayOfWeek(d.value)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border-2 transition ${
                    dayOfWeek === d.value
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-purple-300"
                  }`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition">
              {loading ? "Saving…" : "Update Rule"}
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
export default function AttendanceWeeklyOffsPage() {
  const [rules, setRules] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [toast, setToast] = useState(null);
  const [deleting, setDeleting] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    try {
      const [rulesRes, shiftsRes] = await Promise.all([
        attendanceAPI.getWeeklyOffs(),
        attendanceAPI.getShifts(),
      ]);
      setRules(rulesRes.data || []);
      setShifts(shiftsRes.data || []);
    } catch {
      showToast("Failed to load weekly off rules.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(rule) {
    if (!window.confirm("Remove this weekly off rule?")) return;
    setDeleting(rule.id);
    try {
      await attendanceAPI.deleteWeeklyOff(rule.id);
      showToast("Rule removed.");
      load();
    } catch (err) {
      showToast(err.message || "Failed to delete.", "error");
    } finally {
      setDeleting(null);
    }
  }

  function shiftName(shiftId) {
    return shifts.find((s) => s.id === shiftId)?.name || null;
  }

  // Split rules into global and shift-specific
  const globalRules = rules.filter((r) => !r.shift_id);
  const shiftSpecificRules = rules.filter((r) => !!r.shift_id);

  function RuleRow({ r }) {
    return (
      <tr className="hover:bg-slate-50/50 transition-colors">
        <td className="px-6 py-4 text-sm font-semibold text-slate-800">{dayName(r.day_of_week)}</td>
        <td className="px-6 py-4 text-xs text-slate-500">
          {r.shift_id ? (shiftName(r.shift_id) || r.shift_id.slice(0, 8) + "…") : "—"}
        </td>
        <td className="px-6 py-4 text-xs text-slate-600">
          {r.effective_from
            ? new Date(r.effective_from).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
            : "—"}
        </td>
        <td className="px-6 py-4">
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${r.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${r.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
            {r.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td className="px-6 py-4 text-right">
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setEditRule(r)}
              className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition" title="Edit rule">
              <HiPencil className="w-4 h-4" />
            </button>
            <button onClick={() => handleDelete(r)} disabled={deleting === r.id}
              className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-50">
              <HiTrash className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function RulesTable({ title, badge, badgeColor, rows, emptyMsg }) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-700">{title}</h2>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
            {badge}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-xs text-slate-400">{emptyMsg}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Off Day</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Shift</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Effective From</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => <RuleRow key={r.id} r={r} />)}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-[#1F2937]">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Attendance" />
        <main className="flex-1 overflow-y-auto px-8 py-8 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <HiTemplate className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Weekly Off Configuration</h1>
                <p className="text-xs text-slate-400 mt-0.5">Define which days of the week are non-working for your teams.</p>
              </div>
            </div>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition">
              <HiPlus className="w-4 h-4" /> Add Rule
            </button>
          </div>

          {loading ? (
            <Skeleton type="table" rows={4} />
          ) : rules.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                <HiTemplate className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No weekly off rules yet</p>
              <p className="text-xs text-slate-400">Configure weekends so the attendance engine knows non-working days.</p>
              <button onClick={() => setShowModal(true)}
                className="mt-2 flex items-center gap-2 bg-purple-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl">
                <HiPlus className="w-4 h-4" /> Add Rule
              </button>
            </div>
          ) : (
            <>
              {/* Global Weekends */}
              <RulesTable
                title="Global Weekends"
                badge={`${globalRules.length} rule${globalRules.length !== 1 ? "s" : ""}`}
                badgeColor="bg-emerald-100 text-emerald-700"
                rows={globalRules}
                emptyMsg="No company-wide weekend rules configured."
              />

              {/* Shift-Specific Exceptions */}
              <RulesTable
                title="Shift-Specific Exceptions"
                badge={`${shiftSpecificRules.length} rule${shiftSpecificRules.length !== 1 ? "s" : ""}`}
                badgeColor="bg-violet-100 text-violet-700"
                rows={shiftSpecificRules}
                emptyMsg="No shift-specific exceptions configured."
              />
            </>
          )}
        </main>
      </div>

      {showModal && (
        <WeeklyOffModal
          shifts={shifts.filter((s) => s.is_active)}
          onClose={() => setShowModal(false)}
          onSaved={(msg) => { setShowModal(false); showToast(msg); load(); }}
        />
      )}

      {editRule && (
        <EditWeeklyOffModal
          rule={editRule}
          shifts={shifts}
          onClose={() => setEditRule(null)}
          onSaved={(msg) => { setEditRule(null); showToast(msg); load(); }}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
