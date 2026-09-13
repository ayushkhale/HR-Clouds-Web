import React, { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { attendanceAPI } from "../../../../shared/api";
import { attendanceErrorMessage } from "../../../../shared/utils/attendanceErrors";
import { validateShift, validateRotation, hasErrors, ROTATION_CYCLE_MAX } from "../../../../shared/attendance/validation";
import { listFrom, unwrap } from "../../../../shared/attendance/normalize";
import { todayYMD, ymdOnly, fmtDate } from "../../../../shared/attendance/dates";
import { emitAttendanceChanged, ATTENDANCE_EVENTS } from "../../../../shared/attendance/events";
import { ErrorState, FieldError, InlineAlert, Spinner, Toast, useToast } from "../../../../shared/attendance/ui";
import {
  HiClock,
  HiPlus,
  HiX,
  HiTrash,
  HiPencil,
  HiRefresh,
  HiInformationCircle,
} from "react-icons/hi";

// Rotational schedules are built from shift templates in the Rotation Patterns
// section and assigned via the roster, so the template picker offers the four
// concrete shift types only.
const SHIFT_TYPE_OPTIONS = [
  { value: "fixed", label: "Fixed", desc: "Set start & end time" },
  { value: "flexible", label: "Flexible", desc: "Minimum hours required" },
  { value: "night", label: "Night", desc: "Crosses midnight" },
  { value: "split", label: "Split", desc: "Two work blocks" },
];

const TYPE_COLORS = {
  fixed: "bg-blue-50 text-blue-700",
  flexible: "bg-violet-50 text-violet-700",
  night: "bg-slate-100 text-slate-600",
  split: "bg-amber-50 text-amber-700",
  rotational: "bg-purple-50 text-purple-700",
};

const shiftType = (s) => s?.type || s?.shift_type || "fixed";

function fmt12(t) {
  const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "—";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

const inputClass = (invalid) =>
  `w-full px-4 py-3 text-sm border rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition ${invalid ? "border-rose-300" : "border-slate-200"}`;

const Label = ({ htmlFor, children, required }) => (
  <label htmlFor={htmlFor} className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
    {children} {required && <span className="text-red-400">*</span>}
  </label>
);

/* ─── Shift Modal (Create / Edit) ────────────────────────────────────────── */
function ShiftModal({ editShift, policies, onClose, onSaved }) {
  const isEdit = !!editShift;
  const activePolicies = policies.filter((p) => p.is_active !== false || p.id === editShift?.policy_id);
  const defaultPolicy = activePolicies.find((p) => p.is_default);
  const hhmm = (v, d) => (v ? String(v).slice(0, 5) : d);

  const [form, setForm] = useState({
    name: editShift?.name || "",
    type: shiftType(editShift) === "rotational" ? "fixed" : shiftType(editShift),
    policy_id: isEdit ? editShift?.policy_id || editShift?.policy?.id || "" : defaultPolicy?.id || "",
    start_time: hhmm(editShift?.start_time, "09:00"),
    end_time: hhmm(editShift?.end_time, "18:00"),
    min_hours: editShift?.min_hours ?? "8",
    core_start_time: hhmm(editShift?.core_start_time, ""),
    core_end_time: hhmm(editShift?.core_end_time, ""),
    split_start_time_2: hhmm(editShift?.split_start_time_2, "14:00"),
    split_end_time_2: hhmm(editShift?.split_end_time_2, "19:00"),
    buffer_minutes_before: editShift?.buffer_minutes_before ?? 15,
    buffer_minutes_after: editShift?.buffer_minutes_after ?? 15,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  }

  const isTimed = form.type === "fixed" || form.type === "night" || form.type === "split";
  const crossesMidnight = isTimed && form.type !== "split" && form.end_time && form.start_time && form.end_time < form.start_time;

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    const hadPolicy = !!(editShift?.policy_id || editShift?.policy?.id);
    const { errors: v, payload } = validateShift(form, { isEdit, hadPolicy });
    const clean = Object.fromEntries(Object.entries(v).filter(([, msg]) => msg));
    setErrors(clean);
    if (hasErrors(clean)) {
      setError("Please fix the highlighted fields.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (isEdit) await attendanceAPI.updateShift(editShift.id, payload);
      else await attendanceAPI.createShift(payload);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "shift" });
      onSaved(isEdit ? "Shift updated successfully." : "Shift created successfully.");
    } catch (err) {
      setError(attendanceErrorMessage(err, "Couldn't save the shift."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-6 sm:px-10 py-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{isEdit ? "Edit Shift Template" : "Add Shift Template"}</h2>
            <p className="text-sm text-slate-400 mt-0.5">Define working hours and the attendance policy this shift follows.</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 sm:px-10 py-8 space-y-7" noValidate>
          {error && <InlineAlert tone="rose">{error}</InlineAlert>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label htmlFor="shift-name" required>Shift Name</Label>
              <input id="shift-name" type="text" maxLength={150} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Morning Shift" className={inputClass(!!errors.name)} />
              <FieldError message={errors.name} />
            </div>
            <div>
              <Label htmlFor="shift-policy">Attendance Policy</Label>
              <select id="shift-policy" value={form.policy_id} onChange={(e) => set("policy_id", e.target.value)} className={`${inputClass(false)} bg-white`}>
                <option value="">No linked policy (organisation default applies)</option>
                {activePolicies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.is_default ? " · Default" : ""}{p.is_active === false ? " · Inactive" : ""}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1.5">Grace period, half/full-day thresholds, breaks and overtime come from this policy.</p>
            </div>
          </div>

          <div>
            <Label>Shift Type</Label>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {SHIFT_TYPE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set("type", t.value)}
                  aria-pressed={form.type === t.value}
                  className={`flex flex-col items-start p-4 rounded-xl border-2 text-left transition ${form.type === t.value ? "border-purple-500 bg-purple-50" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <span className={`text-sm font-bold ${form.type === t.value ? "text-purple-700" : "text-slate-700"}`}>{t.label}</span>
                  <span className="text-xs text-slate-400 mt-1">{t.desc}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
              <HiInformationCircle className="w-3.5 h-3.5" /> Need rotating schedules? Build them from these templates under Rotation Patterns.
            </p>
          </div>

          {isTimed && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <Label htmlFor="shift-start" required>{form.type === "split" ? "First Block Starts" : "Work Starts At"}</Label>
                <input id="shift-start" type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} className={inputClass(!!errors.start_time)} />
                <FieldError message={errors.start_time} />
              </div>
              <div>
                <Label htmlFor="shift-end" required>{form.type === "split" ? "First Block Ends" : "Work Ends At"}</Label>
                <input id="shift-end" type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} className={inputClass(!!errors.end_time)} />
                <FieldError message={errors.end_time} />
              </div>
              {crossesMidnight && (
                <div className="sm:col-span-2">
                  <InlineAlert tone="sky">This shift ends the next day ({fmt12(form.start_time)} → {fmt12(form.end_time)}). It will be saved as an overnight shift.</InlineAlert>
                </div>
              )}
              {form.type === "night" && !crossesMidnight && form.start_time !== form.end_time && (
                <div className="sm:col-span-2">
                  <InlineAlert tone="amber">Night shifts are treated as overnight. If this shift finishes on the same day, choose Fixed instead.</InlineAlert>
                </div>
              )}
            </div>
          )}

          {form.type === "split" && (
            <div className="bg-slate-50 rounded-xl p-5">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Second Work Block</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <Label htmlFor="split-start" required>Starts At</Label>
                  <input id="split-start" type="time" value={form.split_start_time_2} onChange={(e) => set("split_start_time_2", e.target.value)} className={inputClass(!!errors.split_start_time_2)} />
                  <FieldError message={errors.split_start_time_2} />
                </div>
                <div>
                  <Label htmlFor="split-end" required>Ends At</Label>
                  <input id="split-end" type="time" value={form.split_end_time_2} onChange={(e) => set("split_end_time_2", e.target.value)} className={inputClass(!!errors.split_end_time_2)} />
                  <FieldError message={errors.split_end_time_2} />
                </div>
              </div>
            </div>
          )}

          {form.type === "flexible" && (
            <div className="bg-slate-50 rounded-xl p-5 space-y-5">
              <div>
                <Label htmlFor="flex-hours" required>Minimum Hours Per Day</Label>
                <input id="flex-hours" type="number" step={0.25} min={0.25} max={24} value={form.min_hours} onChange={(e) => set("min_hours", e.target.value)} className={inputClass(!!errors.min_hours)} />
                <FieldError message={errors.min_hours} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <Label htmlFor="core-start">Core Hours Start (optional)</Label>
                  <input id="core-start" type="time" value={form.core_start_time} onChange={(e) => set("core_start_time", e.target.value)} className={inputClass(!!errors.core_start_time)} />
                  <FieldError message={errors.core_start_time} />
                </div>
                <div>
                  <Label htmlFor="core-end">Core Hours End (optional)</Label>
                  <input id="core-end" type="time" value={form.core_end_time} onChange={(e) => set("core_end_time", e.target.value)} className={inputClass(!!errors.core_end_time)} />
                  <FieldError message={errors.core_end_time} />
                </div>
              </div>
              <p className="text-xs text-slate-400">When set, employees are expected at work between the core start and end times.</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Label htmlFor="buffer-before">Allow Early Entry By (mins)</Label>
              <input id="buffer-before" type="number" min={0} max={240} value={form.buffer_minutes_before} onChange={(e) => set("buffer_minutes_before", e.target.value)} className={inputClass(!!errors.buffer_minutes_before)} />
              {errors.buffer_minutes_before ? <FieldError message={errors.buffer_minutes_before} /> : <p className="text-xs text-slate-400 mt-1.5">How early before the start an employee can clock in</p>}
            </div>
            <div>
              <Label htmlFor="buffer-after">Allow Late Entry By (mins)</Label>
              <input id="buffer-after" type="number" min={0} max={240} value={form.buffer_minutes_after} onChange={(e) => set("buffer_minutes_after", e.target.value)} className={inputClass(!!errors.buffer_minutes_after)} />
              {errors.buffer_minutes_after ? <FieldError message={errors.buffer_minutes_after} /> : <p className="text-xs text-slate-400 mt-1.5">Lateness beyond the policy grace period is still recorded</p>}
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 pt-2">
            <button type="button" onClick={onClose} disabled={loading} className="px-8 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition">
              {loading && <Spinner />}
              {loading ? "Saving…" : isEdit ? "Update Shift" : "Save Shift"}
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
    start_reference_date: todayYMD(),
    entries: [{ shift_id: "", duration_days: 5 }],
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const shiftName = (id) => shifts.find((s) => s.id === id)?.name;
  const cycleDays = form.entries.reduce((sum, e) => sum + (Number.isInteger(Number(e.duration_days)) && Number(e.duration_days) > 0 ? Number(e.duration_days) : 0), 0);

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function addEntry() {
    setForm((f) => ({ ...f, entries: [...f.entries, { shift_id: "", duration_days: 5 }] }));
  }
  function removeEntry(i) {
    setForm((f) => ({ ...f, entries: f.entries.filter((_, idx) => idx !== i) }));
  }
  function moveEntry(i, dir) {
    setForm((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.entries.length) return f;
      const entries = [...f.entries];
      [entries[i], entries[j]] = [entries[j], entries[i]];
      return { ...f, entries };
    });
  }
  function setEntry(i, k, v) {
    setForm((f) => ({ ...f, entries: f.entries.map((e, idx) => (idx === i ? { ...e, [k]: v } : e)) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    const { errors: v, payload } = validateRotation(form);
    setErrors(v);
    if (hasErrors(v)) {
      setError(v.entries || "Please fix the highlighted fields.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await attendanceAPI.createRotation(payload);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "rotation" });
      onSaved("Rotation pattern created.");
    } catch (err) {
      setError(attendanceErrorMessage(err, "Couldn't create the rotation."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Create Rotation Pattern</h2>
            <p className="text-xs text-slate-400 mt-0.5">Define a repeating cycle of shift phases.</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5" noValidate>
          {error && <InlineAlert tone="rose">{error}</InlineAlert>}
          {shifts.length === 0 && <InlineAlert tone="amber">Create at least one active shift template before building a rotation.</InlineAlert>}
          {/* Contract §2 C5: rotation entries require a shift — off-day phases are not supported. */}
          <InlineAlert tone="sky">
            Every phase is a working shift. For rest days, add a Weekly Off rule and target it at these shifts (Weekly Offs → Applicable Shifts).
          </InlineAlert>

          <div>
            <Label htmlFor="rot-name" required>Rotation Name</Label>
            <input id="rot-name" type="text" maxLength={150} value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. Production Cycle A" className={inputClass(!!errors.name)} />
            <FieldError message={errors.name} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rot-start" required>Cycle Starts From</Label>
              <input id="rot-start" type="date" value={form.start_reference_date} onChange={(e) => setField("start_reference_date", e.target.value)} className={inputClass(!!errors.start_reference_date)} />
              {errors.start_reference_date ? <FieldError message={errors.start_reference_date} /> : <p className="text-xs text-slate-400 mt-1.5">Day 1 of the first cycle</p>}
            </div>
            <div>
              <Label>Repeats Every</Label>
              <div className="px-4 py-3 text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl">{cycleDays} day{cycleDays === 1 ? "" : "s"}</div>
              <p className="text-xs text-slate-400 mt-1.5">Calculated from the phase durations below</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Phases (in order)</span>
              <button type="button" onClick={addEntry} className="flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:text-purple-700 transition">
                <HiPlus className="w-3.5 h-3.5" /> Add phase
              </button>
            </div>
            <div className="space-y-3">
              {form.entries.map((en, i) => {
                const entryErr = errors.entryErrors?.[i] || {};
                return (
                  <div key={i} className="rounded-xl p-4 space-y-3 border bg-slate-50 border-transparent">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">Phase {i + 1}</span>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => moveEntry(i, -1)} disabled={i === 0} className="px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move up">↑</button>
                        <button type="button" onClick={() => moveEntry(i, 1)} disabled={i === form.entries.length - 1} className="px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move down">↓</button>
                        {form.entries.length > 1 && (
                          <button type="button" onClick={() => removeEntry(i)} className="text-slate-400 hover:text-red-500 transition ml-1" aria-label="Remove phase">
                            <HiX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Shift</label>
                        <select
                          value={en.shift_id}
                          onChange={(e) => setEntry(i, "shift_id", e.target.value)}
                          className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:border-purple-500 transition bg-white ${entryErr.shift_id ? "border-rose-300" : "border-slate-200"}`}
                        >
                          <option value="">Select shift…</option>
                          {shifts.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} ({shiftType(s)})</option>
                          ))}
                        </select>
                        <FieldError message={entryErr.shift_id} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Days</label>
                        <input type="number" min={1} step={1} value={en.duration_days} onChange={(e) => setEntry(i, "duration_days", e.target.value)} className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:border-purple-500 transition ${entryErr.duration_days ? "border-rose-300" : "border-slate-200"}`} />
                        <FieldError message={entryErr.duration_days} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {cycleDays > 0 && (
              <p className="text-[11px] text-slate-500 mt-3">
                Preview: {form.entries.map((en) => `${Number(en.duration_days) || 0}d ${shiftName(en.shift_id) || "?"}`).join(" → ")} → repeat
                {cycleDays > ROTATION_CYCLE_MAX && <span className="block text-rose-600 font-semibold mt-1">The cycle can't be longer than {ROTATION_CYCLE_MAX} days.</span>}
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={loading} className="px-6 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={loading || shifts.length === 0} className="flex-1 inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition">
              {loading && <Spinner />}
              {loading ? "Saving…" : "Create Rotation"}
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
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editShift, setEditShift] = useState(null);
  const [editShiftLoading, setEditShiftLoading] = useState(null);
  const [showRotationModal, setShowRotationModal] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deletingRotation, setDeletingRotation] = useState(null);
  const { toast, showToast, clearToast } = useToast();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [shiftRes, rotationRes, policyRes] = await Promise.all([
        attendanceAPI.getShifts(),
        attendanceAPI.getRotations(),
        // Policies only enrich the list; a failure must not hide shifts.
        attendanceAPI.getPolicies().catch(() => null),
      ]);
      setShifts(listFrom(shiftRes, ["shifts"]));
      setRotations(listFrom(rotationRes, ["rotations", "patterns"]));
      setPolicies(policyRes ? listFrom(policyRes, ["policies"]) : []);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const policyById = useMemo(() => Object.fromEntries(policies.map((p) => [p.id, p])), [policies]);
  const shiftById = useMemo(() => Object.fromEntries(shifts.map((s) => [s.id, s])), [shifts]);

  async function handleEditShift(shift) {
    setEditShiftLoading(shift.id);
    try {
      const res = await attendanceAPI.getShift(shift.id);
      setEditShift(unwrap(res) || shift);
      setShowShiftModal(true);
    } catch (err) {
      showToast(attendanceErrorMessage(err, "Couldn't load shift details."), "error");
    } finally {
      setEditShiftLoading(null);
    }
  }

  async function handleDeleteShift(shift) {
    if (!(await window.confirm(`Delete "${shift.name}"? Shifts with employees assigned or used in a rotation can't be deleted.`))) return;
    setDeleting(shift.id);
    try {
      await attendanceAPI.deleteShift(shift.id);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "shift" });
      showToast("Shift deleted.");
      load();
    } catch (err) {
      showToast(attendanceErrorMessage(err, "Couldn't delete the shift. It may still be assigned to employees or used in a rotation."), "error");
    } finally {
      setDeleting(null);
    }
  }

  async function handleDeleteRotation(rotation) {
    if (!(await window.confirm(`Delete rotation "${rotation.name}"? Employees assigned to it will no longer follow the cycle.`))) return;
    setDeletingRotation(rotation.id);
    try {
      await attendanceAPI.deleteRotation(rotation.id);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "rotation" });
      showToast("Rotation pattern deleted.");
      load();
    } catch (err) {
      showToast(attendanceErrorMessage(err, "Couldn't delete the rotation."), "error");
    } finally {
      setDeletingRotation(null);
    }
  }

  function timingLabel(s) {
    const type = shiftType(s);
    if (type === "flexible") return `Min ${s.min_hours ?? "—"} hrs / day${s.core_start_time ? ` · core ${fmt12(s.core_start_time)}–${fmt12(s.core_end_time)}` : ""}`;
    if (type === "split" && s.split_start_time_2) return `${fmt12(s.start_time)}–${fmt12(s.end_time)}, ${fmt12(s.split_start_time_2)}–${fmt12(s.split_end_time_2)}`;
    if (s.start_time && s.end_time) return `${fmt12(s.start_time)} – ${fmt12(s.end_time)}${s.is_overnight ? " (+1 day)" : ""}`;
    return "—";
  }

  function policyLabel(s) {
    const id = s.policy_id || s.policy?.id;
    if (!id) return <span className="text-slate-400">Org default</span>;
    const p = policyById[id] || s.policy;
    if (!p) return <span className="text-slate-400">Linked policy</span>;
    return (
      <span className={p.is_active === false ? "text-amber-600" : ""}>
        {p.name}
        {p.is_active === false && " (inactive)"}
      </span>
    );
  }

  function phaseSummary(r) {
    const entries = [...(r.entries || r.rotation_entries || [])].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
    if (entries.length === 0) return "—";
    return entries
      .map((e) => `${e.duration_days}d ${e.shift?.name || shiftById[e.shift_id]?.name || "Shift"}`)
      .join(" → ");
  }

  function closeShiftModal() {
    setShowShiftModal(false);
    setEditShift(null);
  }

  return (
    <>
      <DashboardTopBar title="Attendance" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-8">
        {loadError && !loading && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <ErrorState error={loadError} onRetry={() => { setLoading(true); load(); }} fallback="Couldn't load shifts." />
          </div>
        )}

        <div>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Shift Templates</h1>
              <p className="text-sm text-slate-500 mt-1">Define working hours, and link each shift to an attendance policy.</p>
            </div>
            <button onClick={() => { setEditShift(null); setShowShiftModal(true); }} className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition">
              <HiPlus className="w-4 h-4" />
              Add Shift
            </button>
          </div>

          {loading ? (
            <Skeleton type="table" rows={4} />
          ) : !loadError && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {shifts.length === 0 ? (
                <div className="p-16 flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <HiClock className="w-7 h-7 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">No shifts created yet</p>
                  <p className="text-xs text-slate-400">Add your first shift template to start assigning employees.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Shift Name</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Working Hours</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Policy</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {shifts.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-semibold text-slate-800">{s.name}</td>
                          <td className="px-6 py-4">
                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full capitalize ${TYPE_COLORS[shiftType(s)] || "bg-slate-100 text-slate-600"}`}>{shiftType(s)}</span>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600">{timingLabel(s)}</td>
                          <td className="px-6 py-4 text-xs text-slate-600">{policyLabel(s)}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${s.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                              {s.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleEditShift(s)} disabled={editShiftLoading === s.id} className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition disabled:opacity-50" title="Edit shift" aria-label={`Edit ${s.name}`}>
                                {editShiftLoading === s.id ? <Spinner className="w-4 h-4 text-purple-600" /> : <HiPencil className="w-4 h-4" />}
                              </button>
                              <button onClick={() => handleDeleteShift(s)} disabled={deleting === s.id} className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-50" title="Delete shift" aria-label={`Delete ${s.name}`}>
                                {deleting === s.id ? <Spinner className="w-4 h-4" /> : <HiTrash className="w-4 h-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Rotation Patterns</h2>
              <p className="text-sm text-slate-500 mt-1">Employees on rotating schedules cycle through shift and off-day phases automatically.</p>
            </div>
            <button onClick={() => setShowRotationModal(true)} className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition">
              <HiPlus className="w-4 h-4" />
              Add Rotation
            </button>
          </div>

          {loading ? (
            <Skeleton type="table" rows={3} />
          ) : !loadError && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {rotations.length === 0 ? (
                <div className="p-12 flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <HiRefresh className="w-7 h-7 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">No rotation patterns yet</p>
                  <p className="text-xs text-slate-400">Create a rotation for factories, hospitals, or support teams.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rotation Name</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cycle</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sequence</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Starts</th>
                        <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rotations.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-semibold text-slate-800">{r.name}</td>
                          <td className="px-6 py-4 text-xs text-slate-600">{r.rotation_cycle_days} days</td>
                          <td className="px-6 py-4 text-xs text-slate-600 max-w-sm">{phaseSummary(r)}</td>
                          <td className="px-6 py-4 text-xs text-slate-600">{fmtDate(ymdOnly(r.start_reference_date))}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${r.is_active ? "bg-purple-50 text-purple-700" : "bg-slate-100 text-slate-500"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${r.is_active ? "bg-purple-500" : "bg-slate-400"}`} />
                              {r.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => handleDeleteRotation(r)} disabled={deletingRotation === r.id} className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-50" title="Delete rotation" aria-label={`Delete ${r.name}`}>
                              {deletingRotation === r.id ? <Spinner className="w-4 h-4" /> : <HiTrash className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {showShiftModal && (
        <ShiftModal editShift={editShift} policies={policies} onClose={closeShiftModal} onSaved={(msg) => { closeShiftModal(); showToast(msg); load(); }} />
      )}

      {showRotationModal && (
        <RotationModal
          shifts={shifts.filter((s) => s.is_active && shiftType(s) !== "rotational")}
          onClose={() => setShowRotationModal(false)}
          onSaved={(msg) => { setShowRotationModal(false); showToast(msg); load(); }}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
