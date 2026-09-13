import React, { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { attendanceAPI } from "../../../../shared/api";
import MultiSelectDropdown from "../../../../shared/components/MultiSelectDropdown";
import { attendanceErrorMessage } from "../../../../shared/utils/attendanceErrors";
import { listFrom } from "../../../../shared/attendance/normalize";
import { WEEKDAYS } from "../../../../shared/attendance/enums";
import { fmtDate, todayYMD, ymdOnly } from "../../../../shared/attendance/dates";
import { validateWeeklyOff, hasErrors } from "../../../../shared/attendance/validation";
import { emitAttendanceChanged, ATTENDANCE_EVENTS } from "../../../../shared/attendance/events";
import { useTargetingOptions, withSelected, describeTargeting } from "../../../../shared/attendance/useTargetingOptions";
import { EmptyState, ErrorState, FieldError, InlineAlert, Spinner, Toast, useToast } from "../../../../shared/attendance/ui";
import { HiTemplate, HiPlus, HiX, HiTrash, HiPencil } from "react-icons/hi";

const dayName = (v) => WEEKDAYS.find((d) => d.value === Number(v))?.label || "Unknown day";
const sortDays = (days) => [...new Set(days.map(Number))].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);

function ruleDays(rule) {
  if (Array.isArray(rule?.days_of_week)) return sortDays(rule.days_of_week);
  if (rule?.day_of_week !== undefined && rule?.day_of_week !== null) return sortDays([rule.day_of_week]);
  return [];
}

const hasTargeting = (r) =>
  ["target_locations", "target_departments", "target_shifts", "target_users", "target_employment_types", "target_job_statuses"]
    .some((k) => Array.isArray(r[k]) && r[k].length > 0);

/* ─── Create / Edit Modal ────────────────────────────────────────────────── */
function WeeklyOffModal({ shifts, onClose, onSaved, editRule }) {
  const isEdit = !!editRule;
  const [form, setForm] = useState({
    name: editRule?.name || "",
    priority: String(editRule?.priority ?? 0),
    effective_from: ymdOnly(editRule?.effective_from) || todayYMD(),
    effective_to: ymdOnly(editRule?.effective_to),
    days_of_week: ruleDays(editRule),
    target_locations: editRule?.target_locations || [],
    target_departments: editRule?.target_departments || [],
    target_shifts: editRule?.target_shifts || (editRule?.shift_id ? [editRule.shift_id] : []),
    target_employment_types: editRule?.target_employment_types || [],
    target_job_statuses: editRule?.target_job_statuses || [],
    // Weekly-off rules target `target_users`; there is no include/exclude pair (§5.5).
    target_users: editRule?.target_users || [],
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const targeting = useTargetingOptions({ shifts });

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  }

  function toggleDay(val) {
    setForm((prev) => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(val) ? prev.days_of_week.filter((d) => d !== val) : sortDays([...prev.days_of_week, val]),
    }));
    setErrors((e) => ({ ...e, days_of_week: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    const { errors: v, payload } = validateWeeklyOff(form);
    setErrors(v);
    if (hasErrors(v)) return;

    setLoading(true);
    setError("");
    try {
      if (isEdit) await attendanceAPI.updateWeeklyOff(editRule.id, payload);
      else await attendanceAPI.createWeeklyOff(payload);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "weekly_off" });
      onSaved(isEdit ? "Weekly off rule updated." : "Weekly off rule saved.");
    } catch (err) {
      setError(attendanceErrorMessage(err, "Couldn't save the weekly off rule."));
    } finally {
      setLoading(false);
    }
  }

  const inputClass = (invalid) => `w-full px-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white shadow-xs ${invalid ? "border-rose-300" : "border-slate-200"}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">{isEdit ? "Edit Weekly Off Rule" : "Add Weekly Off Rule"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Define non-working weekdays for the whole company or specific groups.</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5" noValidate>
          {error && <InlineAlert tone="rose">{error}</InlineAlert>}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="wo-name" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Rule Name <span className="text-red-400">*</span></label>
              <input id="wo-name" type="text" maxLength={150} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Company weekend" className={inputClass(!!errors.name)} />
              <FieldError message={errors.name} />
            </div>
            <div>
              <label htmlFor="wo-priority" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Priority <span className="text-red-400">*</span></label>
              <input id="wo-priority" type="number" min={0} max={999} step={1} value={form.priority} onChange={(e) => set("priority", e.target.value)} className={inputClass(!!errors.priority)} />
              {errors.priority ? <FieldError message={errors.priority} /> : <p className="text-[10px] text-slate-400 mt-1">When rules overlap, the higher number wins.</p>}
            </div>
            <div>
              <label htmlFor="wo-from" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Effective From <span className="text-red-400">*</span></label>
              <input id="wo-from" type="date" value={form.effective_from} onChange={(e) => set("effective_from", e.target.value)} className={inputClass(!!errors.effective_from)} />
              <FieldError message={errors.effective_from} />
            </div>
            <div>
              <label htmlFor="wo-to" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Effective Until</label>
              <input id="wo-to" type="date" min={form.effective_from || undefined} value={form.effective_to} onChange={(e) => set("effective_to", e.target.value)} className={inputClass(!!errors.effective_to)} />
              {errors.effective_to ? <FieldError message={errors.effective_to} /> : <p className="text-[10px] text-slate-400 mt-1">Leave empty to keep the rule running.</p>}
            </div>
          </div>

          <div>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Days Off <span className="text-red-400">*</span></span>
            <div className="flex gap-2 flex-wrap">
              {WEEKDAYS.map((d) => {
                const active = form.days_of_week.includes(d.value);
                return (
                  <button key={d.value} type="button" onClick={() => toggleDay(d.value)} aria-pressed={active} className={`px-3.5 py-2 rounded-xl text-xs font-bold border-2 transition ${active ? "bg-purple-600 text-white border-purple-600 shadow-sm shadow-purple-200" : "bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:text-purple-600"}`}>
                    {d.short}
                  </button>
                );
              })}
            </div>
            {errors.days_of_week ? <FieldError message={errors.days_of_week} /> : form.days_of_week.length > 0 && (
              <p className="text-[10px] text-slate-400 mt-2">Selected: {form.days_of_week.map(dayName).join(", ")}</p>
            )}
          </div>

          <hr className="border-slate-100" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Targeting</h3>
            <p className="text-xs text-slate-500 mt-0.5">Leave everything empty to apply to the entire organisation. Weekly off rules can target specific employees but can't exclude anyone — narrow the rule's targeting instead.</p>
            {targeting.loading && <p className="text-[11px] text-slate-400 mt-1">Loading locations, departments and employees…</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MultiSelectDropdown label="Applicable Shifts" placeholder="All Shifts" options={withSelected(targeting.shiftOptions, form.target_shifts)} value={form.target_shifts} onChange={(v) => set("target_shifts", v)} />
            <MultiSelectDropdown label="Applicable Departments" placeholder="All Departments" options={withSelected(targeting.departmentOptions, form.target_departments)} value={form.target_departments} onChange={(v) => set("target_departments", v)} />
            <MultiSelectDropdown label="Applicable Locations" placeholder="All Locations" options={withSelected(targeting.locationOptions, form.target_locations)} value={form.target_locations} onChange={(v) => set("target_locations", v)} />
            <MultiSelectDropdown label="Employment Types" placeholder="All Types" options={withSelected(targeting.employmentTypeOptions, form.target_employment_types)} value={form.target_employment_types} onChange={(v) => set("target_employment_types", v)} />
            <MultiSelectDropdown label="Job Statuses" placeholder="All Statuses" options={withSelected(targeting.jobStatusOptions, form.target_job_statuses)} value={form.target_job_statuses} onChange={(v) => set("target_job_statuses", v)} />
            <MultiSelectDropdown label="Specific Employees" placeholder="None" options={withSelected(targeting.employeeOptions, form.target_users, "Former employee")} value={form.target_users} onChange={(v) => set("target_users", v)} />
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={loading} className="px-6 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition">
              {loading && <Spinner />}
              {loading ? "Saving…" : isEdit ? "Update Rule" : "Save Rule"}
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
  const [loadError, setLoadError] = useState(null);
  const [modalRule, setModalRule] = useState(null); // null | "create" | rule
  const [deleting, setDeleting] = useState(null);
  const { toast, showToast, clearToast } = useToast();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [rulesRes, shiftsRes] = await Promise.all([attendanceAPI.getWeeklyOffs(), attendanceAPI.getShifts().catch(() => null)]);
      setRules(listFrom(rulesRes, ["rules", "weekly_offs"]));
      setShifts(shiftsRes ? listFrom(shiftsRes, ["shifts"]) : []);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeShifts = useMemo(() => shifts.filter((s) => s.is_active), [shifts]);
  const targeting = useTargetingOptions({ shifts });

  async function handleDelete(rule) {
    if (!(await window.confirm(`Remove the weekly off rule "${rule.name}"? Affected days will be treated as working days from now on.`))) return;
    setDeleting(rule.id);
    try {
      await attendanceAPI.deleteWeeklyOff(rule.id);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "weekly_off" });
      showToast("Rule removed.");
      load();
    } catch (err) {
      showToast(attendanceErrorMessage(err, "Couldn't remove the rule."), "error");
    } finally {
      setDeleting(null);
    }
  }

  // Grouped by actual scope (not by priority, which only orders overlaps).
  const byPriority = (a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0);
  const globalRules = rules.filter((r) => !hasTargeting(r)).sort(byPriority);
  const targetedRules = rules.filter(hasTargeting).sort(byPriority);

  // A render helper, not a nested component: a component declared inside the
  // page gets a new identity every render, so React would remount both tables.
  function renderRulesTable({ title, subtitle, rows, emptyMsg }) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-700">{title} <span className="text-slate-400 font-semibold">({rows.length})</span></h2>
          <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
        </div>
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-xs text-slate-400">{emptyMsg}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Rule", "Days Off", "Priority", "Effective", "Applies To", "Status", ""].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r) => {
                  const lines = describeTargeting(r, targeting);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-semibold text-slate-800">{r.name || "Untitled rule"}</td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-600">{ruleDays(r).map(dayName).join(", ") || "—"}</td>
                      <td className="px-6 py-4 text-xs text-slate-500">{r.priority ?? 0}</td>
                      <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">{fmtDate(ymdOnly(r.effective_from))}{r.effective_to ? ` – ${fmtDate(ymdOnly(r.effective_to))}` : " onwards"}</td>
                      <td className="px-6 py-4 max-w-xs">
                        {lines.length === 0 ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">Whole organisation</span>
                        ) : (
                          lines.map((line) => <p key={line} className="text-[10px] font-semibold text-slate-500 truncate" title={line}>{line}</p>)
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${r.is_active !== false ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${r.is_active !== false ? "bg-emerald-500" : "bg-slate-400"}`} />
                          {r.is_active !== false ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setModalRule(r)} className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition" title="Edit rule" aria-label={`Edit ${r.name}`}>
                            <HiPencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(r)} disabled={deleting === r.id} className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-50" title="Delete rule" aria-label={`Delete ${r.name}`}>
                            {deleting === r.id ? <Spinner className="w-4 h-4" /> : <HiTrash className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <DashboardTopBar title="Attendance" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Weekly Off Configuration</h1>
            <p className="text-sm text-slate-500 mt-1">Define which days of the week are non-working for your teams.</p>
          </div>
          <button onClick={() => setModalRule("create")} className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-purple-200 transition">
            <HiPlus className="w-4 h-4" /> Add Rule
          </button>
        </div>

        {loading ? (
          <Skeleton type="table" rows={4} />
        ) : loadError ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <ErrorState error={loadError} onRetry={() => { setLoading(true); load(); }} fallback="Couldn't load weekly off rules." />
          </div>
        ) : rules.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <EmptyState icon={HiTemplate} title="No weekly off rules yet" message="Configure weekends so the attendance engine knows non-working days." />
          </div>
        ) : (
          <>
            {renderRulesTable({ title: "Organisation-wide rules", subtitle: "Apply to everyone unless a higher-priority targeted rule overrides them.", rows: globalRules, emptyMsg: "No company-wide weekend rules configured." })}
            {renderRulesTable({ title: "Targeted rules", subtitle: "Apply only to the listed locations, departments, shifts or employees.", rows: targetedRules, emptyMsg: "No targeted rules configured." })}
          </>
        )}
      </main>

      {modalRule && (
        <WeeklyOffModal
          editRule={modalRule === "create" ? null : modalRule}
          shifts={activeShifts}
          onClose={() => setModalRule(null)}
          onSaved={(msg) => { setModalRule(null); showToast(msg); load(); }}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
