import React, { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { attendanceAPI } from "../../../../shared/api";
import { attendanceErrorMessage, attendanceErrorCode } from "../../../../shared/utils/attendanceErrors";
import { validateShift, validateRotation, hasErrors, ROTATION_CYCLE_MAX, TIMED_SHIFT_TYPES } from "../../../../shared/attendance/validation";
import { listFrom, unwrap } from "../../../../shared/attendance/normalize";
import { todayYMD, ymdOnly, fmtDate } from "../../../../shared/attendance/dates";
import { emitAttendanceChanged, ATTENDANCE_EVENTS } from "../../../../shared/attendance/events";
import { ErrorState, FieldError, InlineAlert, Spinner, Toast, useToast } from "../../../../shared/attendance/ui";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import {
  HiBan,
  HiClipboardList,
  HiClock,
  HiPlus,
  HiX,
  HiTrash,
  HiPencil,
  HiRefresh,
  HiInformationCircle,
} from "react-icons/hi";
import TimeField from "../../../../shared/components/TimeField";

// `type` is only a label: every type is calculated the same way, from start_time,
// end_time and the policy (update_shift_templates_2026_09_14.md §3.3). New
// shifts are Fixed, Flexible or Night. `split` has no second block any more and
// is worked out exactly like Fixed; `rotational` takes each day's hours from the
// rotation pattern. Both are offered only to keep an existing shift's type.
const SHIFT_TYPE_OPTIONS = [
  { value: "fixed", label: "Fixed", desc: "Set start and end time" },
  { value: "flexible", label: "Flexible", desc: "No set start or end time" },
  { value: "night", label: "Night", desc: "Starts one day, ends the next" },
];
const KEEP_ONLY_TYPE_OPTIONS = {
  split: { value: "split", label: "Split", desc: "Worked out like Fixed" },
  rotational: { value: "rotational", label: "Rotational", desc: "Hours come from the rotation" },
};
const TYPE_DESC = Object.fromEntries([...SHIFT_TYPE_OPTIONS, ...Object.values(KEEP_ONLY_TYPE_OPTIONS)].map((t) => [t.value, t.desc]));

const hoursText = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? `${Number(v)} hrs` : null);

const TYPE_COLORS = {
  fixed: "bg-indigo-50 text-indigo-700",
  flexible: "bg-violet-50 text-violet-700",
  night: "bg-slate-100 text-slate-600",
  split: "bg-fuchsia-50 text-fuchsia-700",
  rotational: "bg-purple-50 text-purple-700",
};

const shiftType = (s) => s?.type || s?.shift_type || "fixed";

function fmt12(t) {
  const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "N/A";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

const inputClass = (invalid) =>
  `w-full px-4 py-3 text-sm border rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition ${invalid ? "border-rose-300" : "border-slate-200"}`;

const Label = ({ htmlFor, children, required }) => (
  <label htmlFor={htmlFor} className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
    {children} {required && <span className="text-rose-400">*</span>}
  </label>
);

/* ─── Shift Modal (Create / Edit) ────────────────────────────────────────── */
function ShiftModal({ editShift, policies, onClose, onSaved }) {
  const isEdit = !!editShift;
  const savedType = shiftType(editShift);
  const activePolicies = policies.filter((p) => p.is_active !== false || p.id === editShift?.policy_id);
  const defaultPolicy = activePolicies.find((p) => p.is_default);
  const hhmm = (v, d) => (v ? String(v).slice(0, 5) : d);
  const typeOptions = isEdit && KEEP_ONLY_TYPE_OPTIONS[savedType] ? [...SHIFT_TYPE_OPTIONS, KEEP_ONLY_TYPE_OPTIONS[savedType]] : SHIFT_TYPE_OPTIONS;
  const hadTimes = !!(editShift?.start_time || editShift?.end_time);

  const [form, setForm] = useState({
    name: editShift?.name || "",
    // An edit keeps the saved type; a rotational shift is never silently turned into Fixed.
    type: isEdit ? savedType : "fixed",
    policy_id: isEdit ? editShift?.policy_id || editShift?.policy?.id || "" : defaultPolicy?.id || "",
    // The API returns "HH:mm:ss" and takes "HH:mm".
    start_time: hhmm(editShift?.start_time, "09:00"),
    end_time: hhmm(editShift?.end_time, "18:00"),
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  }

  const isTimed = TIMED_SHIFT_TYPES.includes(form.type);
  const crossesMidnight = isTimed && form.end_time && form.start_time && form.end_time < form.start_time;
  // Thresholds live on the policy; with none linked, the organisation default applies.
  const policyInUse = form.policy_id ? activePolicies.find((p) => p.id === form.policy_id) : defaultPolicy;
  const thresholds = policyInUse
    ? [
      hoursText(policyInUse.full_day_min_hours) && `full day ${hoursText(policyInUse.full_day_min_hours)}`,
      hoursText(policyInUse.half_day_min_hours) && `half day ${hoursText(policyInUse.half_day_min_hours)}`,
      policyInUse.grace_minutes != null && `${policyInUse.grace_minutes} mins grace`,
    ].filter(Boolean).join(" · ")
    : "";

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    const hadPolicy = !!(editShift?.policy_id || editShift?.policy?.id);
    const { errors: v, payload } = validateShift(form, { isEdit, hadPolicy, hadTimes });
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
      // PUT refuses an inactive shift; the list this was opened from was stale.
      setError(isEdit && attendanceErrorCode(err) === "SHIFT_DEACTIVATED"
        ? "This shift has been deactivated, so it can't be edited. Close this window and refresh the list."
        : attendanceErrorMessage(err, "Couldn't save the shift."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 sm:p-6">
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
              <p className="text-[10px] text-slate-400 mt-1.5">
                {thresholds && <span className="font-semibold text-slate-500">{form.policy_id ? "This policy" : "Organisation default"}: {thresholds}. </span>}
                Lateness, full and half-day hours, breaks and overtime all come from the policy.
              </p>
            </div>
          </div>

          <div>
            <Label>Shift Type</Label>
            <div className={`grid gap-3 ${typeOptions.length > 3 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}`}>
              {typeOptions.map((t) => (
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
                <Label required>Work Starts At</Label>
                <TimeField label="Work starts at" value={form.start_time} onChange={(v) => set("start_time", v)} invalid={!!errors.start_time} clearable={false} />
                <FieldError message={errors.start_time} />
              </div>
              <div>
                <Label required>Work Ends At</Label>
                <TimeField label="Work ends at" value={form.end_time} onChange={(v) => set("end_time", v)} invalid={!!errors.end_time} clearable={false} />
                <FieldError message={errors.end_time} />
              </div>
              {crossesMidnight && (
                <div className="sm:col-span-2">
                  <InlineAlert tone="sky">This shift ends the next day ({fmt12(form.start_time)} → {fmt12(form.end_time)}). It will be saved as an overnight shift.</InlineAlert>
                </div>
              )}
              {form.type === "night" && !crossesMidnight && form.start_time !== form.end_time && (
                <div className="sm:col-span-2">
                  <InlineAlert tone="amber">This night shift ends on the same day it starts, so it won’t be treated as overnight. Check the times, or choose Fixed.</InlineAlert>
                </div>
              )}
            </div>
          )}

          {form.type === "split" && (
            <InlineAlert tone="amber">
              Split shifts are worked out exactly like Fixed: only the start and end times above count, and a second work block isn’t supported. Consider switching this shift to Fixed.
            </InlineAlert>
          )}

          {form.type === "flexible" && (
            <InlineAlert tone="sky">
              Flexible shifts have no set start or end, so nobody on them is marked late. The hours needed for a full or half day come from the attendance policy.
              {isEdit && hadTimes && " Saving removes the start and end times this shift had."}
            </InlineAlert>
          )}

          {form.type === "rotational" && (
            <InlineAlert tone="sky">Each day’s hours come from the rotation pattern the employee is assigned to, not from this template.</InlineAlert>
          )}

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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
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
                          <button type="button" onClick={() => removeEntry(i)} className="text-slate-400 hover:text-rose-500 transition ml-1" aria-label="Remove phase">
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
  const [deactivating, setDeactivating] = useState(null);
  const [deletingRotation, setDeletingRotation] = useState(null);
  const { toast, showToast, clearToast } = useToast();
  const [preview, setPreview] = useState(null);
  // Deactivated shifts stay in GET /shifts for good, so they're hidden by default.
  const [showInactive, setShowInactive] = useState(false);

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
  const inactiveCount = useMemo(() => shifts.filter((s) => !s.is_active).length, [shifts]);
  const visibleShifts = useMemo(() => (showInactive ? shifts : shifts.filter((s) => s.is_active)), [shifts, showInactive]);

  async function handleEditShift(shift) {
    setEditShiftLoading(shift.id);
    try {
      const res = await attendanceAPI.getShift(shift.id);
      const fresh = unwrap(res) || shift;
      // Deactivated since the list loaded: PUT would be refused (SHIFT_DEACTIVATED).
      if (fresh.is_active === false) {
        showToast("This shift has been deactivated, so it can't be edited.", "error");
        load();
        return;
      }
      setEditShift(fresh);
      setShowShiftModal(true);
    } catch (err) {
      showToast(attendanceErrorMessage(err, "Couldn't load shift details."), "error");
    } finally {
      setEditShiftLoading(null);
    }
  }

  // DELETE /shifts/:id deactivates, and nothing can switch a shift back on.
  async function handleDeactivateShift(shift) {
    if (!(await window.confirm(`Deactivate "${shift.name}"? It stays in the list as inactive and can no longer be assigned or edited. This can't be undone. Anyone still assigned to it must have their assignment ended first.`))) return;
    setDeactivating(shift.id);
    try {
      await attendanceAPI.deleteShift(shift.id);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "shift" });
      showToast("Shift deactivated.");
      setPreview(null);
      load();
    } catch (err) {
      showToast(attendanceErrorMessage(err, "Couldn't deactivate the shift."), "error");
    } finally {
      setDeactivating(null);
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
    const times = s.start_time && s.end_time ? `${fmt12(s.start_time)} – ${fmt12(s.end_time)}${s.is_overnight ? " (+1 day)" : ""}` : "";
    // A flexible shift saved before the change can still carry times, and the engine still uses them.
    if (type === "flexible") return times ? `${times} (still set)` : "No set hours";
    if (type === "rotational") return times || "From the rotation pattern";
    return times || "Not set";
  }

  /** Something about a shift that silently changes how attendance is worked out, or "". */
  function shiftWarning(s) {
    const type = shiftType(s);
    const timed = TIMED_SHIFT_TYPES.includes(type);
    if (timed && !(s.start_time && s.end_time)) return "This shift has no start or end time, so lateness isn't worked out for anyone on it. Edit it and add both times.";
    if (type === "flexible" && (s.start_time || s.end_time)) return "This flexible shift still has start and end times, so lateness is still worked out against them. Edit and save it to remove them.";
    if (type === "split") return "Split shifts are worked out exactly like Fixed: only the start and end times count. A second work block isn't supported.";
    return "";
  }

  function policyLabel(s) {
    const id = s.policy_id || s.policy?.id;
    if (!id) return <span className="text-slate-400">Org default</span>;
    const p = policyById[id] || s.policy;
    if (!p) return <span className="text-slate-400">Linked policy</span>;
    return (
      <span className={p.is_active === false ? "text-fuchsia-600" : ""}>
        {p.name}
        {p.is_active === false && " (inactive)"}
      </span>
    );
  }

  function phaseSummary(r) {
    const entries = [...(r.entries || r.rotation_entries || [])].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
    if (entries.length === 0) return "N/A";
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
      <DashboardTopBar title="Work Shifts" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-8">
        {loadError && !loading && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <ErrorState error={loadError} onRetry={() => { setLoading(true); load(); }} fallback="Couldn't load shifts." />
          </div>
        )}

        <div>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Work Shifts</h1>
              <p className="text-sm text-slate-500 mt-1">Define working hours, and link each shift to an attendance policy.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {inactiveCount > 0 && (
                <label htmlFor="show-inactive-shifts" className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                  <input id="show-inactive-shifts" type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                  Show deactivated ({inactiveCount})
                </label>
              )}
              <button onClick={() => { setEditShift(null); setShowShiftModal(true); }} className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition">
                <HiPlus className="w-4 h-4" />
                Add Shift
              </button>
            </div>
          </div>

          {loading ? (
            <Skeleton type="table" rows={4} />
          ) : !loadError && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {visibleShifts.length === 0 ? (
                <div className="p-16 flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <HiClock className="w-7 h-7 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">{shifts.length === 0 ? "No shifts created yet" : "No active shifts"}</p>
                  <p className="text-xs text-slate-400">
                    {shifts.length === 0 ? "Add your first shift template to start assigning employees." : "Every shift has been deactivated. Add a shift to start assigning employees."}
                  </p>
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
                      {visibleShifts.map((s) => (
                        <tr key={s.id} {...rowPreviewProps(() => setPreview(s), `View ${s.name}`)}>
                          <td className="px-6 py-4 text-sm font-semibold text-slate-800">{s.name}</td>
                          <td className="px-6 py-4">
                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full capitalize ${TYPE_COLORS[shiftType(s)] || "bg-slate-100 text-slate-600"}`}>{shiftType(s)}</span>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600">
                            {timingLabel(s)}
                            {shiftWarning(s) && s.is_active && <span className="block text-[10px] font-semibold text-fuchsia-600">Check this shift</span>}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600">{policyLabel(s)}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${s.is_active ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? "bg-violet-500" : "bg-slate-400"}`} />
                              {s.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {/* A deactivated shift can't be edited or switched back on (PUT → SHIFT_DEACTIVATED). */}
                            {s.is_active ? (
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => handleEditShift(s)} disabled={editShiftLoading === s.id} className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition disabled:opacity-50" title="Edit shift" aria-label={`Edit ${s.name}`}>
                                  {editShiftLoading === s.id ? <Spinner className="w-4 h-4 text-purple-600" /> : <HiPencil className="w-4 h-4" />}
                                </button>
                                <button onClick={() => handleDeactivateShift(s)} disabled={deactivating === s.id} className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition disabled:opacity-50" title="Deactivate shift" aria-label={`Deactivate ${s.name}`}>
                                  {deactivating === s.id ? <Spinner className="w-4 h-4" /> : <HiBan className="w-4 h-4" />}
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400">Can’t be edited</span>
                            )}
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
                            <button onClick={() => handleDeleteRotation(r)} disabled={deletingRotation === r.id} className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition disabled:opacity-50" title="Delete rotation" aria-label={`Delete ${r.name}`}>
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

      {preview && (() => {
        const p = preview;
        const type = shiftType(p);
        const pid = p.policy_id || p.policy?.id;
        const pol = pid ? policyById[pid] || p.policy : null;
        const warning = shiftWarning(p);
        return (
          <DetailDialog
            eyebrow="Shift template"
            icon={HiClock}
            title={p.name}
            subtitle={TYPE_DESC[type]}
            badge={<DetailPill tone="onDark">{p.is_active ? "Active" : "Inactive"}</DetailPill>}
            onClose={() => setPreview(null)}
            footer={p.is_active ? (
              <>
                <button onClick={() => handleDeactivateShift(p)} disabled={deactivating === p.id} className="sm:mr-auto px-4 py-2.5 text-sm font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50">
                  {deactivating === p.id ? <Spinner className="w-4 h-4" /> : <HiBan className="w-4 h-4" />} Deactivate
                </button>
                <button onClick={() => { const s = p; setPreview(null); handleEditShift(s); }} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
                  <HiPencil className="w-4 h-4" /> Edit shift
                </button>
              </>
            ) : (
              <DetailFooterNote>This shift is deactivated. It can’t be edited, assigned or switched back on.</DetailFooterNote>
            )}
          >
            {warning && <InlineAlert tone="amber">{warning}</InlineAlert>}
            <DetailSection title="Working hours" icon={HiClock}>
              <DetailGrid
                items={[
                  ["Shift type", type.charAt(0).toUpperCase() + type.slice(1)],
                  ["Working hours", timingLabel(p)],
                  ["Ends next day", p.is_overnight ? "Yes" : "No"],
                  ["Time zone", p.timezone || null],
                ]}
              />
            </DetailSection>
            <DetailSection title="Attendance policy" icon={HiClipboardList}>
              <DetailGrid
                items={[
                  ["Policy", pol?.name || (pid ? "Linked policy" : "Organisation default")],
                  ["Grace period", pol?.grace_minutes != null ? `${pol.grace_minutes} mins` : null],
                  ["Hours for full day", hoursText(pol?.full_day_min_hours)],
                  ["Hours for half day", hoursText(pol?.half_day_min_hours)],
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
