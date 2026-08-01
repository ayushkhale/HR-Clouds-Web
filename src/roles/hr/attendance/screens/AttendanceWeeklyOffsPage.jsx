import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../../shared/api";
import {
  HiTemplate, HiPlus, HiX, HiCheckCircle,
  HiExclamationCircle, HiTrash,
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

/* ─── Modal ──────────────────────────────────────────────────────────────── */
function WeeklyOffModal({ onClose, onSaved }) {
  const [scope, setScope] = useState("global"); // "global" | "shift"
  const [selectedDays, setSelectedDays] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [selectedShift, setSelectedShift] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadingShifts, setLoadingShifts] = useState(false);

  useEffect(() => {
    if (scope === "shift") {
      setLoadingShifts(true);
      attendanceAPI.getShifts()
        .then((res) => setShifts(res.data || []))
        .catch(() => setShifts([]))
        .finally(() => setLoadingShifts(false));
    }
  }, [scope]);

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
      // API sends one rule per day
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Add Weekly Off Rule</h2>
            <p className="text-xs text-slate-400 mt-0.5">Configure off days for your organisation or a specific shift.</p>
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
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Applies To</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "global", label: "Company-wide", desc: "Applies to all employees" },
                { value: "shift", label: "Specific Shift", desc: "Exception for one shift" },
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
              {loadingShifts ? (
                <p className="text-xs text-slate-400">Loading shifts…</p>
              ) : (
                <select value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white">
                  <option value="">Select a shift…</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Day Chips */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Off Days</label>
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
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Effective From</label>
            <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
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

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function AttendanceWeeklyOffsPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [deleting, setDeleting] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    try {
      const res = await attendanceAPI.getWeeklyOffs();
      setRules(res.data || []);
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

  function dayName(v) {
    return DAYS.find((d) => d.value === v)?.full || `Day ${v}`;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Attendance" />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
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

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-16 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400">Loading rules…</p>
              </div>
            ) : rules.length === 0 ? (
              <div className="p-16 flex flex-col items-center gap-3 text-center">
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
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scope</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Off Day</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Shift</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Effective From</th>
                    <th className="px-6 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${r.shift_id ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {r.shift_id ? "Shift-specific" : "Company-wide"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-800">{dayName(r.day_of_week)}</td>
                      <td className="px-6 py-4 text-xs text-slate-500">{r.shift_id ? (r.shift?.name || r.shift_id.slice(0, 8) + "…") : "—"}</td>
                      <td className="px-6 py-4 text-xs text-slate-600">
                        {r.effective_from ? new Date(r.effective_from).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => handleDelete(r)} disabled={deleting === r.id}
                          className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-50">
                          <HiTrash className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
      {showModal && (
        <WeeklyOffModal
          onClose={() => setShowModal(false)}
          onSaved={(msg) => { setShowModal(false); showToast(msg); load(); }}
        />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
