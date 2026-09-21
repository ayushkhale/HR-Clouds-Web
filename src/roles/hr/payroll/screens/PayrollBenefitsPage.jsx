import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import {
  HiPlus, HiSearch, HiRefresh, HiChevronLeft, HiChevronRight, HiExclamationCircle,
  HiHeart, HiX, HiPencil, HiBan, HiUserAdd, HiInformationCircle,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import ReasonDialog from "../../../../shared/components/ReasonDialog";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { payrollErrorMessage, payrollErrorCode } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatDate } from "../../../../shared/utils/formatUtils";
import { listFrom } from "../../../../shared/attendance/normalize";
import { usePagedList } from "../../../../shared/attendance/usePagedList";
import useEmployeeDirectory from "../useEmployeeDirectory";
import useToast from "../useToast";
import PayrollToast from "../PayrollToast";
import { plural } from "../runMeta";
import { parseMoney } from "../../../../shared/utils/reimbursementMeta";
import {
  BENEFIT_TYPE_OPTIONS, benefitTypeLabel, enrollmentStatusMeta, effectiveContribution,
  normalizePlanDetail, chargeNoticeForStart, chargeNoticeForEnd, NO_TAX_EFFECT_NOTE, NO_PRORATION_NOTE,
  ENROLLMENT_STATUS_FILTERS,
} from "../../../../shared/utils/benefitMeta";
import { PersonSelect } from "../../../../shared/components/PersonPicker";

const PAGE_SIZE = 20;
const fieldCls = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none disabled:opacity-60";
const labelCls = "block text-[11px] font-bold text-slate-500 uppercase mb-2";
const errorTextCls = "text-xs font-semibold text-rose-600 mt-1.5";
const selectCls = "h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400";
const CODE_RE = /^[A-Z0-9_]{2,50}$/;
const codeFromName = (name) => String(name || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
const capValue = (v, { allowZero = false } = {}) => { if (v === "" || v === null || v === undefined) return null; const n = parseMoney(v, { allowZero }); return Number.isNaN(n) ? null : n; };

function Spinner({ light = false }) {
  return <span className={`inline-block w-4 h-4 border-2 rounded-full animate-spin ${light ? "border-white/30 border-t-white" : "border-purple-200 border-t-purple-600"}`} />;
}

// ── Plan form (#138 create / #141 edit) ─────────────────────────────────────
const emptyPlan = () => ({
  name: "", code: "", codeEdited: false, benefit_type: "health_insurance", provider_name: "", description: "",
  employee_contribution_amount: "0", employer_contribution_amount: "0",
  employee_component_id: "", employer_component_id: "", coverage_amount: "",
  effective_from: new Date().toISOString().slice(0, 10), effective_to: "", is_active: true,
});
function planToForm(p) {
  return {
    name: p.name || "", code: p.code || "", codeEdited: true, benefit_type: p.benefit_type || "health_insurance",
    provider_name: p.provider_name || "", description: p.description || "",
    employee_contribution_amount: p.employee_contribution_amount != null ? String(p.employee_contribution_amount) : "0",
    employer_contribution_amount: p.employer_contribution_amount != null ? String(p.employer_contribution_amount) : "0",
    employee_component_id: p.employee_component_id || "", employer_component_id: p.employer_component_id || "",
    coverage_amount: p.coverage_amount != null ? String(p.coverage_amount) : "",
    effective_from: p.effective_from ? String(p.effective_from).slice(0, 10) : "", effective_to: p.effective_to ? String(p.effective_to).slice(0, 10) : "",
    is_active: p.is_active !== false,
  };
}
function validatePlan(f, { isEdit }) {
  const e = {};
  if (f.name.trim().length < 2 || f.name.trim().length > 150) e.name = "Enter a name (2–150 characters).";
  if (!isEdit && !CODE_RE.test(f.code)) e.code = "Use capital letters, digits and underscores (2–50 characters).";
  if (Number.isNaN(parseMoney(f.employee_contribution_amount, { allowZero: true }))) e.employee_contribution_amount = "Enter an amount (0 or more).";
  if (Number.isNaN(parseMoney(f.employer_contribution_amount, { allowZero: true }))) e.employer_contribution_amount = "Enter an amount (0 or more).";
  if (f.coverage_amount !== "" && Number.isNaN(parseMoney(f.coverage_amount, { allowZero: true }))) e.coverage_amount = "Enter an amount, or leave it empty.";
  if (!f.effective_from) e.effective_from = "Choose a start date.";
  if (f.effective_to && f.effective_from && f.effective_to < f.effective_from) e.effective_to = "The end date can't be before the start date.";
  return e;
}

function PlanFormDialog({ plan, components, activeCount, onClose, onSaved }) {
  const isEdit = !!plan;
  const [form, setForm] = useState(() => (plan ? planToForm(plan) : emptyPlan()));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [fieldErr, setFieldErr] = useState({});
  const savingRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = saving ? () => {} : onClose;
  useEffect(() => { const onKey = (e) => { if (e.key === "Escape") closeRef.current(); }; document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, []);

  const errors = validatePlan(form, { isEdit });
  const show = (key) => (touched ? errors[key] : "") || fieldErr[key] || "";
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setServerError(""); setFieldErr({}); };
  const changeName = (name) => set(form.codeEdited || isEdit ? { name } : { name, code: codeFromName(name) });
  const catalog = useMemo(() => (Array.isArray(components) ? components : []).filter((c) => c.is_active !== false && !c.is_statutory), [components]);
  const bothZero = parseMoney(form.employee_contribution_amount, { allowZero: true }) === 0 && parseMoney(form.employer_contribution_amount, { allowZero: true }) === 0;

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length > 0 || savingRef.current) return;
    const amountsChanged = isEdit && (String(plan.employee_contribution_amount) !== form.employee_contribution_amount || String(plan.employer_contribution_amount) !== form.employer_contribution_amount);
    if (amountsChanged && activeCount > 0) {
      const ok = await window.confirm(`New amounts apply from the next payroll calculation for ${plural(activeCount, "member")}. Payroll that is already approved won't change.`);
      if (!ok) return;
    }
    savingRef.current = true;
    setSaving(true);
    setServerError("");
    const payload = {
      name: form.name.trim(),
      provider_name: form.provider_name.trim() || null,
      description: form.description.trim() || null,
      employee_contribution_amount: parseMoney(form.employee_contribution_amount, { allowZero: true }),
      employer_contribution_amount: parseMoney(form.employer_contribution_amount, { allowZero: true }),
      employee_component_id: form.employee_component_id || null,
      employer_component_id: form.employer_component_id || null,
      coverage_amount: capValue(form.coverage_amount, { allowZero: true }),
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      is_active: form.is_active,
    };
    if (!isEdit) { payload.code = form.code.trim(); payload.benefit_type = form.benefit_type; }
    try {
      const res = isEdit ? await payrollAPI.updateBenefitPlan(plan.id, payload) : await payrollAPI.createBenefitPlan(payload);
      onSaved(res?.data ?? res, isEdit);
    } catch (err) {
      if (payrollErrorCode(err) === "PLAN_CODE_EXISTS") setFieldErr({ code: payrollErrorMessage(err) });
      else setServerError(payrollErrorMessage(err, "Couldn't save this plan."));
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <form onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-label={isEdit ? "Edit plan" : "New plan"} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 sm:px-8 py-5 border-b border-purple-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{isEdit ? "Edit benefit plan" : "New benefit plan"}</h2>
            <p className="text-sm text-slate-500 mt-0.5">Set the flat monthly employee and company contributions.</p>
          </div>
          <button type="button" onClick={() => closeRef.current()} disabled={saving} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 sm:px-8 py-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="plan-name" className={labelCls}>Name <span className="text-rose-500">*</span></label>
              <input id="plan-name" value={form.name} maxLength={150} onChange={(e) => changeName(e.target.value)} placeholder="e.g. Group health cover" className={fieldCls} aria-invalid={!!show("name")} />
              {show("name") && <p className={errorTextCls}>{show("name")}</p>}
            </div>
            <div>
              <label htmlFor="plan-code" className={labelCls}>Code {!isEdit && <span className="text-rose-500">*</span>}</label>
              <input id="plan-code" value={form.code} maxLength={50} disabled={isEdit} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[\s-]+/g, "_"), codeEdited: true })} placeholder="e.g. GHI" className={`${fieldCls} font-mono`} aria-invalid={!!show("code")} />
              {show("code") && <p className={errorTextCls}>{show("code")}</p>}
            </div>
            <div>
              <label htmlFor="plan-type" className={labelCls}>Type {!isEdit && <span className="text-rose-500">*</span>}</label>
              <select id="plan-type" value={form.benefit_type} disabled={isEdit} onChange={(e) => set({ benefit_type: e.target.value })} className={fieldCls}>
                {BENEFIT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{benefitTypeLabel(t)}</option>)}
              </select>
              {isEdit && <p className="text-[11px] text-slate-400 mt-1">The type can&apos;t be changed.</p>}
            </div>
            <div>
              <label htmlFor="plan-provider" className={labelCls}>Provider</label>
              <input id="plan-provider" value={form.provider_name} maxLength={150} onChange={(e) => set({ provider_name: e.target.value })} placeholder="Optional" className={fieldCls} />
            </div>
          </div>

          <div>
            <label htmlFor="plan-desc" className={labelCls}>Description</label>
            <textarea id="plan-desc" rows={2} maxLength={1000} value={form.description} onChange={(e) => set({ description: e.target.value })} className={`${fieldCls} resize-none`} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label htmlFor="plan-emp" className={labelCls}>Employee pays / month <span className="text-rose-500">*</span></label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                <input id="plan-emp" type="number" inputMode="decimal" min="0" step="0.01" value={form.employee_contribution_amount} onChange={(e) => set({ employee_contribution_amount: e.target.value })} className={`${fieldCls} pl-7`} aria-invalid={!!show("employee_contribution_amount")} />
              </div>
              {show("employee_contribution_amount") && <p className={errorTextCls}>{show("employee_contribution_amount")}</p>}
            </div>
            <div>
              <label htmlFor="plan-emr" className={labelCls}>Company pays / month <span className="text-rose-500">*</span></label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                <input id="plan-emr" type="number" inputMode="decimal" min="0" step="0.01" value={form.employer_contribution_amount} onChange={(e) => set({ employer_contribution_amount: e.target.value })} className={`${fieldCls} pl-7`} aria-invalid={!!show("employer_contribution_amount")} />
              </div>
              {show("employer_contribution_amount") && <p className={errorTextCls}>{show("employer_contribution_amount")}</p>}
            </div>
            <div>
              <label htmlFor="plan-cover" className={labelCls}>Sum insured</label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                <input id="plan-cover" type="number" inputMode="decimal" min="0" step="0.01" value={form.coverage_amount} onChange={(e) => set({ coverage_amount: e.target.value })} placeholder="Optional" className={`${fieldCls} pl-7`} aria-invalid={!!show("coverage_amount")} />
              </div>
              {show("coverage_amount") && <p className={errorTextCls}>{show("coverage_amount")}</p>}
            </div>
          </div>

          {bothZero && <p className="text-[11px] text-fuchsia-600">Both amounts are 0, so this plan won&apos;t change anyone&apos;s pay.</p>}
          <p className="text-[11px] text-slate-500">{NO_TAX_EFFECT_NOTE}</p>
          <p className="text-[11px] text-slate-500">{NO_PRORATION_NOTE}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="plan-from" className={labelCls}>Starts <span className="text-rose-500">*</span></label>
              <input id="plan-from" type="date" value={form.effective_from} onChange={(e) => set({ effective_from: e.target.value })} className={fieldCls} aria-invalid={!!show("effective_from")} />
              {show("effective_from") && <p className={errorTextCls}>{show("effective_from")}</p>}
            </div>
            <div>
              <label htmlFor="plan-to" className={labelCls}>Ends</label>
              <input id="plan-to" type="date" value={form.effective_to} min={form.effective_from || undefined} onChange={(e) => set({ effective_to: e.target.value })} placeholder="No end date" className={fieldCls} aria-invalid={!!show("effective_to")} />
              {show("effective_to") && <p className={errorTextCls}>{show("effective_to")}</p>}
            </div>
          </div>

          <details className="rounded-xl border border-slate-200 px-4 py-3">
            <summary className="text-sm font-bold text-slate-600 cursor-pointer">Advanced</summary>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="plan-emp-comp" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Deduction component (employee)</label>
                <select id="plan-emp-comp" value={form.employee_component_id} onChange={(e) => set({ employee_component_id: e.target.value })} className={fieldCls}>
                  <option value="">Payroll picks one</option>
                  {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="plan-emr-comp" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Company component</label>
                <select id="plan-emr-comp" value={form.employer_component_id} onChange={(e) => set({ employer_component_id: e.target.value })} className={fieldCls}>
                  <option value="">Payroll picks one</option>
                  {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {isEdit && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => set({ is_active: e.target.checked })} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                  <span className="text-sm font-medium text-slate-700">Active</span>
                </label>
              )}
            </div>
          </details>

          {serverError && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">{serverError}</p>}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 sm:px-8 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <button type="button" onClick={() => closeRef.current()} disabled={saving} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">Close</button>
          <button type="submit" disabled={saving} className="sm:min-w-[180px] px-6 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-60 flex justify-center items-center gap-2">{saving ? <Spinner light /> : isEdit ? "Save changes" : "Save plan"}</button>
        </div>
      </form>
    </div>
  );
}

// ── Enroll dialog (#143) ─────────────────────────────────────────────────────
function EnrollDialog({ plans, plan, employees, employee, onClose, onEnrolled }) {
  const lockEmployee = !!employee;
  const lockPlan = !!plan;
  const [form, setForm] = useState({ user_id: employee?.id || "", plan_id: plan?.id || "", enrolled_from: new Date().toISOString().slice(0, 10), employee_override: "", employer_override: "" });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [overlapWarn, setOverlapWarn] = useState("");
  const savingRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = saving ? () => {} : onClose;
  useEffect(() => { const onKey = (e) => { if (e.key === "Escape") closeRef.current(); }; document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, []);

  const selectedPlan = plan || plans.find((p) => p.id === form.plan_id) || null;

  const errors = {};
  if (!form.user_id) errors.user_id = "Choose an employee.";
  if (!form.plan_id) errors.plan_id = "Choose a plan.";
  if (!form.enrolled_from) errors.enrolled_from = "Choose a start date.";
  else if (selectedPlan) {
    if (selectedPlan.effective_from && form.enrolled_from < String(selectedPlan.effective_from).slice(0, 10)) errors.enrolled_from = "The plan isn't available on that date.";
    if (selectedPlan.effective_to && form.enrolled_from > String(selectedPlan.effective_to).slice(0, 10)) errors.enrolled_from = "The plan isn't available on that date.";
  }
  if (form.employee_override !== "" && Number.isNaN(parseMoney(form.employee_override, { allowZero: true }))) errors.employee_override = "Enter an amount (0 or more).";
  if (form.employer_override !== "" && Number.isNaN(parseMoney(form.employer_override, { allowZero: true }))) errors.employer_override = "Enter an amount (0 or more).";
  const show = (key) => (touched ? errors[key] : "");
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setServerError(""); };

  // Advisory overlap pre-check.
  useEffect(() => {
    let cancelled = false;
    setOverlapWarn("");
    if (!form.user_id || !form.plan_id || !form.enrolled_from) return undefined;
    const month = form.enrolled_from.slice(0, 7);
    payrollAPI.getEmployeeBenefitEnrollments(form.user_id, { plan_id: form.plan_id, limit: 50 })
      .then((res) => {
        if (cancelled) return;
        const rows = listFrom(res, ["enrollments", "rows", "records"]);
        const clash = rows.some((r) => r.status !== "cancelled" && String(r.enrolled_from || "").slice(0, 7) <= month && (!r.enrolled_to || String(r.enrolled_to).slice(0, 7) >= month));
        if (clash) setOverlapWarn("They already have cover in this plan around that month. Pick a start date in a later month.");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [form.user_id, form.plan_id, form.enrolled_from]);

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length > 0 || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setServerError("");
    const overrides = {};
    if (form.employee_override !== "") overrides.employee_contribution_override = parseMoney(form.employee_override, { allowZero: true });
    if (form.employer_override !== "") overrides.employer_contribution_override = parseMoney(form.employer_override, { allowZero: true });
    const payload = { user_id: form.user_id, enrolled_from: form.enrolled_from };
    if (Object.keys(overrides).length > 0) payload.overrides = overrides;
    try {
      const res = await payrollAPI.enrollInBenefitPlan(form.plan_id, payload);
      onEnrolled(res?.data ?? res, form.enrolled_from);
    } catch (err) {
      const code = payrollErrorCode(err);
      if (["ENROLLMENT_PERIOD_OVERLAP", "ALREADY_ENROLLED"].includes(code)) setServerError("They already have cover in this plan for that month. Start from a later month.");
      else setServerError(payrollErrorMessage(err, "Couldn't enroll this employee."));
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <form onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-label="Enroll employee" className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 sm:px-8 py-5 border-b border-purple-100">
          <div><h2 className="text-lg font-bold text-slate-800">Enroll in a plan</h2><p className="text-sm text-slate-500 mt-0.5">Cover starts from the date you choose.</p></div>
          <button type="button" onClick={() => closeRef.current()} disabled={saving} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>
        <div className="px-6 sm:px-8 py-6 space-y-5 overflow-y-auto">
          <div>
            <label htmlFor="enr-plan" className={labelCls}>Plan <span className="text-rose-500">*</span></label>
            {lockPlan ? <p className="text-sm font-semibold text-slate-800">{plan.name}</p> : (
              <select id="enr-plan" value={form.plan_id} onChange={(e) => set({ plan_id: e.target.value })} className={fieldCls} aria-invalid={!!show("plan_id")}>
                <option value="">Choose a plan</option>
                {plans.filter((p) => p.is_active !== false).map((p) => <option key={p.id} value={p.id}>{p.name} ({benefitTypeLabel(p.benefit_type)})</option>)}
              </select>
            )}
            {show("plan_id") && <p className={errorTextCls}>{show("plan_id")}</p>}
          </div>

          <div>
            <label htmlFor="enr-emp" className={labelCls}>Employee <span className="text-rose-500">*</span></label>
            {lockEmployee ? <p className="text-sm font-semibold text-slate-800">{employee.name}{employee.code ? ` (${employee.code})` : ""}</p> : (
              <PersonSelect id="enr-emp" people={employees} value={form.user_id} onChange={(id) => set({ user_id: id })} placeholder="Choose an employee" invalid={!!show("user_id")} />
            )}
            {show("user_id") && <p className={errorTextCls}>{show("user_id")}</p>}
          </div>

          <div>
            <label htmlFor="enr-from" className={labelCls}>Starts <span className="text-rose-500">*</span></label>
            <input id="enr-from" type="date" value={form.enrolled_from} onChange={(e) => set({ enrolled_from: e.target.value })} className={`${fieldCls} max-w-xs`} aria-invalid={!!show("enrolled_from")} />
            {show("enrolled_from") && <p className={errorTextCls}>{show("enrolled_from")}</p>}
            <p className="text-[11px] text-slate-500 mt-1">{chargeNoticeForStart(form.enrolled_from)}</p>
            {overlapWarn && <p className="text-[11px] text-fuchsia-600 mt-1">{overlapWarn}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="enr-emp-ov" className={labelCls}>Employee pays (override)</label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                <input id="enr-emp-ov" type="number" inputMode="decimal" min="0" step="0.01" value={form.employee_override} onChange={(e) => set({ employee_override: e.target.value })} placeholder={selectedPlan ? `Plan: ${formatMoney(selectedPlan.employee_contribution_amount)}` : "Plan rate"} className={`${fieldCls} pl-7`} aria-invalid={!!show("employee_override")} />
              </div>
              {show("employee_override") && <p className={errorTextCls}>{show("employee_override")}</p>}
            </div>
            <div>
              <label htmlFor="enr-emr-ov" className={labelCls}>Company pays (override)</label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                <input id="enr-emr-ov" type="number" inputMode="decimal" min="0" step="0.01" value={form.employer_override} onChange={(e) => set({ employer_override: e.target.value })} placeholder={selectedPlan ? `Plan: ${formatMoney(selectedPlan.employer_contribution_amount)}` : "Plan rate"} className={`${fieldCls} pl-7`} aria-invalid={!!show("employer_override")} />
              </div>
              {show("employer_override") && <p className={errorTextCls}>{show("employer_override")}</p>}
            </div>
          </div>
          <p className="text-[11px] text-slate-400">Leave an override empty to use the plan rate. 0 means free.</p>

          {serverError && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">{serverError}</p>}
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 sm:px-8 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <button type="button" onClick={() => closeRef.current()} disabled={saving} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">Close</button>
          <button type="submit" disabled={saving} className="sm:min-w-[160px] px-6 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-60 flex justify-center items-center gap-2">{saving ? <Spinner light /> : "Enroll"}</button>
        </div>
      </form>
    </div>
  );
}

// ── End-cover dialog (#146) ──────────────────────────────────────────────────
function EndCoverDialog({ target, onClose, onEnded }) {
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const minDate = target?.enrolled_from ? String(target.enrolled_from).slice(0, 10) : undefined;
  const dateValid = !!endDate && (!minDate || endDate >= minDate);

  const submit = async (reason) => {
    setBusy(true);
    setError("");
    try {
      await payrollAPI.endEmployeeBenefitEnrollment(target.userId, target.id, { enrolled_to: endDate, end_reason: reason });
      onEnded(endDate);
    } catch (err) {
      setError(payrollErrorMessage(err, "Couldn't end this cover."));
      setBusy(false);
    }
  };

  return (
    <ReasonDialog
      title={`End ${target.employeeName || "this employee"}'s cover${target.planName ? ` in ${target.planName}` : ""}?`}
      description={<span>{chargeNoticeForEnd(endDate)} Keep the reason under 500 characters.</span>}
      label="Reason for ending cover"
      confirmLabel="End cover"
      tone="danger"
      minLength={3}
      busy={busy}
      error={error}
      canSubmit={dateValid}
      onSubmit={submit}
      onClose={() => { if (!busy) onClose(); }}
    >
      <div>
        <label htmlFor="end-date" className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Last day of cover <span className="text-rose-500">*</span></label>
        <input id="end-date" type="date" value={endDate} min={minDate} onChange={(e) => setEndDate(e.target.value)} className={`${fieldCls} max-w-xs`} />
        {!dateValid && <p className={errorTextCls}>The end date can&apos;t be before the start date.</p>}
      </div>
    </ReasonDialog>
  );
}

// ── Plan members table (#144) ────────────────────────────────────────────────
function PlanMembersTable({ planId, nameOf, onEndCover }) {
  const [status, setStatus] = useState("active");
  const filterKey = status;
  const fetchPage = useCallback(({ page, limit }) => payrollAPI.getBenefitPlanEnrollments(planId, status ? { status, page, limit } : { page, limit }), [planId, status]);
  const list = usePagedList(fetchPage, { limit: PAGE_SIZE, keys: ["enrollments", "rows", "records"], filterKey });

  return (
    <DetailSection title="Members" icon={HiHeart} action={(
      <select aria-label="Member status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 px-2 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-purple-400">
        {ENROLLMENT_STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    )}>
      {list.loading ? <Skeleton type="table" rows={3} /> : list.error ? (
        <p className="text-sm text-rose-600 py-3">Couldn&apos;t load members. <button type="button" onClick={() => list.reload()} className="underline font-bold">Try again</button></p>
      ) : (
        <>
          <DetailTable
            columns={[
              { header: "Employee", render: (r) => <span className="font-semibold text-slate-800">{nameOf(r.user_id)}</span> },
              { header: "From", render: (r) => (r.enrolled_from ? formatDate(r.enrolled_from) : null) },
              { header: "To", render: (r) => (r.enrolled_to ? formatDate(r.enrolled_to) : "Ongoing") },
              { header: "Rate", render: (r) => { const c = effectiveContribution(r, null); return `${c.employee != null ? formatMoney(c.employee) : "Plan"} / ${c.employer != null ? formatMoney(c.employer) : "Plan"}`; } },
              { header: "Status", render: (r) => { const m = enrollmentStatusMeta(r.status); return <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${m.pill}`}>{m.label}</span>; } },
              { header: "", align: "right", render: (r) => (r.status === "active" ? <button type="button" data-row-action onClick={() => onEndCover({ id: r.id, userId: r.user_id, enrolled_from: r.enrolled_from, employeeName: nameOf(r.user_id), planName: r.plan_name })} className="text-xs font-bold text-rose-600 hover:underline">End cover</button> : null) },
            ]}
            rows={list.items}
            rowKey={(r, i) => r.id ?? i}
            empty="No members in this status."
          />
          {list.totalPages > 1 && (
            <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
              <span>Page {list.page} of {list.totalPages}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => list.setPage((p) => Math.max(1, p - 1))} disabled={list.page === 1} className="p-1 rounded border border-slate-200 disabled:opacity-40" aria-label="Previous"><HiChevronLeft className="w-4 h-4" /></button>
                <button type="button" onClick={() => list.setPage((p) => Math.min(list.totalPages, p + 1))} disabled={list.page >= list.totalPages} className="p-1 rounded border border-slate-200 disabled:opacity-40" aria-label="Next"><HiChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </>
      )}
    </DetailSection>
  );
}

// ── Plans tab ────────────────────────────────────────────────────────────────
function PlansTab({ showToast, directory, nameOf }) {
  const [statusFilter, setStatusFilter] = useState("true");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [components, setComponents] = useState([]);
  const [formTarget, setFormTarget] = useState(undefined);
  const [detail, setDetail] = useState(null);
  const [detailMeta, setDetailMeta] = useState({ activeCount: 0, monthlyCost: null });
  const [detailLoading, setDetailLoading] = useState(false);
  const [enrollFor, setEnrollFor] = useState(null);
  const [endTarget, setEndTarget] = useState(null);
  const [busyKey, setBusyKey] = useState("");
  const [membersKey, setMembersKey] = useState(0);
  const busyRef = useRef(false);
  const reqRef = useRef(0);
  const detailReq = useRef(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    const reqId = ++reqRef.current;
    if (!silent) setLoading(true);
    try {
      const params = {};
      if (statusFilter !== "") params.is_active = statusFilter;
      if (typeFilter) params.benefit_type = typeFilter;
      const res = await payrollAPI.getBenefitPlans(params);
      if (reqId !== reqRef.current) return;
      setRows(listFrom(res, ["plans", "rows", "records"]));
      setLoadError("");
    } catch (err) {
      if (reqId !== reqRef.current) return;
      setLoadError(payrollErrorMessage(err, "Couldn't load plans."));
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [statusFilter, typeFilter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { let c = false; payrollAPI.getComponents().then((res) => { if (!c) setComponents(listFrom(res, ["components", "records"])); }).catch(() => {}); return () => { c = true; }; }, []);

  const allPlans = useRef([]);
  useEffect(() => { let c = false; payrollAPI.getBenefitPlans().then((res) => { if (!c) allPlans.current = listFrom(res, ["plans", "rows", "records"]); }).catch(() => {}); return () => { c = true; }; }, [membersKey]);

  const reloadDetail = async (id) => {
    const reqId = ++detailReq.current;
    setDetailLoading(true);
    try {
      const res = await payrollAPI.getBenefitPlan(id);
      const norm = normalizePlanDetail(res?.data ?? res);
      if (reqId !== detailReq.current) return;
      setDetail((d) => (d && d.id === id ? { ...d, ...norm.plan } : d));
      setDetailMeta({ activeCount: norm.activeCount, monthlyCost: norm.monthlyCost });
    } catch {
      /* keep list row */
    } finally {
      if (reqId === detailReq.current) setDetailLoading(false);
    }
  };
  const openDetail = (plan) => { setDetail(plan); setDetailMeta({ activeCount: 0, monthlyCost: null }); reloadDetail(plan.id); };
  const closeDetail = () => { detailReq.current += 1; setDetail(null); setDetailLoading(false); };

  const guarded = async (key, run, failMessage) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusyKey(key);
    try { const message = await run(); if (message) { showToast(message); closeDetail(); load({ silent: true }); } }
    catch (err) { showToast(payrollErrorMessage(err, failMessage), "error"); }
    finally { busyRef.current = false; setBusyKey(""); }
  };

  const deactivate = (plan) => guarded(`off:${plan.id}`, async () => {
    if (detailMeta.activeCount > 0) { showToast("End every member's cover first.", "error"); return null; }
    if (!(await window.confirm(`Switch off ${plan.name}? No new enrollments can be added.`))) return null;
    await payrollAPI.deactivateBenefitPlan(plan.id);
    return "Plan switched off.";
  }, "Couldn't switch this plan off.");
  const reactivate = (plan) => guarded(`on:${plan.id}`, async () => {
    if (!(await window.confirm(`Turn ${plan.name} back on?`))) return null;
    await payrollAPI.updateBenefitPlan(plan.id, { is_active: true });
    return "Plan switched on.";
  }, "Couldn't switch this plan on.");

  const query = search.trim().toLowerCase();
  const visible = query ? rows.filter((p) => [p.name, p.code, p.provider_name].some((v) => (v || "").toLowerCase().includes(query))) : rows;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative"><HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter this page by name, code or provider" aria-label="Filter plans" className="h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none w-64" />
          </div>
          <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
            <option value="true">Active</option><option value="false">Inactive</option><option value="">All</option>
          </select>
          <select aria-label="Type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls}>
            <option value="">All types</option>
            {BENEFIT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{benefitTypeLabel(t)}</option>)}
          </select>
          <button type="button" onClick={() => load()} aria-label="Refresh" title="Refresh" className="h-10 px-3 text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition"><HiRefresh className="w-4 h-4" /></button>
        </div>
        <button type="button" onClick={() => setFormTarget(null)} className="h-10 px-4 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200"><HiPlus className="w-5 h-5" /> New plan</button>
      </div>

      {loading ? <Skeleton type="table" rows={5} /> : loadError ? (
        <div className="py-12 px-6 text-center bg-white rounded-2xl border border-rose-200">
          <HiExclamationCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-rose-700">{loadError}</p>
          <button type="button" onClick={() => load()} className="mt-4 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">Try again</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[980px]">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <th className="px-5 py-4 border-b border-slate-100">Plan</th>
                  <th className="px-5 py-4 border-b border-slate-100">Type</th>
                  <th className="px-5 py-4 border-b border-slate-100">Provider</th>
                  <th className="px-5 py-4 border-b border-slate-100 text-right">Employee / mo</th>
                  <th className="px-5 py-4 border-b border-slate-100 text-right">Company / mo</th>
                  <th className="px-5 py-4 border-b border-slate-100">Valid</th>
                  <th className="px-5 py-4 border-b border-slate-100">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {visible.map((plan) => {
                  const openLabel = `View plan ${plan.name}`;
                  return (
                    <tr key={plan.id} {...rowPreviewProps(() => openDetail(plan), openLabel)}>
                      <td className="px-5 py-4"><p className="font-bold text-slate-800">{plan.name}</p><p className="text-xs text-slate-400 font-mono">{plan.code}</p></td>
                      <td className="px-5 py-4 text-slate-600">{benefitTypeLabel(plan.benefit_type)}</td>
                      <td className="px-5 py-4 text-slate-600">{plan.provider_name || "N/A"}</td>
                      <td className="px-5 py-4 text-right tabular-nums text-slate-700">{formatMoney(plan.employee_contribution_amount)}</td>
                      <td className="px-5 py-4 text-right tabular-nums text-slate-700">{formatMoney(plan.employer_contribution_amount)}</td>
                      <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{plan.effective_from ? formatDate(plan.effective_from) : "N/A"}{plan.effective_to ? ` – ${formatDate(plan.effective_to)}` : " – no end date"}</td>
                      <td className="px-5 py-4">{plan.is_active !== false ? <span className="text-violet-600 font-bold text-xs">Active</span> : <span className="text-slate-400 font-bold text-xs">Inactive</span>}</td>
                    </tr>
                  );
                })}
                {visible.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">{rows.length === 0 ? "No plans yet. Add one, then enroll employees." : "No plans on this page match your search."}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formTarget !== undefined && (
        <PlanFormDialog plan={formTarget} components={components} activeCount={detailMeta.activeCount}
          onClose={() => setFormTarget(undefined)}
          onSaved={(saved, wasEdit) => { setFormTarget(undefined); showToast(wasEdit ? "Plan updated." : "Plan added."); if (wasEdit && detail) reloadDetail(detail.id); load({ silent: true }); }} />
      )}

      {enrollFor && (
        <EnrollDialog plans={allPlans.current} plan={enrollFor} employees={directory.activeOptions}
          onClose={() => setEnrollFor(null)}
          onEnrolled={(saved, from) => { setEnrollFor(null); showToast(`Enrolled. ${chargeNoticeForStart(from)}`); setMembersKey((k) => k + 1); if (detail) reloadDetail(detail.id); }} />
      )}

      {endTarget && (
        <EndCoverDialog target={endTarget} onClose={() => setEndTarget(null)}
          onEnded={(date) => { setEndTarget(null); showToast(`Cover ends ${formatDate(date)}. ${chargeNoticeForEnd(date)}`); setMembersKey((k) => k + 1); if (detail) reloadDetail(detail.id); }} />
      )}

      {detail && (() => {
        const active = detail.is_active !== false;
        const busy = !!busyKey || detailLoading;
        return (
          <DetailDialog
            eyebrow="Benefit plan"
            icon={HiHeart}
            title={detail.name}
            subtitle={[detail.code, benefitTypeLabel(detail.benefit_type)].filter(Boolean).join(" · ")}
            badge={<DetailPill tone="onDark">{active ? "Active" : "Inactive"}</DetailPill>}
            loading={detailLoading}
            onClose={closeDetail}
            footer={(
              <>
                {active
                  ? <button type="button" onClick={() => deactivate(detail)} disabled={busy || detailMeta.activeCount > 0} title={detailMeta.activeCount > 0 ? "End every member's cover first." : ""} className="sm:mr-auto px-4 py-2.5 text-sm font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-xl transition flex items-center gap-2 disabled:opacity-40">{busyKey === `off:${detail.id}` ? <Spinner /> : <HiBan className="w-4 h-4" />} Deactivate</button>
                  : <button type="button" onClick={() => reactivate(detail)} disabled={busy} className="sm:mr-auto px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50">{busyKey === `on:${detail.id}` ? <Spinner /> : <HiRefresh className="w-4 h-4" />} Reactivate</button>}
                {active && <button type="button" onClick={() => setEnrollFor(detail)} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50"><HiUserAdd className="w-4 h-4" /> Enroll employee</button>}
                <button type="button" onClick={() => setFormTarget(detail)} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50"><HiPencil className="w-4 h-4" /> Edit</button>
              </>
            )}
          >
            <DetailStats items={[
              { label: "Active members", value: String(detailMeta.activeCount), icon: HiHeart },
              { label: "Monthly cost (company + employees)", value: detailMeta.monthlyCost != null ? formatMoney(detailMeta.monthlyCost) : "N/A" },
            ]} />
            <DetailSection title="Terms">
              <DetailGrid items={[
                ["Employee pays / month", formatMoney(detail.employee_contribution_amount)],
                ["Company pays / month", formatMoney(detail.employer_contribution_amount)],
                ["Sum insured", detail.coverage_amount != null ? formatMoney(detail.coverage_amount) : "N/A"],
                ["Provider", detail.provider_name],
                ["Starts", detail.effective_from ? formatDate(detail.effective_from) : "N/A"],
                ["Ends", detail.effective_to ? formatDate(detail.effective_to) : "No end date"],
              ]} />
              {detail.description && <p className="text-sm text-slate-600 mt-3 whitespace-pre-wrap">{detail.description}</p>}
              <p className="text-[11px] text-slate-500 mt-3">{NO_TAX_EFFECT_NOTE}</p>
            </DetailSection>
            <PlanMembersTable key={membersKey} planId={detail.id} nameOf={nameOf} onEndCover={setEndTarget} />
          </DetailDialog>
        );
      })()}
    </>
  );
}

// ── By-employee tab ──────────────────────────────────────────────────────────
function EmployeesTab({ showToast, directory }) {
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("active");
  const [plans, setPlans] = useState([]);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [endTarget, setEndTarget] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => { let c = false; payrollAPI.getBenefitPlans({ is_active: "true" }).then((res) => { if (!c) setPlans(listFrom(res, ["plans", "rows", "records"])); }).catch(() => {}); return () => { c = true; }; }, []);

  const filterKey = `${userId}|${status}|${refreshKey}`;
  const fetchPage = useCallback(({ page, limit }) => payrollAPI.getEmployeeBenefitEnrollments(userId, status ? { status, page, limit } : { page, limit }), [userId, status]);
  const list = usePagedList(fetchPage, { limit: PAGE_SIZE, keys: ["enrollments", "rows", "records"], filterKey, enabled: !!userId });
  const selected = directory.byId.get(userId);

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Employee</label>
          <PersonSelect className="w-72" people={directory.options} value={userId} onChange={(id) => setUserId(id)} placeholder="Choose an employee" aria-label="Employee" />
        </div>
        {userId && (
          <>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Status</label>
              <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
                {ENROLLMENT_STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => setEnrollOpen(true)} className="h-10 px-4 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200"><HiUserAdd className="w-4 h-4" /> Enroll in a plan</button>
          </>
        )}
      </div>

      {!userId ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-sm">
          <HiInformationCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Choose an employee to see their benefit enrollments.</p>
        </div>
      ) : list.loading ? <Skeleton type="table" rows={4} /> : list.error ? (
        <div className="py-12 px-6 text-center bg-white rounded-2xl border border-rose-200">
          <HiExclamationCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-rose-700">{payrollErrorMessage(list.error, "Couldn't load enrollments.")}</p>
          <button type="button" onClick={() => list.reload()} className="mt-4 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">Try again</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <th className="px-5 py-4 border-b border-slate-100">Plan</th>
                  <th className="px-5 py-4 border-b border-slate-100">From</th>
                  <th className="px-5 py-4 border-b border-slate-100">To</th>
                  <th className="px-5 py-4 border-b border-slate-100">Rate</th>
                  <th className="px-5 py-4 border-b border-slate-100">Status</th>
                  <th className="px-5 py-4 border-b border-slate-100 w-px"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {list.items.map((r) => {
                  const c = effectiveContribution(r, null);
                  const m = enrollmentStatusMeta(r.status);
                  return (
                    <tr key={r.id}>
                      <td className="px-5 py-4"><p className="font-bold text-slate-800">{r.plan_name || "N/A"}</p><p className="text-[11px] text-slate-400 font-mono">{r.plan_code || ""}</p></td>
                      <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{r.enrolled_from ? formatDate(r.enrolled_from) : "N/A"}</td>
                      <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{r.enrolled_to ? formatDate(r.enrolled_to) : "Ongoing"}</td>
                      <td className="px-5 py-4 text-slate-600">{c.employee != null ? formatMoney(c.employee) : "Plan"} / {c.employer != null ? formatMoney(c.employer) : "Plan"}</td>
                      <td className="px-5 py-4"><span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase ${m.pill}`}>{m.label}</span></td>
                      <td className="px-5 py-4 text-right">{r.status === "active" && <button type="button" onClick={() => setEndTarget({ id: r.id, userId, enrolled_from: r.enrolled_from, employeeName: selected?.name, planName: r.plan_name })} className="text-xs font-bold text-rose-600 hover:underline">End cover</button>}</td>
                    </tr>
                  );
                })}
                {list.items.length === 0 && <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">No enrollments in this status.</td></tr>}
              </tbody>
            </table>
          </div>
          {list.totalPages > 1 && (
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Page {list.page} of {list.totalPages} · {plural(list.total, "enrollment")}</p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => list.setPage((p) => Math.max(1, p - 1))} disabled={list.page === 1} aria-label="Previous page" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronLeft className="w-4 h-4" /></button>
                <button type="button" onClick={() => list.setPage((p) => Math.min(list.totalPages, p + 1))} disabled={list.page >= list.totalPages} aria-label="Next page" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {enrollOpen && selected && (
        <EnrollDialog plans={plans} employee={selected} employees={directory.activeOptions}
          onClose={() => setEnrollOpen(false)}
          onEnrolled={(saved, from) => { setEnrollOpen(false); showToast(`Enrolled. ${chargeNoticeForStart(from)}`); setRefreshKey((k) => k + 1); }} />
      )}
      {endTarget && (
        <EndCoverDialog target={endTarget} onClose={() => setEndTarget(null)}
          onEnded={(date) => { setEndTarget(null); showToast(`Cover ends ${formatDate(date)}. ${chargeNoticeForEnd(date)}`); setRefreshKey((k) => k + 1); }} />
      )}
    </>
  );
}

const TABS = [["plans", "Plans"], ["employees", "By employee"]];

export default function PayrollBenefitsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast, showToast, hideToast } = useToast();
  const people = useEmployeeDirectory();
  const directory = people.directory;
  const nameOf = useCallback((id) => people.nameOf(id), [people]);
  const [deductionsOn, setDeductionsOn] = useState(null);

  useEffect(() => { let c = false; payrollAPI.getSettings().then((res) => { if (!c) setDeductionsOn(!!(res?.data ?? res)?.benefit_deductions_enabled); }).catch(() => {}); return () => { c = true; }; }, []);

  const rawTab = searchParams.get("tab");
  const tab = TABS.some(([v]) => v === rawTab) ? rawTab : "plans";
  useEffect(() => { if (rawTab && !TABS.some(([v]) => v === rawTab)) setSearchParams((p) => { const n = new URLSearchParams(p); n.set("tab", "plans"); return n; }, { replace: true }); }, [rawTab, setSearchParams]);
  const setTab = (value) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("tab", value); return n; }, { replace: true });

  return (
    <>
      <DashboardTopBar title="Benefit Plans" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Benefit Plans</h1>
          <p className="text-sm text-slate-500 mt-1">Define benefit plans, enroll employees and see what each plan costs.</p>
        </div>

        {deductionsOn === false && (
          <div className="mb-5 flex items-start gap-2 text-sm text-fuchsia-800 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-4 py-3">
            <HiExclamationCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>Benefit deductions are switched off, so nothing is charged yet. Turn them on in Payroll Settings.</span>
          </div>
        )}

        <div className="flex items-center gap-1 border-b border-slate-200 mb-6">
          {TABS.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTab(value)} className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${tab === value ? "border-purple-600 text-purple-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{label}</button>
          ))}
        </div>

        {tab === "employees" ? <EmployeesTab showToast={showToast} directory={directory} /> : <PlansTab showToast={showToast} directory={directory} nameOf={nameOf} />}
      </main>

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}
