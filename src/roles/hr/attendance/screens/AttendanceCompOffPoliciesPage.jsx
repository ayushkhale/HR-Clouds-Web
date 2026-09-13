import React, { useCallback, useEffect, useState } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import MultiSelectDropdown from "../../../../shared/components/MultiSelectDropdown";
import { attendanceAPI } from "../../../../shared/api";
import { DICTIONARY } from "../../../../shared/config/dictionary";
import { attendanceErrorMessage } from "../../../../shared/utils/attendanceErrors";
import { validateCompOffPolicy, hasErrors, NAME_MAX } from "../../../../shared/attendance/validation";
import { listFrom } from "../../../../shared/attendance/normalize";
import { fmtHours } from "../../../../shared/attendance/dates";
import { emitAttendanceChanged, ATTENDANCE_EVENTS } from "../../../../shared/attendance/events";
import { useTargetingOptions, withSelected, describeTargeting } from "../../../../shared/attendance/useTargetingOptions";
import { EmptyState, ErrorState, FieldError, InlineAlert, LoadingRows, Spinner, Toast, useToast } from "../../../../shared/attendance/ui";
import { HiPlus, HiX, HiOutlineTrash, HiDocumentText, HiPencil } from "react-icons/hi";

const TERM = DICTIONARY.TERMS.COMP_OFF;
// Full field set per ATTENDANCE_API_CONTRACT.md §5.6.
const EMPTY_FORM = {
  name: "",
  min_hours_for_half_day: "4",
  min_hours_for_full_day: "8",
  multiplier: "1",
  validity_days: "90",
  requires_approval: true,
  max_accumulation: "",
  priority: "0",
  target_departments: [],
  target_locations: [],
  target_employment_types: [],
  target_job_statuses: [],
};

const str = (v, d = "") => (v === null || v === undefined ? d : String(v));
const arr = (v) => (Array.isArray(v) ? v : []);
const inputClass = (invalid) =>
  `w-full h-11 bg-slate-50/70 border rounded-xl px-4 text-sm text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all ${invalid ? "border-rose-300" : "border-slate-200"}`;
const labelClass = "block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5";

function PolicyModal({ policy, onClose, onSaved }) {
  const isEdit = !!policy;
  const [form, setForm] = useState(() =>
    isEdit
      ? {
          name: policy.name || "",
          // Nullable on the backend: an unset value stays empty, not a default.
          min_hours_for_half_day: str(policy.min_hours_for_half_day),
          min_hours_for_full_day: str(policy.min_hours_for_full_day),
          multiplier: str(policy.multiplier, EMPTY_FORM.multiplier),
          validity_days: str(policy.validity_days),
          requires_approval: policy.requires_approval ?? true,
          max_accumulation: str(policy.max_accumulation),
          priority: str(policy.priority, "0"),
          target_departments: arr(policy.target_departments),
          target_locations: arr(policy.target_locations),
          target_employment_types: arr(policy.target_employment_types),
          target_job_statuses: arr(policy.target_job_statuses),
        }
      : EMPTY_FORM
  );
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const targeting = useTargetingOptions();

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    const { errors: v, payload } = validateCompOffPolicy(form);
    setErrors(v);
    if (hasErrors(v)) return;
    setSaving(true);
    setError("");
    try {
      if (isEdit) await attendanceAPI.updateCompOffPolicy(policy.id, payload);
      else await attendanceAPI.createCompOffPolicy(payload);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "compoff_policy" });
      onSaved(isEdit ? "Policy updated." : "Policy created.");
    } catch (err) {
      setError(attendanceErrorMessage(err, isEdit ? "Couldn't update the policy." : "Couldn't create the policy."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <form onSubmit={handleSave} noValidate className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800">{isEdit ? "Edit policy" : "New policy"}</h3>
          <button type="button" onClick={onClose} disabled={saving} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {error && <InlineAlert tone="rose">{error}</InlineAlert>}

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
            <div>
              <label htmlFor="cop-name" className={labelClass}>Policy name <span className="text-red-400">*</span></label>
              <input id="cop-name" type="text" maxLength={NAME_MAX} value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass(!!errors.name)} placeholder={`e.g. Holiday work ${TERM.toLowerCase()}`} />
              <FieldError message={errors.name} />
            </div>
            <div>
              <label htmlFor="cop-priority" className={labelClass}>Priority</label>
              <input id="cop-priority" type="number" step="1" min="0" max="999" value={form.priority} onChange={(e) => set("priority", e.target.value)} className={inputClass(!!errors.priority)} />
              <FieldError message={errors.priority} />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 -mt-3">When several policies apply to the same employee, the higher priority wins.</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="cop-half" className={labelClass}>Hours for half day</label>
              <input id="cop-half" type="number" step="0.25" min="0" max="24" value={form.min_hours_for_half_day} onChange={(e) => set("min_hours_for_half_day", e.target.value)} className={inputClass(!!errors.min_hours_for_half_day)} />
              <FieldError message={errors.min_hours_for_half_day} />
            </div>
            <div>
              <label htmlFor="cop-full" className={labelClass}>Hours for full day</label>
              <input id="cop-full" type="number" step="0.25" min="0" max="24" value={form.min_hours_for_full_day} onChange={(e) => set("min_hours_for_full_day", e.target.value)} className={inputClass(!!errors.min_hours_for_full_day)} />
              <FieldError message={errors.min_hours_for_full_day} />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 -mt-3">Minimum effective hours worked on a holiday or weekly off to earn a half or full day.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="cop-mult" className={labelClass}>Multiplier <span className="text-red-400">*</span></label>
              <input id="cop-mult" type="number" step="0.25" min="0.25" max="10" value={form.multiplier} onChange={(e) => set("multiplier", e.target.value)} className={inputClass(!!errors.multiplier)} />
              {errors.multiplier ? <FieldError message={errors.multiplier} /> : <p className="text-[11px] text-slate-400 mt-1">1 = one day credited per day earned.</p>}
            </div>
            <div>
              <label htmlFor="cop-valid" className={labelClass}>Valid for (days)</label>
              <input id="cop-valid" type="number" step="1" min="1" max="365" value={form.validity_days} onChange={(e) => set("validity_days", e.target.value)} placeholder="No expiry" className={inputClass(!!errors.validity_days)} />
              {errors.validity_days ? <FieldError message={errors.validity_days} /> : <p className="text-[11px] text-slate-400 mt-1">1–365. Empty = no expiry.</p>}
            </div>
            <div>
              <label htmlFor="cop-max" className={labelClass}>Maximum balance</label>
              <input id="cop-max" type="number" step="1" min="1" value={form.max_accumulation} onChange={(e) => set("max_accumulation", e.target.value)} placeholder="No cap" className={inputClass(!!errors.max_accumulation)} />
              {errors.max_accumulation ? <FieldError message={errors.max_accumulation} /> : <p className="text-[11px] text-slate-400 mt-1">Cap on unused credit. Empty = no cap.</p>}
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
            <input type="checkbox" checked={form.requires_approval} onChange={(e) => set("requires_approval", e.target.checked)} className="w-4 h-4 mt-0.5 rounded text-purple-600 focus:ring-purple-500 border-slate-300" />
            <span>
              <span className="block text-sm font-semibold text-slate-700">Requires manager approval</span>
              <span className="block text-[11px] text-slate-400">When enabled, earned {TERM.toLowerCase()}s wait for a manager (or HR override) before they're credited to leave.</span>
            </span>
          </label>

          <hr className="border-slate-100" />
          <div>
            <h4 className="text-sm font-bold text-slate-800">Applies to</h4>
            <p className="text-xs text-slate-500 mt-0.5">Leave everything empty to apply the policy to the whole organisation.</p>
            {targeting.loading && <p className="text-[11px] text-slate-400 mt-1">Loading locations, departments and employees…</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MultiSelectDropdown label="Departments" placeholder="All Departments" options={withSelected(targeting.departmentOptions, form.target_departments)} value={form.target_departments} onChange={(v) => set("target_departments", v)} />
            <MultiSelectDropdown label="Locations" placeholder="All Locations" options={withSelected(targeting.locationOptions, form.target_locations)} value={form.target_locations} onChange={(v) => set("target_locations", v)} />
            <MultiSelectDropdown label="Employment Types" placeholder="All Types" options={withSelected(targeting.employmentTypeOptions, form.target_employment_types)} value={form.target_employment_types} onChange={(v) => set("target_employment_types", v)} />
            <MultiSelectDropdown label="Job Statuses" placeholder="All Statuses" options={withSelected(targeting.jobStatusOptions, form.target_job_statuses)} value={form.target_job_statuses} onChange={(v) => set("target_job_statuses", v)} />
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-200/50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-60">
            {saving && <Spinner />}
            {isEdit ? "Save changes" : "Create policy"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AttendanceCompOffPoliciesPage() {
  const [state, setState] = useState({ policies: [], loading: true, error: null });
  const [modal, setModal] = useState(null); // null | "create" | policy
  const [deleting, setDeleting] = useState(null);
  const { toast, showToast, clearToast } = useToast();
  const targeting = useTargetingOptions();

  const fetchPolicies = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getCompOffPolicies();
      const policies = listFrom(res, ["policies"]).sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
      setState({ policies, loading: false, error: null });
    } catch (error) {
      setState({ policies: [], loading: false, error });
    }
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const handleDelete = async (policy) => {
    if (deleting) return;
    if (!(await window.confirm(`Delete the "${policy.name}" ${TERM.toLowerCase()} policy? Credits already earned are not affected.`))) return;
    setDeleting(policy.id);
    try {
      await attendanceAPI.deleteCompOffPolicy(policy.id);
      emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "compoff_policy" });
      showToast("Policy deleted.");
      fetchPolicies();
    } catch (err) {
      showToast(attendanceErrorMessage(err, "Couldn't delete the policy."), "error");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <DashboardTopBar title={`${TERM} Policies`} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800">{TERM} Policies</h2>
              <p className="text-sm text-slate-500 mt-1">Rules for earning compensatory days when employees work on holidays or weekly offs.</p>
            </div>
            <button onClick={() => setModal("create")} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-colors shadow-sm">
              <HiPlus className="w-4 h-4" /> Add policy
            </button>
          </div>

          <InlineAlert tone="sky">
            {TERM}s are only earned when the employee's attendance policy has “Earn {TERM} for Holiday Work” turned on.
          </InlineAlert>

          <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
            {state.error ? (
              <ErrorState error={state.error} onRetry={fetchPolicies} fallback="Couldn't load policies." />
            ) : state.loading ? (
              <div className="p-6"><LoadingRows rows={3} /></div>
            ) : state.policies.length === 0 ? (
              <EmptyState icon={HiDocumentText} title="No policies yet" message={`Create a ${TERM.toLowerCase()} policy to define how extra work is credited.`} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[980px]">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-6 py-3.5">Policy</th>
                      <th className="px-6 py-3.5">Half / full day</th>
                      <th className="px-6 py-3.5">Credit</th>
                      <th className="px-6 py-3.5">Applies to</th>
                      <th className="px-6 py-3.5">Approval</th>
                      <th className="px-6 py-3.5 text-right"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.policies.map((policy) => {
                      const scope = describeTargeting(policy, targeting);
                      return (
                        <tr key={policy.id} className="hover:bg-slate-50/80 transition-colors align-top">
                          <td className="px-6 py-4 font-bold text-slate-800">
                            {policy.name}
                            <span className="block text-[10px] font-semibold text-slate-400 mt-0.5">Priority {policy.priority ?? 0}</span>
                            {policy.is_active === false && <span className="text-[10px] font-bold text-slate-400">Inactive</span>}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600">{fmtHours(policy.min_hours_for_half_day)} / {fmtHours(policy.min_hours_for_full_day)}</td>
                          <td className="px-6 py-4 text-xs text-slate-600">
                            ×{policy.multiplier ?? 1}
                            <span className="block text-[10px] text-slate-400">{policy.validity_days != null ? `Expires after ${policy.validity_days} days` : "No expiry"}</span>
                            <span className="block text-[10px] text-slate-400">{policy.max_accumulation != null ? `Max balance ${policy.max_accumulation}` : "No balance cap"}</span>
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                            {scope.length === 0 ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">Whole organisation</span>
                            ) : (
                              scope.map((line) => <p key={line} className="text-[10px] font-semibold text-slate-500 truncate" title={line}>{line}</p>)
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs">
                            {policy.requires_approval === false
                              ? <span className="font-bold text-emerald-600">Auto-credited</span>
                              : <span className="font-bold text-amber-600">Manager approval</span>}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => setModal(policy)} className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors" aria-label={`Edit ${policy.name}`}>
                                <HiPencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(policy)} disabled={deleting === policy.id} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50" aria-label={`Delete ${policy.name}`}>
                                {deleting === policy.id ? <Spinner className="w-4 h-4" /> : <HiOutlineTrash className="w-4 h-4" />}
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
        </div>
      </div>

      {modal && (
        <PolicyModal
          policy={modal === "create" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={(msg) => { setModal(null); showToast(msg); fetchPolicies(); }}
        />
      )}
      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}

export default AttendanceCompOffPoliciesPage;
