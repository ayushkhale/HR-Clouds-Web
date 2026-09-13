import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { attendanceAPI } from "../../../../shared/api";
import { DICTIONARY } from "../../../../shared/config/dictionary";
import { attendanceErrorMessage } from "../../../../shared/utils/attendanceErrors";
import { validatePolicy, hasErrors, MISSING_PUNCH_ACTIONS, NAME_MAX } from "../../../../shared/attendance/validation";
import { listFrom, unwrap } from "../../../../shared/attendance/normalize";
import { emitAttendanceChanged, ATTENDANCE_EVENTS } from "../../../../shared/attendance/events";
import { ErrorState, FieldError, InlineAlert, Spinner, Toast, useToast } from "../../../../shared/attendance/ui";
import { HiClipboardList, HiPlus, HiX, HiPencil, HiBadgeCheck, HiInformationCircle } from "react-icons/hi";

const TERM = DICTIONARY.TERMS.COMP_OFF;

/* ─── Toggle ─────────────────────────────────────────────────────────────── */
function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-purple-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

function ToggleRow({ title, description, checked, onChange, children }) {
  return (
    <div className="bg-slate-50 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
        </div>
        <Toggle label={title} checked={checked} onChange={onChange} />
      </div>
      {children}
    </div>
  );
}

const inputClass = (invalid) =>
  `w-full px-4 py-3 text-sm border rounded-xl bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition ${invalid ? "border-rose-300" : "border-slate-200"}`;

function NumberField({ label, hint, name, value, onChange, error, step = 1, min = 0, max, suffix, placeholder }) {
  return (
    <div>
      <label htmlFor={`policy-${name}`} className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">{label}</label>
      <div className="relative">
        <input
          id={`policy-${name}`}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(name, e.target.value)}
          className={inputClass(!!error)}
          aria-invalid={!!error}
        />
        {suffix && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 pointer-events-none">{suffix}</span>}
      </div>
      {error ? <FieldError message={error} /> : hint && <p className="text-[10px] text-slate-400 mt-1.5">{hint}</p>}
    </div>
  );
}

const Section = ({ title, children }) => (
  <div>
    <p className="text-xs font-bold text-slate-700 mb-3">{title}</p>
    {children}
  </div>
);

/* ─── Modal ──────────────────────────────────────────────────────────────── */
// Every field below is a first-class member of the backend policy schema
// (ATTENDANCE_API_CONTRACT.md §5.1) and is sent on both create and update.
function PolicyModal({ editPolicy, onClose, onSaved }) {
  const isEdit = !!editPolicy;
  const str = (v, d = "") => (v === null || v === undefined ? d : String(v));
  const [form, setForm] = useState({
    name: editPolicy?.name || "",
    is_default: editPolicy?.is_default ?? false,
    grace_minutes: str(editPolicy?.grace_minutes, "15"),
    late_threshold_minutes: str(editPolicy?.late_threshold_minutes, "0"),
    early_exit_threshold_minutes: str(editPolicy?.early_exit_threshold_minutes, "0"),
    half_day_min_hours: str(editPolicy?.half_day_min_hours, "4"),
    full_day_min_hours: str(editPolicy?.full_day_min_hours, "8"),
    late_count_half_day_threshold: str(editPolicy?.late_count_half_day_threshold),
    consecutive_late_penalty_days: str(editPolicy?.consecutive_late_penalty_days),
    max_break_duration_minutes: str(editPolicy?.max_break_duration_minutes),
    max_breaks_per_day: str(editPolicy?.max_breaks_per_day),
    missing_punch_action: editPolicy?.missing_punch_action || "flag",
    auto_clock_out_enabled: editPolicy?.auto_clock_out_enabled ?? false,
    auto_clock_out_after_hours: str(editPolicy?.auto_clock_out_after_hours, "12"),
    auto_detect_shift: editPolicy?.auto_detect_shift ?? false,
    overtime_enabled: editPolicy?.overtime_enabled ?? false,
    overtime_min_minutes: str(editPolicy?.overtime_min_minutes, "30"),
    overtime_requires_approval: editPolicy?.overtime_requires_approval ?? true,
    regularization_allowed: editPolicy?.regularization_allowed ?? true,
    regularization_window_days: str(editPolicy?.regularization_window_days, "7"),
    comp_off_on_holiday_work: editPolicy?.comp_off_on_holiday_work ?? false,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    const { errors: v, payload } = validatePolicy(form);
    setErrors(v);
    if (hasErrors(v)) {
      setError("Please fix the highlighted fields.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (isEdit) await attendanceAPI.updatePolicy(editPolicy.id, payload);
      else await attendanceAPI.createPolicy(payload);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "policy" });
      onSaved(isEdit ? "Policy updated. New attendance records will use these rules." : "Policy created successfully.");
    } catch (err) {
      setError(attendanceErrorMessage(err, "Couldn't save the policy."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-6 sm:px-10 py-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{isEdit ? "Edit Policy" : "Create Attendance Policy"}</h2>
            <p className="text-sm text-slate-400 mt-0.5">Define rules for how attendance is calculated.</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 sm:px-10 py-8 space-y-7" noValidate>
          {error && <InlineAlert tone="rose">{error}</InlineAlert>}
          {isEdit && (
            <InlineAlert tone="sky">
              Existing attendance records keep the policy snapshot they were calculated with. Changes apply to new records and recalculations.
            </InlineAlert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
            <div>
              <label htmlFor="policy-name" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Policy Name <span className="text-red-400">*</span>
              </label>
              <input id="policy-name" type="text" maxLength={NAME_MAX} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Standard Office Policy 2026" className={inputClass(!!errors.name)} />
              <FieldError message={errors.name} />
            </div>
            <div className="flex items-center justify-between gap-4 bg-purple-50 border border-purple-100 rounded-xl px-5 py-3 lg:mt-6">
              <div>
                <p className="text-sm font-semibold text-slate-700">Default policy</p>
                <p className="text-[11px] text-slate-400">Used by shifts without a linked policy</p>
              </div>
              <Toggle label="Default policy" checked={form.is_default} onChange={(v) => set("is_default", v)} />
            </div>
          </div>
          {form.is_default && !editPolicy?.is_default && (
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 -mt-3">
              <HiInformationCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>The existing default policy will lose its default status when you save.</span>
            </div>
          )}

          <Section title="Lateness & day thresholds">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
              <NumberField label="Grace Period" suffix="mins" max={120} name="grace_minutes" value={form.grace_minutes} onChange={set} error={errors.grace_minutes} hint="0–120. Clock-ins within this window aren't marked late" />
              <NumberField label="Late Threshold" suffix="mins" max={480} name="late_threshold_minutes" value={form.late_threshold_minutes} onChange={set} error={errors.late_threshold_minutes} hint="0–480. Lateness limit applied by the attendance engine" />
              <NumberField label="Early Exit Threshold" suffix="mins" max={480} name="early_exit_threshold_minutes" value={form.early_exit_threshold_minutes} onChange={set} error={errors.early_exit_threshold_minutes} hint="0–480. Leaving earlier than this is recorded as an early exit" />
              <NumberField label="Hours for Half Day" suffix="hrs" step={0.25} min={1} max={24} name="half_day_min_hours" value={form.half_day_min_hours} onChange={set} error={errors.half_day_min_hours} hint="1–24 effective hours" />
              <NumberField label="Hours for Full Day" suffix="hrs" step={0.25} min={1} max={24} name="full_day_min_hours" value={form.full_day_min_hours} onChange={set} error={errors.full_day_min_hours} hint="1–24 effective hours" />
            </div>
          </Section>

          <Section title="Late arrival penalties">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <NumberField label="Late Arrivals per Half Day" min={1} name="late_count_half_day_threshold" value={form.late_count_half_day_threshold} onChange={set} error={errors.late_count_half_day_threshold} placeholder="Off" hint="Number of late arrivals that count as a half day. Leave empty to turn off." />
              <NumberField label="Consecutive Late Days" suffix="days" min={1} name="consecutive_late_penalty_days" value={form.consecutive_late_penalty_days} onChange={set} error={errors.consecutive_late_penalty_days} placeholder="Off" hint="Consecutive late days that trigger a penalty. Leave empty to turn off." />
            </div>
          </Section>

          <Section title="Breaks">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <NumberField label="Max Break Duration" suffix="mins" name="max_break_duration_minutes" value={form.max_break_duration_minutes} onChange={set} error={errors.max_break_duration_minutes} placeholder="No limit" hint="A break longer than this raises an “excessive break” flag. Leave empty for no limit." />
              <NumberField label="Max Breaks per Day" name="max_breaks_per_day" value={form.max_breaks_per_day} onChange={set} error={errors.max_breaks_per_day} placeholder="No limit" hint="Starting more breaks than this is refused. Leave empty for no limit." />
            </div>
          </Section>

          <Section title="Missing punches">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-slate-50 rounded-xl p-5">
                <label htmlFor="policy-missing" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">When a punch is missing</label>
                <select id="policy-missing" value={form.missing_punch_action} onChange={(e) => set("missing_punch_action", e.target.value)} className={inputClass(!!errors.missing_punch_action)}>
                  {MISSING_PUNCH_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                <FieldError message={errors.missing_punch_action} />
              </div>
              <ToggleRow title="Auto clock-out" description="Close days that are never clocked out" checked={form.auto_clock_out_enabled} onChange={(v) => set("auto_clock_out_enabled", v)}>
                {form.auto_clock_out_enabled && (
                  <NumberField label="Clock Out After" suffix="hrs" step={0.5} min={1} max={24} name="auto_clock_out_after_hours" value={form.auto_clock_out_after_hours} onChange={set} error={errors.auto_clock_out_after_hours} hint="1–24 hours after clock-in" />
                )}
              </ToggleRow>
              <ToggleRow title="Auto-detect shift" description="Match clock-ins to the nearest shift when none is assigned" checked={form.auto_detect_shift} onChange={(v) => set("auto_detect_shift", v)} />
            </div>
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ToggleRow title="Track Overtime" description="Record work beyond the shift" checked={form.overtime_enabled} onChange={(v) => set("overtime_enabled", v)}>
              {form.overtime_enabled && (
                <>
                  <NumberField label="Count Overtime After" suffix="mins" max={480} name="overtime_min_minutes" value={form.overtime_min_minutes} onChange={set} error={errors.overtime_min_minutes} hint="0–480. Extra minutes below this aren't counted" />
                  <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
                    Requires manager approval
                    <Toggle label="Overtime requires approval" checked={form.overtime_requires_approval} onChange={(v) => set("overtime_requires_approval", v)} />
                  </label>
                  {!form.overtime_requires_approval && <p className="text-[10px] text-slate-400 -mt-2">Overtime will be approved automatically at clock-out.</p>}
                </>
              )}
            </ToggleRow>

            <ToggleRow title="Allow Corrections" description="Employees can request a fix for a missed or wrong punch" checked={form.regularization_allowed} onChange={(v) => set("regularization_allowed", v)}>
              {form.regularization_allowed && (
                <NumberField label="Correction Window" suffix="days" min={1} max={365} name="regularization_window_days" value={form.regularization_window_days} onChange={set} error={errors.regularization_window_days} hint="1–365 past days an employee can request a correction for" />
              )}
            </ToggleRow>

            <ToggleRow title={`Earn ${TERM} for Holiday Work`} description={`Working a holiday or weekly off earns a ${TERM.toLowerCase()}, per the ${TERM.toLowerCase()} policy`} checked={form.comp_off_on_holiday_work} onChange={(v) => set("comp_off_on_holiday_work", v)} />
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 pt-2">
            <button type="button" onClick={onClose} disabled={loading} className="px-8 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition">
              {loading && <Spinner />}
              {loading ? "Saving…" : isEdit ? "Update Policy" : "Create Policy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function AttendancePoliciesPage() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [modal, setModal] = useState(null); // null | "create" | policy object (full details)
  const [editLoading, setEditLoading] = useState(null);
  const [deactivating, setDeactivating] = useState(null);
  const { toast, showToast, clearToast } = useToast();

  const loadPolicies = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await attendanceAPI.getPolicies();
      setPolicies(listFrom(res, ["policies"]));
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  async function handleEditClick(policy) {
    setEditLoading(policy.id);
    try {
      const res = await attendanceAPI.getPolicy(policy.id);
      setModal(unwrap(res) || policy);
    } catch (err) {
      showToast(attendanceErrorMessage(err, "Couldn't load policy details."), "error");
    } finally {
      setEditLoading(null);
    }
  }

  async function handleDeactivate(policy) {
    if (!(await window.confirm(`Deactivate "${policy.name}"? Shifts linked to it will need another policy. Historical records are not affected.`))) return;
    setDeactivating(policy.id);
    try {
      await attendanceAPI.deactivatePolicy(policy.id);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "policy" });
      showToast("Policy deactivated.");
      loadPolicies();
    } catch (err) {
      const fallback = policy.is_default
        ? "The default policy can't be deactivated. Make another policy the default first."
        : "Couldn't deactivate the policy.";
      showToast(attendanceErrorMessage(err, fallback), "error");
    } finally {
      setDeactivating(null);
    }
  }

  function onSaved(msg) {
    setModal(null);
    showToast(msg);
    loadPolicies();
  }

  return (
    <>
      <DashboardTopBar title="Attendance" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Attendance Policies</h1>
            <p className="text-sm text-slate-500 mt-1">Manage how attendance is calculated. Link policies to shift templates.</p>
          </div>
          <button onClick={() => setModal("create")} className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition">
            <HiPlus className="w-4 h-4" />
            Create Policy
          </button>
        </div>

        {loading ? (
          <Skeleton type="table" rows={4} />
        ) : loadError ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <ErrorState error={loadError} onRetry={() => { setLoading(true); loadPolicies(); }} fallback="Couldn't load policies." />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {policies.length === 0 ? (
              <div className="p-16 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <HiClipboardList className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-600">No policies created yet</p>
                <p className="text-xs text-slate-400">Create your first attendance policy to get started.</p>
                <button onClick={() => setModal("create")} className="mt-2 flex items-center gap-2 bg-purple-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl">
                  <HiPlus className="w-4 h-4" />
                  Create Policy
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {["Policy Name", "Grace", "Full / Half Day", "Breaks", "Overtime", "Corrections", TERM, "Status", ""].map((h, i) => (
                        <th key={h || i} className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {policies.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                            {p.is_default && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                <HiBadgeCheck className="w-3 h-3" />
                                Default
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-600">{p.grace_minutes != null ? `${p.grace_minutes} mins` : "—"}</td>
                        <td className="px-6 py-4 text-xs text-slate-600">{p.full_day_min_hours ?? "—"} hrs / {p.half_day_min_hours ?? "—"} hrs</td>
                        <td className="px-6 py-4 text-xs text-slate-600">
                          {p.max_break_duration_minutes != null ? `${p.max_break_duration_minutes} mins max` : "No limit"}
                          {p.max_breaks_per_day != null && <span className="block text-[10px] text-slate-400">{p.max_breaks_per_day} per day</span>}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-600">
                          {p.overtime_enabled ? `After ${p.overtime_min_minutes ?? 0} mins` : "Off"}
                          {p.overtime_enabled && <span className="block text-[10px] text-slate-400">{p.overtime_requires_approval === false ? "Auto-approved" : "Needs approval"}</span>}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-600">{p.regularization_allowed ? `${p.regularization_window_days ?? "—"} days` : "Not allowed"}</td>
                        <td className="px-6 py-4 text-xs text-slate-600">{p.comp_off_on_holiday_work ? "Earned on holidays" : "Off"}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${p.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                            {p.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => handleEditClick(p)} disabled={editLoading === p.id} className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition disabled:opacity-50" title="Edit policy" aria-label={`Edit ${p.name}`}>
                              {editLoading === p.id ? <Spinner className="w-4 h-4 text-purple-600" /> : <HiPencil className="w-4 h-4" />}
                            </button>
                            {p.is_active && (
                              <button onClick={() => handleDeactivate(p)} disabled={deactivating === p.id} className="text-[10px] font-semibold text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 px-3 py-1 rounded-lg transition disabled:opacity-50">
                                {deactivating === p.id ? "…" : "Deactivate"}
                              </button>
                            )}
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
      </main>

      {modal && <PolicyModal editPolicy={modal === "create" ? null : modal} onClose={() => setModal(null)} onSaved={onSaved} />}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
