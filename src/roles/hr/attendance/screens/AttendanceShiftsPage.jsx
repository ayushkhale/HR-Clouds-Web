import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { attendanceAPI } from "../../../../shared/api";
import {
  HiClock,
  HiPlus,
  HiX,
  HiCheckCircle,
  HiExclamationCircle,
  HiTrash,
  HiPencil,
  HiRefresh,
} from "react-icons/hi";

const SHIFT_TYPES = [
  { value: "fixed", label: "Fixed", desc: "Set start & end time" },
  { value: "flexible", label: "Flexible", desc: "Minimum hours required" },
  { value: "night", label: "Night", desc: "Overnight shift" },
  { value: "split", label: "Split", desc: "Two work sessions" },
  { value: "rotational", label: "Rotational", desc: "Rotating cycle" },
];

const TYPE_COLORS = {
  fixed: "bg-blue-50 text-blue-700",
  flexible: "bg-violet-50 text-violet-700",
  night: "bg-slate-100 text-slate-600",
  split: "bg-amber-50 text-amber-700",
  rotational: "bg-purple-50 text-purple-700",
};

function fmt12(t) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
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

/* ─── Shift Modal (Create / Edit) ────────────────────────────────────────── */
function ShiftModal({ editShift, onClose, onSaved }) {
  const isEdit = !!editShift;
  const [form, setForm] = useState({
    name: editShift?.name || "",
    type: editShift?.type || "fixed",
    start_time: editShift?.start_time?.slice(0, 5) || "09:00",
    end_time: editShift?.end_time?.slice(0, 5) || "18:00",
    min_hours: editShift?.min_hours || 8.5,
    core_start_time: editShift?.core_start_time?.slice(0, 5) || "11:00",
    core_end_time: editShift?.core_end_time?.slice(0, 5) || "15:00",
    split_start_time_2: editShift?.split_start_time_2?.slice(0, 5) || "14:00",
    split_end_time_2: editShift?.split_end_time_2?.slice(0, 5) || "19:00",
    buffer_minutes_before: editShift?.buffer_minutes_before ?? 15,
    buffer_minutes_after: editShift?.buffer_minutes_after ?? 15,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  const isFixed = form.type === "fixed" || form.type === "night";
  const isFlexible = form.type === "flexible";
  const isSplit = form.type === "split";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Shift name is required."); return; }
    const payload = { name: form.name, type: form.type };
    if (isFixed || isSplit) {
      payload.start_time = form.start_time;
      payload.end_time = form.end_time;
      if (form.type === "night") payload.is_overnight = true;
    }
    if (isSplit) {
      payload.split_start_time_2 = form.split_start_time_2;
      payload.split_end_time_2 = form.split_end_time_2;
    }
    if (isFlexible) {
      payload.min_hours = parseFloat(form.min_hours);
      payload.core_start_time = form.core_start_time;
      payload.core_end_time = form.core_end_time;
    }
    payload.buffer_minutes_before = parseInt(form.buffer_minutes_before) || 0;
    payload.buffer_minutes_after = parseInt(form.buffer_minutes_after) || 0;
    setLoading(true); setError("");
    try {
      if (isEdit) {
        await attendanceAPI.updateShift(editShift.id, payload);
        onSaved("Shift updated successfully.");
      } else {
        await attendanceAPI.createShift(payload);
        onSaved("Shift created successfully.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-[78vw] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-10 py-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{isEdit ? "Edit Shift Template" : "Add Shift Template"}</h2>
            <p className="text-sm text-slate-400 mt-0.5">Define working hours for a shift.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-10 py-8 space-y-7">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-5 py-3">
              <HiExclamationCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Shift Name */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Shift Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Morning Shift"
              className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
            />
          </div>

          {/* Shift Type — 4 columns */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Shift Type</label>
            <div className="grid grid-cols-4 gap-3">
              {SHIFT_TYPES.filter((t) => t.value !== "rotational").map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set("type", t.value)}
                  className={`flex flex-col items-start p-4 rounded-xl border-2 text-left transition ${
                    form.type === t.value
                      ? "border-purple-500 bg-purple-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className={`text-sm font-bold ${form.type === t.value ? "text-purple-700" : "text-slate-700"}`}>{t.label}</span>
                  <span className="text-xs text-slate-400 mt-1">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Fixed / Night — Start & End Time */}
          {(isFixed || isSplit) && (
            <div className="grid grid-cols-4 gap-5">
              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Work Starts At</label>
                <input type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)}
                  className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Work Ends At</label>
                <input type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)}
                  className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
              </div>
            </div>
          )}

          {/* Split — Second Block */}
          {isSplit && (
            <div className="bg-slate-50 rounded-xl p-5">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Second Work Block</label>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Starts At</label>
                  <input type="time" value={form.split_start_time_2} onChange={(e) => set("split_start_time_2", e.target.value)}
                    className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Ends At</label>
                  <input type="time" value={form.split_end_time_2} onChange={(e) => set("split_end_time_2", e.target.value)}
                    className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
                </div>
              </div>
            </div>
          )}

          {/* Flexible */}
          {isFlexible && (
            <div className="bg-slate-50 rounded-xl p-5 space-y-5">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Minimum Hours Per Day</label>
                <input type="number" step={0.5} min={1} value={form.min_hours} onChange={(e) => set("min_hours", e.target.value)}
                  className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
                <p className="text-xs text-slate-400 mt-1.5">Employee must log at least this many hours to be counted Present</p>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Must Be In By</label>
                  <input type="time" value={form.core_start_time} onChange={(e) => set("core_start_time", e.target.value)}
                    className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Must Stay Until</label>
                  <input type="time" value={form.core_end_time} onChange={(e) => set("core_end_time", e.target.value)}
                    className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
                </div>
              </div>
              <p className="text-xs text-slate-400">Employee must be at work between these two times every day.</p>
            </div>
          )}

          {/* Buffer Times */}
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Allow Early Entry By (mins)</label>
              <input type="number" min={0} value={form.buffer_minutes_before} onChange={(e) => set("buffer_minutes_before", e.target.value)}
                className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
              <p className="text-xs text-slate-400 mt-1.5">How many mins early an employee can clock in</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Allow Late Entry By (mins)</label>
              <input type="number" min={0} value={form.buffer_minutes_after} onChange={(e) => set("buffer_minutes_after", e.target.value)}
                className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
              <p className="text-xs text-slate-400 mt-1.5">How many mins late an employee can clock in</p>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button type="submit" disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition">
              {loading ? "Saving…" : isEdit ? "Update Shift" : "Save Shift"}
            </button>
            <button type="button" onClick={onClose}
              className="px-8 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Rotation Modal (Create) ────────────────────────────────────────────── */
function RotationModal({ shifts, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    rotation_cycle_days: 21,
    start_reference_date: new Date().toISOString().split("T")[0],
    entries: [{ shift_id: "", sequence_order: 1, duration_days: 14 }],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function addEntry() {
    setForm((f) => ({
      ...f,
      entries: [
        ...f.entries,
        { shift_id: "", sequence_order: f.entries.length + 1, duration_days: 7 },
      ],
    }));
  }

  function removeEntry(i) {
    setForm((f) => ({
      ...f,
      entries: f.entries
        .filter((_, idx) => idx !== i)
        .map((e, idx) => ({ ...e, sequence_order: idx + 1 })),
    }));
  }

  function setEntry(i, k, v) {
    setForm((f) => ({
      ...f,
      entries: f.entries.map((e, idx) => idx === i ? { ...e, [k]: v } : e),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Rotation name is required."); return; }
    if (form.entries.some((en) => !en.shift_id)) { setError("All phases must have a shift selected."); return; }
    setLoading(true); setError("");
    try {
      await attendanceAPI.createRotation({
        name: form.name,
        rotation_cycle_days: parseInt(form.rotation_cycle_days),
        start_reference_date: new Date(form.start_reference_date).toISOString(),
        entries: form.entries.map((en) => ({
          shift_id: en.shift_id,
          sequence_order: en.sequence_order,
          duration_days: parseInt(en.duration_days),
        })),
      });
      onSaved("Rotation pattern created.");
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
            <h2 className="text-base font-bold text-slate-800">Create Rotation Pattern</h2>
            <p className="text-xs text-slate-400 mt-0.5">Define a repeating shift cycle with multiple phases.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Rotation Name <span className="text-red-400">*</span></label>
            <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Production Cycle A"
              className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Repeats Every (days)</label>
              <input type="number" min={1} value={form.rotation_cycle_days} onChange={(e) => setField("rotation_cycle_days", e.target.value)}
                className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
              <p className="text-xs text-slate-400 mt-1.5">Total days before pattern restarts</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Starting From</label>
              <input type="date" value={form.start_reference_date} onChange={(e) => setField("start_reference_date", e.target.value)}
                className="w-full px-5 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
              <p className="text-xs text-slate-400 mt-1.5">Start date of the cycle</p>
            </div>
          </div>

          {/* Shift Sequence */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Shift Sequence</label>
              <button type="button" onClick={addEntry}
                className="flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:text-purple-700 transition">
                <HiPlus className="w-3.5 h-3.5" /> Add Step
              </button>
            </div>
            <div className="space-y-3">
              {form.entries.map((en, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Step {en.sequence_order}</span>
                    {form.entries.length > 1 && (
                      <button type="button" onClick={() => removeEntry(i)}
                        className="text-slate-400 hover:text-red-500 transition">
                        <HiX className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Shift</label>
                      <select value={en.shift_id} onChange={(e) => setEntry(i, "shift_id", e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-purple-500 transition bg-white">
                        <option value="">Select shift…</option>
                        {shifts.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Days on This Shift</label>
                      <input type="number" min={1} value={en.duration_days} onChange={(e) => setEntry(i, "duration_days", e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-purple-500 transition" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition">
              {loading ? "Saving…" : "Create Rotation"}
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
export default function AttendanceShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [rotations, setRotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editShift, setEditShift] = useState(null); // shift object to edit
  const [editShiftLoading, setEditShiftLoading] = useState(null);
  const [showRotationModal, setShowRotationModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingRotation, setDeletingRotation] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    try {
      const [shiftRes, rotationRes] = await Promise.all([
        attendanceAPI.getShifts(),
        attendanceAPI.getRotations(),
      ]);
      setShifts(shiftRes.data || []);
      setRotations(rotationRes.data || []);
    } catch {
      showToast("Failed to load shifts.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Pre-fetch full shift details then open edit modal
  async function handleEditShift(shift) {
    setEditShiftLoading(shift.id);
    try {
      const res = await attendanceAPI.getShift(shift.id);
      setEditShift(res.data || shift);
      setShowShiftModal(true);
    } catch {
      showToast("Failed to load shift details.", "error");
    } finally {
      setEditShiftLoading(null);
    }
  }

  async function handleDeleteShift(shift) {
    if (!window.confirm(`Delete "${shift.name}"? This cannot be undone.`)) return;
    setDeleting(shift.id);
    try {
      await attendanceAPI.deleteShift(shift.id);
      showToast("Shift deleted.");
      load();
    } catch (err) {
      if (err.status === 400) {
        showToast("Cannot delete shift: Employees are currently assigned to it.", "error");
      } else {
        showToast(err.message || "Failed to delete.", "error");
      }
    } finally {
      setDeleting(null);
    }
  }

  async function handleDeleteRotation(rotation) {
    if (!window.confirm(`Delete rotation "${rotation.name}"?`)) return;
    setDeletingRotation(rotation.id);
    try {
      await attendanceAPI.deleteRotation(rotation.id);
      showToast("Rotation pattern deleted.");
      load();
    } catch (err) {
      showToast(err.message || "Failed to delete rotation.", "error");
    } finally {
      setDeletingRotation(null);
    }
  }

  function timingLabel(s) {
    if (s.type === "flexible") return `Min ${s.min_hours} hrs / day`;
    if (s.start_time && s.end_time) return `${fmt12(s.start_time)} – ${fmt12(s.end_time)}`;
    return "—";
  }

  function closeShiftModal() {
    setShowShiftModal(false);
    setEditShift(null);
  }

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-[#1F2937]">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Attendance" />
        <main className="flex-1 overflow-y-auto px-8 py-8 space-y-8">

          {/* ── Shift Templates Section ── */}
          <div>
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <HiClock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-800">Shift Templates</h1>
                  <p className="text-xs text-slate-400 mt-0.5">Define working hours and shift types for your teams.</p>
                </div>
              </div>
              <button onClick={() => { setEditShift(null); setShowShiftModal(true); }}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition">
                <HiPlus className="w-4 h-4" />
                Add Shift
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-16 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-400">Loading shifts…</p>
                </div>
              ) : shifts.length === 0 ? (
                <div className="p-16 flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <HiClock className="w-7 h-7 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">No shifts created yet</p>
                  <p className="text-xs text-slate-400">Add your first shift template to start assigning employees.</p>
                  <button onClick={() => { setEditShift(null); setShowShiftModal(true); }}
                    className="mt-2 flex items-center gap-2 bg-purple-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl">
                    <HiPlus className="w-4 h-4" /> Add Shift
                  </button>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Shift Name</th>
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Working Hours</th>
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {shifts.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-sm font-semibold text-slate-800">{s.name}</td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full capitalize ${TYPE_COLORS[s.type] || "bg-slate-100 text-slate-600"}`}>
                            {s.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-600">{timingLabel(s)}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${s.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                            {s.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => handleEditShift(s)} disabled={editShiftLoading === s.id}
                              className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition disabled:opacity-50" title="Edit shift">
                              {editShiftLoading === s.id
                                ? <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                                : <HiPencil className="w-4 h-4" />}
                            </button>
                            <button onClick={() => handleDeleteShift(s)} disabled={deleting === s.id}
                              className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-50" title="Delete shift">
                              <HiTrash className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Rotation Patterns Section ── */}
          <div>
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <HiRefresh className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Rotation Patterns</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Employees on rotating shifts cycle through different shift timings automatically.</p>
                </div>
              </div>
              <button onClick={() => setShowRotationModal(true)}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition">
                <HiPlus className="w-4 h-4" />
                Add Rotation
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-12 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-400">Loading rotations…</p>
                </div>
              ) : rotations.length === 0 ? (
                <div className="p-12 flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <HiRefresh className="w-7 h-7 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">No rotation patterns yet</p>
                  <p className="text-xs text-slate-400">Create a rotation for factories, hospitals, or support teams.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rotation Name</th>
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cycle (days)</th>
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phases</th>
                      <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rotations.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-sm font-semibold text-slate-800">{r.name}</td>
                        <td className="px-6 py-4 text-xs text-slate-600">{r.rotation_cycle_days} days</td>
                        <td className="px-6 py-4 text-xs text-slate-600">{r.entries?.length || 0} phases</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${r.is_active ? "bg-purple-50 text-purple-700" : "bg-slate-100 text-slate-500"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${r.is_active ? "bg-purple-500" : "bg-slate-400"}`} />
                            {r.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => handleDeleteRotation(r)} disabled={deletingRotation === r.id}
                            className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-50" title="Delete rotation">
                            <HiTrash className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </main>
      </div>

      {showShiftModal && (
        <ShiftModal
          editShift={editShift}
          onClose={closeShiftModal}
          onSaved={(msg) => { closeShiftModal(); showToast(msg); load(); }}
        />
      )}

      {showRotationModal && (
        <RotationModal
          shifts={shifts.filter((s) => s.is_active)}
          onClose={() => setShowRotationModal(false)}
          onSaved={(msg) => { setShowRotationModal(false); showToast(msg); load(); }}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
