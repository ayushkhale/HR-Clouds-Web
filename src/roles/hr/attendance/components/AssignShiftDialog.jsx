// ─────────────────────────────────────────────────────────────────────────────
// AssignShiftDialog — give one employee a shift or a rotation from a date
// (POST /attendance/hr/shifts/assign). One form, two doors:
//   · Shift Management (the roster) — nothing chosen yet.
//   · Work Shifts — opened from a shift's row with `initialShiftId`, so HR
//     setting up a shift can hand it to people without leaving the screen.
// The only difference is that preset; a second copy of the form would drift
// (CLAUDE.md §2). It is a form, not a record inspector (§3): wide, gridded,
// pinned footer, laid out like Create Attendance Policy.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { attendanceAPI } from "../../../../shared/api";
import { attendanceErrorMessage } from "../../../../shared/utils/attendanceErrors";
import EmployeePicker from "../../../../shared/attendance/EmployeePicker";
import { validateAssignment, hasErrors } from "../../../../shared/attendance/validation";
import { listFrom } from "../../../../shared/attendance/normalize";
import { todayYMD } from "../../../../shared/attendance/dates";
import { emitAttendanceChanged, ATTENDANCE_EVENTS } from "../../../../shared/attendance/events";
import { FieldError, InlineAlert, Spinner } from "../../../../shared/attendance/ui";
import { HiX } from "react-icons/hi";
import { shiftHours } from "../shiftMeta";

const FormSection = ({ title, children }) => (
  <div>
    <p className="text-xs font-bold text-slate-700 mb-3">{title}</p>
    {children}
  </div>
);

/* ─── Assign Modal ───────────────────────────────────────────────────────── */
export default function AssignShiftDialog({ onClose, onSaved, initialShiftId = "" }) {
  const [shifts, setShifts] = useState([]);
  const [rotations, setRotations] = useState([]);
  const [dropLoading, setDropLoading] = useState(true);
  const [dropError, setDropError] = useState(null);
  const [form, setForm] = useState({ assignType: "shift", user_id: "", shift_id: initialShiftId, rotation_pattern_id: "", effective_from: todayYMD(), effective_to: "" });
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

  // Same field look and layout as the Create Attendance Policy modal.
  const fieldClass = (invalid) => `w-full px-4 py-3 text-sm border rounded-xl bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition ${invalid ? "border-rose-300" : "border-slate-200"}`;
  const labelClass = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2";
  const selectedShift = shifts.find((s) => String(s.id) === String(form.shift_id));
  const selectedRotation = rotations.find((r) => String(r.id) === String(form.rotation_pattern_id));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="assign-shift-title">
        <div className="flex items-center justify-between px-6 sm:px-10 py-6 border-b border-slate-100 shrink-0">
          <div>
            <h2 id="assign-shift-title" className="text-lg font-bold text-slate-800">Assign Shift</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {initialShiftId && selectedShift
                ? `Pick who should work ${selectedShift.name}, and from when.`
                : "Pick an employee and the shift or rotation they should follow."}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col" noValidate>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-10 py-8 space-y-7">
            {error && <InlineAlert tone="rose">{error}</InlineAlert>}

            <FormSection title="Employee">
              <label className={labelClass}>Employee <span className="text-rose-400">*</span></label>
              <EmployeePicker value={form.user_id} onChange={(id) => set("user_id", id)} invalid={!!errors.user_id} disabled={loading} />
              <FieldError message={errors.user_id} />
            </FormSection>

            <FormSection title="Schedule">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div>
                  <span className={labelClass}>What kind of schedule?</span>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: "shift", label: "Single Shift", desc: "Same shift every working day" },
                      { value: "rotation", label: "Rotation", desc: "Cycles through shift phases" },
                    ].map((t) => (
                      <button key={t.value} type="button" onClick={() => set("assignType", t.value)} aria-pressed={form.assignType === t.value} className={`flex flex-col items-start px-4 py-3.5 rounded-xl border-2 text-left transition ${form.assignType === t.value ? "border-purple-500 bg-purple-50" : "border-slate-200 hover:border-slate-300"}`}>
                        <span className={`text-sm font-bold ${form.assignType === t.value ? "text-purple-700" : "text-slate-700"}`}>{t.label}</span>
                        <span className="text-[11px] text-slate-400 mt-0.5">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {dropLoading ? (
                  <p className="text-xs text-slate-400 flex items-center gap-2 lg:mt-8"><Spinner className="w-3.5 h-3.5 text-purple-600" /> Loading shifts…</p>
                ) : dropError ? (
                  <InlineAlert tone="rose">{attendanceErrorMessage(dropError, "Couldn't load shifts and rotations.")}</InlineAlert>
                ) : form.assignType === "shift" ? (
                  <div>
                    <label htmlFor="assign-shift" className={labelClass}>Shift <span className="text-rose-400">*</span></label>
                    <select id="assign-shift" value={form.shift_id} onChange={(e) => set("shift_id", e.target.value)} className={fieldClass(!!errors.shift_id)}>
                      <option value="">Select a shift…</option>
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {shiftHours(s) || "No set hours"} · {s.type || s.shift_type}
                        </option>
                      ))}
                    </select>
                    {errors.shift_id ? <FieldError message={errors.shift_id} />
                      : shifts.length === 0 ? <p className="text-[10px] text-slate-400 mt-1.5">No active shifts. Create one under Work Shifts.</p>
                        : selectedShift ? <p className="text-[10px] text-slate-400 mt-1.5">{shiftHours(selectedShift) || "No set hours"} · {String(selectedShift.type || selectedShift.shift_type || "").replace(/_/g, " ")}{selectedShift.is_overnight ? " · ends next day" : ""}</p>
                          : null}
                  </div>
                ) : (
                  <div>
                    <label htmlFor="assign-rotation" className={labelClass}>Rotation Pattern <span className="text-rose-400">*</span></label>
                    <select id="assign-rotation" value={form.rotation_pattern_id} onChange={(e) => set("rotation_pattern_id", e.target.value)} className={fieldClass(!!errors.rotation_pattern_id)}>
                      <option value="">Select a rotation…</option>
                      {rotations.map((r) => (
                        <option key={r.id} value={r.id}>{r.name} · {r.rotation_cycle_days}-day cycle</option>
                      ))}
                    </select>
                    {errors.rotation_pattern_id ? <FieldError message={errors.rotation_pattern_id} />
                      : rotations.length === 0 ? <p className="text-[10px] text-slate-400 mt-1.5">No active rotation patterns. Create one under Work Shifts.</p>
                        : selectedRotation ? <p className="text-[10px] text-slate-400 mt-1.5">Repeats every {selectedRotation.rotation_cycle_days ?? 0} days</p>
                          : null}
                  </div>
                )}
              </div>
            </FormSection>

            <FormSection title="Dates">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="assign-from" className={labelClass}>Effective From <span className="text-rose-400">*</span></label>
                  <input id="assign-from" type="date" value={form.effective_from} onChange={(e) => set("effective_from", e.target.value)} className={fieldClass(!!errors.effective_from)} />
                  {errors.effective_from ? <FieldError message={errors.effective_from} /> : <p className="text-[10px] text-slate-400 mt-1.5">Attendance from this date is calculated against the selected schedule. Dates already locked for payroll aren&apos;t recalculated.</p>}
                </div>
                <div>
                  <label htmlFor="assign-to" className={labelClass}>Effective Until <span className="normal-case tracking-normal font-semibold text-slate-400">(optional)</span></label>
                  <input id="assign-to" type="date" min={form.effective_from || undefined} value={form.effective_to} onChange={(e) => set("effective_to", e.target.value)} className={fieldClass(!!errors.effective_to)} />
                  {errors.effective_to ? <FieldError message={errors.effective_to} /> : <p className="text-[10px] text-slate-400 mt-1.5">Leave empty for an open-ended assignment. To change a schedule later, end this assignment and create a new one.</p>}
                </div>
              </div>
            </FormSection>
          </div>

          <div className="shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 px-6 sm:px-10 py-5 border-t border-slate-100">
            <button type="button" onClick={onClose} disabled={loading} className="px-8 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={loading || dropLoading} className="flex-1 inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition">
              {loading && <Spinner />}
              {loading ? "Saving…" : "Assign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
