import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, organizationAPI } from "../../../../shared/api";
import {
  HiX, HiPlus, HiGift, HiCheck, HiCalculator, HiSparkles, HiTrash, HiPencil, HiUserGroup,
  HiDocumentText, HiSearch, HiChevronLeft, HiChevronRight, HiRefresh, HiExclamationCircle, HiExternalLink,
  HiInformationCircle, HiBan,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import ReasonDialog from "../../../../shared/components/ReasonDialog";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { payrollErrorMessage, formErrorsFrom, clearFieldErrors } from "../../../../shared/utils/payrollErrors";
import useEmployeeDirectory from "../useEmployeeDirectory";
import { formatMoney, formatPeriod, formatDate } from "../../../../shared/utils/formatUtils";
import { normalizePaginated, listFrom, personName } from "../../../../shared/attendance/normalize";
import PayrollToast from "../PayrollToast";
import useToast from "../useToast";
import PeriodPicker from "../PeriodPicker";
import { toCount, plural, prettifyCode } from "../runMeta";
import {
  currentPeriod, isPeriod, periodOptions, parseAmount, approvalStatusMeta, isPendingStatus,
  APPROVAL_STATUS_FILTERS, BONUS_TYPE_LABEL, BONUS_TYPE_OPTIONS, ELIGIBILITY_LABEL, ELIGIBILITY_OPTIONS,
  EMPLOYMENT_TYPE_LABEL, MAX_PERCENT, CONFIRM_PERCENT_ABOVE, skipReasonText, normalizeImpact, usesUserIds, isUnavailableSource,
  embeddedEmployee, actorName,
} from "../variablePayMeta";

const PAGE_SIZE = 20;
const fieldCls = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none";
const labelCls = "block text-[11px] font-bold text-slate-500 uppercase mb-2";
const errorTextCls = "text-xs font-semibold text-rose-600 mt-1.5";
const listOf = (v) => (Array.isArray(v) ? v : []);

const ruleValueText = (r) => (r?.bonus_type === "flat" ? formatMoney(r.value) : `${Number(r?.value || 0)}%`);
const hasCap = (r) => r?.max_amount_per_employee !== null && r?.max_amount_per_employee !== undefined && r?.max_amount_per_employee !== "";
const canCancelRule = (r) => (isPendingStatus(r?.status) || r?.status === "approved") && !r?.applied_at;
// Preview is refused for rejected/cancelled rules; an applied rule has nothing left to preview.
const canPreviewRule = canCancelRule;
const isReadyToApply = (r) => r?.status === "approved" && !r?.applied_at;
const employmentTypesText = (types) => listOf(types).map((t) => EMPLOYMENT_TYPE_LABEL[t] || prettifyCode(t)).join(", ");

/** Why a rule has no actions left, for the detail footer. */
function ruleLockedReason(rule) {
  if (rule?.applied_at) return "Already applied. The bonuses it created are listed under Salary Adjustments.";
  if (rule?.status === "rejected") return "Rejected. Create a new rule to pay this bonus.";
  if (rule?.status === "cancelled") return "Cancelled. Create a new rule to pay this bonus.";
  return "There's nothing to do on this rule.";
}

function eligibilitySummary(rule) {
  const cfg = rule?.eligibility_config || {};
  const src = rule?.eligibility_source;
  let text = ELIGIBILITY_LABEL[src] || prettifyCode(src) || "N/A";
  if (src === "department") text = plural(listOf(cfg.department_ids).length, "department");
  if (usesUserIds(src)) text = plural(listOf(cfg.user_ids).length, "employee");
  if (listOf(cfg.employment_types).length > 0) text += ` · ${employmentTypesText(cfg.employment_types)}`;
  if (toCount(cfg.min_tenure_months) > 0) text += ` · ${cfg.min_tenure_months}+ months`;
  return text;
}

function Spinner({ light = false }) {
  return <span className={`inline-block w-4 h-4 border-2 rounded-full animate-spin ${light ? "border-white/30 border-t-white" : "border-purple-200 border-t-purple-600"}`} />;
}

// ── Searchable multi-select list ────────────────────────────────────────────
function ChecklistPicker({ items, selected, onChange, emptyText, searchPlaceholder }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((it) => [it.label, it.sub].some((v) => (v || "").toLowerCase().includes(q))) : items;
  const selectedSet = new Set(selected);
  const knownIds = new Set(items.map((it) => it.id));
  const unknown = selected.filter((id) => !knownIds.has(id));

  const toggle = (id) => onChange(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="border border-slate-200 rounded-xl bg-slate-50/50">
      <div className="flex flex-wrap items-center gap-2 p-2.5 border-b border-slate-200">
        <div className="relative flex-1 min-w-[180px]">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-purple-400 outline-none" />
        </div>
        <span className="text-xs font-bold text-purple-700">{selected.length} chosen</span>
        <button type="button" onClick={() => onChange([...new Set([...selected, ...shown.map((s) => s.id)])])} disabled={shown.length === 0} className="text-xs font-bold text-purple-600 hover:underline disabled:opacity-40">Choose all shown</button>
        <button type="button" onClick={() => onChange([])} disabled={selected.length === 0} className="text-xs font-bold text-slate-500 hover:underline disabled:opacity-40">Clear</button>
      </div>
      <div className="max-h-56 overflow-y-auto p-2.5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1">
        {shown.map((it) => (
          <label key={it.id} className={`flex items-center gap-2 text-sm cursor-pointer rounded-lg px-2 py-1.5 ${selectedSet.has(it.id) ? "bg-purple-50" : "hover:bg-white"}`}>
            <input type="checkbox" checked={selectedSet.has(it.id)} onChange={() => toggle(it.id)} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
            <span className="min-w-0">
              <span className="block text-slate-700 truncate">{it.label}</span>
              {it.sub && <span className="block text-[11px] text-slate-400 truncate">{it.sub}</span>}
            </span>
          </label>
        ))}
        {shown.length === 0 && <p className="text-xs text-slate-400 px-2 py-2">{items.length === 0 ? emptyText : "Nothing matches your search."}</p>}
      </div>
      {unknown.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 text-xs text-fuchsia-800 bg-fuchsia-50 rounded-b-xl">
          <span>{plural(unknown.length, "earlier choice")} {unknown.length === 1 ? "is" : "are"} no longer in the list (removed or inactive).</span>
          <button type="button" onClick={() => onChange(selected.filter((id) => knownIds.has(id)))} className="font-bold underline">Remove</button>
        </div>
      )}
    </div>
  );
}

// ── Create / edit (#66, #69) ────────────────────────────────────────────────
const emptyRule = () => ({
  name: "", period_month: currentPeriod(), bonus_type: "percent_of_basic", value: "",
  eligibility_source: "all_employees", department_ids: [], user_ids: [], employment_types: [], min_tenure_months: "",
  max_amount_per_employee: "", reason: "", component_id: null, extraConfig: {},
});

function ruleToForm(rule) {
  const { department_ids, user_ids, employment_types, min_tenure_months, ...extraConfig } = rule.eligibility_config || {};
  return {
    name: rule.name || "",
    period_month: isPeriod(rule.period_month) ? rule.period_month : currentPeriod(),
    bonus_type: rule.bonus_type || "percent_of_basic",
    value: rule.value !== null && rule.value !== undefined && rule.value !== "" ? String(Number(rule.value)) : "",
    eligibility_source: rule.eligibility_source || "all_employees",
    department_ids: listOf(department_ids),
    user_ids: listOf(user_ids),
    employment_types: listOf(employment_types),
    min_tenure_months: min_tenure_months !== null && min_tenure_months !== undefined ? String(min_tenure_months) : "",
    max_amount_per_employee: hasCap(rule) ? String(Number(rule.max_amount_per_employee)) : "",
    reason: rule.reason || "",
    // PUT replaces the whole rule — anything not sent is blanked — so fields
    // this form doesn't show are carried through.
    component_id: rule.component_id || null,
    extraConfig,
  };
}

function validateRule(f) {
  const e = {};
  const name = f.name.trim();
  if (name.length < 3) e.name = "Give the rule a name (at least 3 characters).";
  else if (name.length > 150) e.name = "Keep the name under 150 characters.";
  if (!isPeriod(f.period_month)) e.period_month = "Choose a month.";
  const text = String(f.value).trim();
  if (f.bonus_type === "flat") {
    if (Number.isNaN(parseAmount(text))) e.value = "Enter an amount above 0, with up to 2 decimals.";
  } else if (!/^\d+(\.\d{1,4})?$/.test(text) || !(Number(text) > 0)) {
    e.value = "Enter a percentage above 0.";
  } else if (Number(text) > MAX_PERCENT) {
    e.value = `A percentage can't be more than ${MAX_PERCENT}%.`;
  }
  if (f.min_tenure_months !== "" && (!/^\d+$/.test(String(f.min_tenure_months)) || Number(f.min_tenure_months) > 600)) {
    e.min_tenure_months = "Use whole months between 0 and 600.";
  }
  if (f.max_amount_per_employee !== "" && Number.isNaN(parseAmount(f.max_amount_per_employee))) {
    e.max_amount_per_employee = "Enter an amount above 0, or leave it empty for no cap.";
  }
  if (!BONUS_TYPE_OPTIONS.includes(f.bonus_type)) e.value = "Choose how the bonus is worked out.";
  if (isUnavailableSource(f.eligibility_source)) e.eligibility = "Choosing by performance rating isn't available yet. Choose another option.";
  if (f.eligibility_source === "department" && f.department_ids.length === 0) e.eligibility = "Choose at least one department.";
  if (usesUserIds(f.eligibility_source) && f.user_ids.length === 0) e.eligibility = "Choose at least one employee.";
  if (f.reason.trim().length < 3) e.reason = "Write a short reason (at least 3 characters).";
  return e;
}

/**
 * Create and PUT share one schema, and PUT replaces the whole rule: a key left
 * out is blanked. So the payload always carries every field, and an emptied
 * cap is sent as an explicit null when editing.
 */
function buildRulePayload(f, editing) {
  const eligibility_config = { ...f.extraConfig };
  if (f.eligibility_source === "department") eligibility_config.department_ids = f.department_ids;
  if (usesUserIds(f.eligibility_source)) eligibility_config.user_ids = f.user_ids;
  if (f.employment_types.length > 0) eligibility_config.employment_types = f.employment_types;
  if (f.min_tenure_months !== "") eligibility_config.min_tenure_months = Number(f.min_tenure_months);
  const payload = {
    name: f.name.trim(),
    period_month: f.period_month,
    bonus_type: f.bonus_type,
    value: Number(String(f.value).trim()),
    eligibility_source: f.eligibility_source,
    eligibility_config,
    reason: f.reason.trim(),
  };
  if (f.max_amount_per_employee !== "") payload.max_amount_per_employee = parseAmount(f.max_amount_per_employee);
  else if (editing) payload.max_amount_per_employee = null;
  if (f.component_id) payload.component_id = f.component_id;
  return payload;
}

// Form-state key → error key, for clearing server field errors on edit.
const RULE_ERROR_KEY = {
  name: "name", reason: "reason", value: "value", bonus_type: "value",
  max_amount_per_employee: "max_amount_per_employee", min_tenure_months: "min_tenure_months",
  eligibility_source: "eligibility", department_ids: "eligibility", user_ids: "eligibility", employment_types: "eligibility",
};

// Server path (gap G-1, dot-joined) → error key; "" puts it in the banner.
function ruleErrorKey(path) {
  if (path === "eligibility_config.min_tenure_months") return "min_tenure_months";
  if (path === "eligibility_config" || path.startsWith("eligibility_config.")) return "eligibility";
  return RULE_ERROR_KEY[path] || "";
}

function BonusRuleFormDialog({ rule, employees, departments, onClose, onSaved }) {
  const editing = !!rule;
  const [form, setForm] = useState(() => (rule ? ruleToForm(rule) : emptyRule()));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [serverFields, setServerFields] = useState({});
  const savingRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = saving ? () => {} : onClose;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const errors = validateRule(form);
  const show = (key) => (touched && errors[key]) || serverFields[key] || "";
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setServerError("");
    setServerFields((s) => clearFieldErrors(s, patch, RULE_ERROR_KEY));
  };
  const isPercent = form.bonus_type !== "flat";
  const typeOptions = BONUS_TYPE_OPTIONS.includes(form.bonus_type) ? BONUS_TYPE_OPTIONS : [...BONUS_TYPE_OPTIONS, form.bonus_type];
  const sourceOptions = ELIGIBILITY_OPTIONS.includes(form.eligibility_source) ? ELIGIBILITY_OPTIONS : [...ELIGIBILITY_OPTIONS, form.eligibility_source];
  const toggleEmploymentType = (type) => set({
    employment_types: form.employment_types.includes(type) ? form.employment_types.filter((t) => t !== type) : [...form.employment_types, type],
  });

  // Offer active people and departments, plus anything this rule already picked.
  const employeeItems = useMemo(
    () => employees
      .filter((e) => e.active || form.user_ids.includes(e.id))
      .map((e) => ({ id: e.id, label: e.active ? e.name : `${e.name} (inactive)`, sub: [e.code, e.department].filter(Boolean).join(" · ") })),
    [employees, form.user_ids],
  );
  const departmentItems = useMemo(
    () => departments
      .filter((d) => d.active !== false || form.department_ids.includes(d.id))
      .map((d) => ({ id: d.id, label: d.active === false ? `${d.name} (inactive)` : d.name })),
    [departments, form.department_ids],
  );

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length > 0 || savingRef.current) return;
    savingRef.current = true;
    let saved = false;
    try {
      // Up to 100% is allowed (gap G-5), but anything above 50% is unusual: make it deliberate.
      const percent = Number(String(form.value).trim());
      if (isPercent && percent > CONFIRM_PERCENT_ABOVE) {
        const basis = form.bonus_type === "percent_of_gross" ? "monthly gross pay" : "monthly basic pay";
        if (!(await window.confirm(`Pay ${percent}% of each person's ${basis} as a bonus? That's higher than usual, so check it isn't a typo.`))) return;
      }
      setSaving(true);
      setServerError("");
      setServerFields({});
      const payload = buildRulePayload(form, editing);
      const res = editing ? await payrollAPI.updateBonusRule(rule.id, payload) : await payrollAPI.createBonusRule(payload);
      saved = true;
      onSaved(res?.data ?? res, editing);
    } catch (err) {
      const { fields, banner } = formErrorsFrom(err, ruleErrorKey, "Couldn't save this bonus rule.");
      setServerFields(fields);
      setServerError(banner);
    } finally {
      if (!saved) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-purple-950/40 backdrop-blur-sm p-4 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <form onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-label={editing ? "Edit bonus rule" : "New bonus rule"} className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 sm:px-8 py-5 border-b border-purple-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{editing ? "Edit bonus rule" : "New bonus rule"}</h2>
            <p className="text-sm text-slate-500 mt-0.5">A rule pays a bonus to everyone who qualifies. Nothing is paid until it is approved and applied.</p>
          </div>
          <button type="button" onClick={() => closeRef.current()} disabled={saving} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 sm:px-8 py-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
            <div>
              <label htmlFor="rule-name" className={labelCls}>Rule name <span className="text-rose-500">*</span></label>
              <input id="rule-name" type="text" maxLength={150} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Diwali bonus 2026" className={fieldCls} aria-invalid={!!show("name")} />
              {show("name") && <p className={errorTextCls}>{show("name")}</p>}
            </div>
            <div>
              <label htmlFor="rule-period-month" className={labelCls}>Paid in <span className="text-rose-500">*</span></label>
              <PeriodPicker value={form.period_month} onChange={(v) => set({ period_month: v })} idPrefix="rule-period" selectClassName={fieldCls} yearsBack={1} yearsAhead={2} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <div>
              <label htmlFor="rule-type" className={labelCls}>How it’s worked out</label>
              <select id="rule-type" value={form.bonus_type} onChange={(e) => set({ bonus_type: e.target.value })} className={fieldCls}>
                {typeOptions.map((t) => <option key={t} value={t}>{BONUS_TYPE_LABEL[t] || prettifyCode(t)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rule-value" className={labelCls}>{isPercent ? "Percentage" : "Amount per employee"} <span className="text-rose-500">*</span></label>
              <div className="relative">
                {!isPercent && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>}
                <input id="rule-value" type="number" inputMode="decimal" min="0" step={isPercent ? "0.01" : "0.01"} value={form.value} onChange={(e) => set({ value: e.target.value })} className={`${fieldCls} ${isPercent ? "pr-10" : "pl-8"}`} aria-invalid={!!show("value")} />
                {isPercent && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>}
              </div>
              {show("value") && <p className={errorTextCls}>{show("value")}</p>}
            </div>
            <div>
              <label htmlFor="rule-cap" className={labelCls}>Most one person can get</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                <input id="rule-cap" type="number" inputMode="decimal" min="0" step="0.01" value={form.max_amount_per_employee} onChange={(e) => set({ max_amount_per_employee: e.target.value })} placeholder="No cap" className={`${fieldCls} pl-8`} aria-invalid={!!show("max_amount_per_employee")} />
              </div>
              {show("max_amount_per_employee") && <p className={errorTextCls}>{show("max_amount_per_employee")}</p>}
            </div>
            <div>
              <label htmlFor="rule-tenure" className={labelCls}>Minimum time with us</label>
              <div className="relative">
                <input id="rule-tenure" type="number" inputMode="numeric" min="0" max="600" step="1" value={form.min_tenure_months} onChange={(e) => set({ min_tenure_months: e.target.value })} placeholder="Anyone" className={`${fieldCls} pr-20`} aria-invalid={!!show("min_tenure_months")} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">months</span>
              </div>
              {show("min_tenure_months") && <p className={errorTextCls}>{show("min_tenure_months")}</p>}
            </div>
          </div>
          {isPercent && (
            <p className="flex items-start gap-2 text-xs text-slate-500 -mt-2">
              <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500" />
              The percentage uses each person’s approved salary structure for that month, not pay reduced by unpaid leave.
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
            <div className="space-y-4">
              <div>
                <label htmlFor="rule-source" className={labelCls}>Who qualifies</label>
                <select id="rule-source" value={form.eligibility_source} onChange={(e) => set({ eligibility_source: e.target.value })} className={fieldCls}>
                  {sourceOptions.map((s) => <option key={s} value={s} disabled={isUnavailableSource(s)}>{ELIGIBILITY_LABEL[s] || prettifyCode(s)}{isUnavailableSource(s) ? " (not available yet)" : ""}</option>)}
                </select>
              </div>
              <fieldset>
                <legend className={labelCls}>Employment types</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={form.employment_types.includes(value)} onChange={() => toggleEmploymentType(value)} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">{form.employment_types.length ? "Only the ticked types qualify." : "Nothing ticked: every type qualifies."}</p>
              </fieldset>
            </div>
            <div>
              {form.eligibility_source === "all_employees" && (
                <p className="h-full flex items-center text-sm text-slate-600 bg-purple-50/50 border border-purple-100 rounded-xl px-4 py-3">Everyone with an approved salary structure for the month who meets the employment type and minimum time conditions.</p>
              )}
              {form.eligibility_source === "department" && (
                <ChecklistPicker items={departmentItems} selected={form.department_ids} onChange={(ids) => set({ department_ids: ids })} emptyText="No departments found." searchPlaceholder="Search departments" />
              )}
              {usesUserIds(form.eligibility_source) && (
                <ChecklistPicker items={employeeItems} selected={form.user_ids} onChange={(ids) => set({ user_ids: ids })} emptyText="No employees found." searchPlaceholder="Search name, code or department" />
              )}
              {show("eligibility") && <p className={errorTextCls}>{show("eligibility")}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="rule-reason" className={labelCls}>Reason <span className="text-rose-500">*</span></label>
            <textarea id="rule-reason" rows={2} maxLength={1000} value={form.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Why this bonus is being paid" className={`${fieldCls} resize-none`} aria-invalid={!!show("reason")} />
            {show("reason") && <p className={errorTextCls}>{show("reason")}</p>}
          </div>

          {serverError && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">{serverError}</p>}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 sm:px-8 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <button type="button" onClick={() => closeRef.current()} disabled={saving} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">Close</button>
          <button type="submit" disabled={saving} className="sm:min-w-[200px] px-6 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-60 flex justify-center items-center gap-2">
            {saving ? <Spinner light /> : editing ? "Save changes" : "Create rule"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PayrollBonusRulesPage() {
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();

  const [filters, setFilters] = useState({ status: "", period_month: "", bonus_type: "" });
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const reqRef = useRef(0);

  // Every employee, leavers included, so old rules and previews still show names.
  const people = useEmployeeDirectory();
  const [departments, setDepartments] = useState([]);

  const [form, setForm] = useState(null); // { rule | null }
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [impact, setImpact] = useState(null); // { rule, loading, data, error }
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const busyRef = useRef(false);
  const detailReq = useRef(0);
  const detailIdRef = useRef(null);
  detailIdRef.current = detail?.id ?? null;

  const directory = people.directory;
  const months = useMemo(() => periodOptions({ back: 18, ahead: 12 }), []);
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  // null when unresolved, so each caller picks its own fallback.
  const userName = (id) => (id ? directory.byId.get(id)?.name || null : null);

  const loadList = useCallback(async ({ silent = false } = {}) => {
    const reqId = ++reqRef.current;
    if (!silent) setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      const res = await payrollAPI.getBonusRules(params);
      if (reqId !== reqRef.current) return;
      const norm = normalizePaginated(res, ["bonus_rules", "rules", "records", "items"], params);
      setList({ items: norm.items, total: norm.total, totalPages: norm.totalPages });
      setLoadError("");
    } catch (err) {
      if (reqId !== reqRef.current) return;
      setLoadError(payrollErrorMessage(err, "Couldn't load bonus rules."));
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    let cancelled = false;
    // Employees come from useEmployeeDirectory. Departments are unpaginated and
    // include inactive ones (kept so old rules still show their names).
    organizationAPI.getDepartments()
      .then((res) => {
        if (cancelled) return;
        setDepartments(
          listFrom(res, ["departments", "records"])
            .map((d) => ({ id: d.id ?? d._id, name: d.name || "Unnamed department", active: d.is_active !== false }))
            .filter((d) => d.id)
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const hasFilters = Object.values(filters).some(Boolean);

  const closeDetail = () => {
    detailReq.current += 1;
    setDetail(null);
    setDetailLoading(false);
  };
  const closeAll = () => { closeDetail(); setImpact(null); };

  const guarded = async (key, run, failMessage) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const message = await run(() => setBusyKey(key));
      if (message) {
        showToast(message);
        closeAll();
        loadList({ silent: true });
      }
    } catch (err) {
      showToast(payrollErrorMessage(err, failMessage), "error");
      loadList({ silent: true });
      // Someone else may have acted on it meanwhile; show the current state.
      if (detailIdRef.current) reloadDetail(detailIdRef.current);
    } finally {
      busyRef.current = false;
      setBusyKey("");
    }
  };

  const approve = (rule) => guarded(`approve:${rule.id}`, async (start) => {
    if (!(await window.confirm(`Approve “${rule.name}”? It can then be applied to ${formatPeriod(rule.period_month)} payroll. Preview the impact first to check the total cost.`))) return null;
    start();
    await payrollAPI.approveBonusRule(rule.id);
    return "Bonus rule approved. Apply it when you're ready.";
  }, "Couldn't approve this bonus rule.");

  const apply = (rule) => guarded(`apply:${rule.id}`, async (start) => {
    if (!(await window.confirm(`Apply “${rule.name}”? This creates a bonus for every eligible employee in ${formatPeriod(rule.period_month)} payroll. It can only be done once.`))) return null;
    start();
    const res = await payrollAPI.applyBonusRule(rule.id);
    const d = res?.data && typeof res.data === "object" ? res.data : {};
    // `applied_count` and `batch_id` sit at the top level of data.
    const count = toCount(d.applied_count);
    return `Bonus applied: ${plural(count, "bonus", "bonuses")} added to ${formatPeriod(rule.period_month)} payroll as approved adjustments.`;
  }, "Couldn't apply this bonus rule.");

  const cancelRule = (rule) => guarded(`cancel:${rule.id}`, async (start) => {
    if (!(await window.confirm(`Cancel “${rule.name}”? It won't be paid. To pay it later you'll need to create a new rule.`))) return null;
    start();
    await payrollAPI.cancelBonusRule(rule.id);
    return "Bonus rule cancelled.";
  }, "Couldn't cancel this bonus rule.");

  const submitReject = async (reason) => {
    if (!rejectTarget) return;
    setRejectBusy(true);
    setRejectError("");
    try {
      await payrollAPI.rejectBonusRule(rejectTarget.id, { rejection_reason: reason });
      setRejectTarget(null);
      closeAll();
      showToast("Bonus rule rejected.");
      loadList({ silent: true });
    } catch (err) {
      // Keep the dialog (and the typed reason) open so the user can retry.
      setRejectError(payrollErrorMessage(err, "Couldn't reject this bonus rule."));
    } finally {
      setRejectBusy(false);
    }
  };

  // Opens on top of the rule details, so closing it returns there.
  const openImpact = async (rule) => {
    setImpact({ rule, loading: true, data: null, error: "" });
    try {
      const res = await payrollAPI.previewBonusRuleImpact(rule.id);
      setImpact((cur) => (cur?.rule.id === rule.id ? { rule, loading: false, data: normalizeImpact(res?.data, rule), error: "" } : cur));
    } catch (err) {
      setImpact((cur) => (cur?.rule.id === rule.id ? { rule, loading: false, data: null, error: payrollErrorMessage(err, "Couldn't work out the impact of this rule.") } : cur));
    }
  };

  // Actions stay disabled until the full rule lands, so nobody approves or
  // applies from a stale list row.
  const reloadDetail = async (id, { notifyOnError = false } = {}) => {
    const reqId = ++detailReq.current;
    setDetailLoading(true);
    try {
      const res = await payrollAPI.getBonusRule(id);
      const full = res?.data ?? res;
      if (reqId !== detailReq.current) return;
      setDetail((d) => (d && d.id === id ? { ...d, ...(full && typeof full === "object" ? full : {}) } : d));
    } catch (err) {
      if (reqId === detailReq.current && notifyOnError) {
        showToast(payrollErrorMessage(err, "Couldn't load the full rule. Showing what the list has."), "error");
      }
    } finally {
      if (reqId === detailReq.current) setDetailLoading(false);
    }
  };

  const openDetail = (rule) => {
    setDetail(rule);
    reloadDetail(rule.id, { notifyOnError: true });
  };

  const selectCls = "h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400";

  return (
    <>
      <DashboardTopBar title="Bonus Rules" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 w-full">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Bonus Rules</h1>
            <p className="text-sm text-slate-500 mt-1">Pay a bonus to a group at once. Create, preview the cost, approve, then apply. Open a rule to review it and take the next step.</p>
          </div>
          <button type="button" onClick={() => setForm({ rule: null })} className="h-[42px] px-4 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
            <HiPlus className="w-5 h-5" /> New bonus rule
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5 flex flex-wrap items-center gap-2">
          <select aria-label="Status" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={selectCls}>
            {APPROVAL_STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Paid in" value={filters.period_month} onChange={(e) => setFilter("period_month", e.target.value)} className={selectCls}>
            <option value="">Any month</option>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select aria-label="Calculation" value={filters.bonus_type} onChange={(e) => setFilter("bonus_type", e.target.value)} className={selectCls}>
            <option value="">Any calculation</option>
            {BONUS_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{BONUS_TYPE_LABEL[t]}</option>)}
          </select>
          <div className="flex items-center gap-2 ml-auto">
            {hasFilters && <button type="button" onClick={() => { setFilters({ status: "", period_month: "", bonus_type: "" }); setPage(1); }} className="h-10 px-3 text-xs font-bold text-purple-700 hover:bg-purple-50 rounded-xl transition">Clear</button>}
            <button type="button" onClick={() => loadList()} aria-label="Refresh" title="Refresh" className="h-10 px-3 text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition"><HiRefresh className="w-4 h-4" /></button>
          </div>
        </div>

        {loading ? <Skeleton type="table" rows={6} /> : loadError ? (
          <div className="py-12 px-6 text-center bg-white rounded-2xl border border-rose-200">
            <HiExclamationCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-rose-700">{loadError}</p>
            <button type="button" onClick={() => loadList()} className="mt-4 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">Try again</button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1100px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-5 py-4 border-b border-slate-100">Rule</th>
                    <th className="px-5 py-4 border-b border-slate-100">Paid in</th>
                    <th className="px-5 py-4 border-b border-slate-100">Calculation</th>
                    <th className="px-5 py-4 border-b border-slate-100">Who qualifies</th>
                    <th className="px-5 py-4 border-b border-slate-100">Most per person</th>
                    <th className="px-5 py-4 border-b border-slate-100">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {list.items.map((r) => {
                    const status = approvalStatusMeta(r.status);
                    const needsAction = isPendingStatus(r.status) || isReadyToApply(r);
                    const openLabel = `${needsAction ? "Review" : "View"} ${r.name || "bonus rule"}`;
                    return (
                      <tr key={r.id} {...rowPreviewProps(() => openDetail(r), openLabel)}>
                        <td className="px-5 py-4 max-w-[320px]">
                          <p className="font-bold text-slate-800 truncate">{r.name || "Untitled rule"}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{r.reason || "N/A"}</p>
                        </td>
                        <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{formatPeriod(r.period_month)}</td>
                        <td className="px-5 py-4">
                          <p className="text-slate-600">{BONUS_TYPE_LABEL[r.bonus_type] || prettifyCode(r.bonus_type) || "N/A"}</p>
                          <p className="text-[12px] font-bold text-slate-800">{ruleValueText(r)}</p>
                        </td>
                        <td className="px-5 py-4 text-slate-600">{eligibilitySummary(r)}</td>
                        <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{hasCap(r) ? formatMoney(r.max_amount_per_employee) : "No cap"}</td>
                        <td className="px-5 py-4">
                          <span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${status.pill}`}>{status.label}</span>
                          {r.applied_at && <span className="block mt-1.5 text-[10px] font-bold text-purple-600 uppercase">Applied · {plural(toCount(r.applied_count), "person", "people")}</span>}
                          {isReadyToApply(r) && <span className="block mt-1.5 text-[10px] font-bold text-purple-600 uppercase">Ready to apply</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {list.items.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">{hasFilters ? "No bonus rules match these filters." : "No bonus rules yet."}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {list.totalPages > 1 && (
              <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">Page {page} of {list.totalPages} · {plural(list.total, "rule")}</p>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronLeft className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setPage((p) => Math.min(list.totalPages, p + 1))} disabled={page >= list.totalPages} aria-label="Next page" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {form && (
        <BonusRuleFormDialog
          rule={form.rule}
          employees={directory.options}
          departments={departments}
          onClose={() => {
            // Editing started from the rule details: go back there.
            const back = form.fromDetail ? form.rule : null;
            setForm(null);
            if (back) openDetail(back);
          }}
          onSaved={(saved, editing) => {
            setForm(null);
            closeAll();
            showToast(editing ? "Bonus rule updated." : isPendingStatus(saved?.status) || !saved?.status ? "Bonus rule created. It is waiting for approval." : "Bonus rule created.");
            loadList({ silent: true });
          }}
        />
      )}

      {rejectTarget && (
        <ReasonDialog
          title={`Reject “${rejectTarget.name}”?`}
          description={`${ruleValueText(rejectTarget)} · ${formatPeriod(rejectTarget.period_month)}. The person who created it will see your reason.`}
          label="Why are you rejecting it?"
          placeholder="e.g. Over this quarter's bonus budget"
          confirmLabel="Reject"
          tone="danger"
          busy={rejectBusy}
          error={rejectError}
          onSubmit={submitReject}
          onClose={() => { if (!rejectBusy) setRejectTarget(null); }}
        />
      )}

      {/* Rule details (#68) */}
      {detail && (() => {
        const cfg = detail.eligibility_config || {};
        const src = detail.eligibility_source;
        const deptIds = Array.isArray(cfg.department_ids) ? cfg.department_ids : [];
        const userIds = Array.isArray(cfg.user_ids) ? cfg.user_ids : [];
        const pending = isPendingStatus(detail.status);
        // Wait for the full rule before acting on it.
        const busy = !!busyKey || detailLoading;
        return (
          <DetailDialog
            eyebrow="Bonus rule"
            icon={HiGift}
            title={detail.name || "Untitled rule"}
            subtitle={`Paid in ${formatPeriod(detail.period_month)}`}
            badge={<DetailPill tone="onDark">{approvalStatusMeta(detail.status).label}</DetailPill>}
            loading={detailLoading}
            onClose={closeDetail}
            footer={canPreviewRule(detail) ? (
              <>
                {canCancelRule(detail) && (
                  <button type="button" onClick={() => cancelRule(detail)} disabled={busy} className="sm:mr-auto px-4 py-2.5 text-sm font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50">
                    {busyKey === `cancel:${detail.id}` ? <Spinner /> : <HiTrash className="w-4 h-4" />} Cancel rule
                  </button>
                )}
                <button type="button" onClick={() => openImpact(detail)} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50"><HiCalculator className="w-4 h-4" /> Preview cost</button>
                {pending && (
                  <>
                    <button type="button" onClick={() => { const r = detail; closeDetail(); setForm({ rule: r, fromDetail: true }); }} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50"><HiPencil className="w-4 h-4" /> Edit</button>
                    <button type="button" onClick={() => { setRejectError(""); setRejectTarget(detail); }} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50"><HiX className="w-4 h-4" /> Reject</button>
                    <button type="button" onClick={() => approve(detail)} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50">
                      {busyKey === `approve:${detail.id}` ? <Spinner light /> : <HiCheck className="w-4 h-4" />} Approve
                    </button>
                  </>
                )}
                {isReadyToApply(detail) && (
                  <button type="button" onClick={() => apply(detail)} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50">
                    {busyKey === `apply:${detail.id}` ? <Spinner light /> : <HiSparkles className="w-4 h-4" />} Apply to payroll
                  </button>
                )}
              </>
            ) : !detailLoading && <DetailFooterNote>{ruleLockedReason(detail)}</DetailFooterNote>}
          >
            {isUnavailableSource(src) && (
              <p className="flex items-start gap-2 text-sm text-fuchsia-800 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-4 py-3">
                <HiExclamationCircle className="w-5 h-5 shrink-0" /> “{ELIGIBILITY_LABEL[src]}” isn’t available yet, so this rule leaves everyone out and can’t be applied. Cancel it and create a rule that picks people another way.
              </p>
            )}

            <DetailStats
              items={[
                { label: "Calculation", value: BONUS_TYPE_LABEL[detail.bonus_type] || prettifyCode(detail.bonus_type) },
                { label: detail.bonus_type === "flat" ? "Amount per person" : "Percentage", value: ruleValueText(detail) },
                { label: "Most per person", value: hasCap(detail) ? formatMoney(detail.max_amount_per_employee) : "No cap" },
                { label: "Applied to", value: detail.applied_at ? plural(toCount(detail.applied_count), "person", "people") : "Not applied yet" },
              ]}
            />

            <DetailSection title="Who qualifies" icon={HiUserGroup}>
              <DetailGrid
                cols={4}
                items={[
                  ["Chosen by", ELIGIBILITY_LABEL[src] || prettifyCode(src)],
                  ["Employment types", listOf(cfg.employment_types).length > 0 ? employmentTypesText(cfg.employment_types) : "All types"],
                  ["Minimum time with us", toCount(cfg.min_tenure_months) > 0 ? `${cfg.min_tenure_months} months` : "None"],
                  ["Paid in", formatPeriod(detail.period_month)],
                ]}
              />
              {src === "department" && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {deptIds.length === 0 ? <DetailPill tone="muted">No departments</DetailPill> : deptIds.map((id) => <DetailPill key={id}>{deptById.get(id)?.name || "Removed department"}</DetailPill>)}
                </div>
              )}
              {usesUserIds(src) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {userIds.length === 0 ? <DetailPill tone="muted">No employees</DetailPill> : userIds.map((id) => <DetailPill key={id}>{people.nameOf(id)}</DetailPill>)}
                </div>
              )}
            </DetailSection>

            <DetailSection title="History" icon={HiDocumentText}>
              <DetailGrid
                items={[
                  ["Status", approvalStatusMeta(detail.status).label],
                  ["Created on", detail.created_at ? formatDate(detail.created_at) : null],
                  ["Proposed by", actorName(detail, "proposed_by") || actorName(detail, "created_by") || userName(detail.proposed_by || detail.created_by) || personName(detail.proposer, "") || null],
                  ["Approved or rejected by", actorName(detail, "approved_by") || actorName(detail, "rejected_by") || userName(detail.approved_by || detail.rejected_by) || personName(detail.approver, "") || null],
                  ["Decided on", detail.actioned_at ? formatDate(detail.actioned_at) : null],
                  ["Applied on", detail.applied_at ? formatDate(detail.applied_at) : null],
                  ["Bonuses created", detail.applied_at ? toCount(detail.applied_count) : null],
                ]}
              />
              <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                <DetailText label="Reason">{detail.reason}</DetailText>
                {detail.rejection_reason && <DetailText label="Why it was rejected">{detail.rejection_reason}</DetailText>}
              </div>
              {detail.applied_batch_id && (
                <button type="button" onClick={() => navigate(`/dashboard/hr/payroll/adjustments?batch_id=${encodeURIComponent(detail.applied_batch_id)}`)} className="mt-3 px-3 py-1.5 text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-lg transition inline-flex items-center gap-1">
                  See the bonuses it created <HiExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </DetailSection>
          </DetailDialog>
        );
      })()}

      {/* Rendered after the details so it stacks on top of them. */}
      {/* Impact preview (#72) — persists nothing */}
      {impact && (() => {
        const { rule, loading: impactLoading, data, error } = impact;
        const canApply = rule.status === "approved" && !rule.applied_at;
        // Awards and skips carry `user_id`, plus `employee` once gap G-2 ships.
        const nameFor = (row) => embeddedEmployee(row)?.name || people.nameOf(row.user_id);
        const codeFor = (row) => embeddedEmployee(row)?.code || directory.byId.get(row.user_id)?.code || null;
        const average = data && data.awardedCount > 0 ? Number.parseFloat(data.total || 0) / data.awardedCount : 0;
        const showBasis = rule.bonus_type !== "flat";
        return (
          <DetailDialog
            eyebrow="Cost preview"
            icon={HiCalculator}
            title={rule.name}
            subtitle={`${BONUS_TYPE_LABEL[rule.bonus_type] || prettifyCode(rule.bonus_type)} · ${ruleValueText(rule)} · ${formatPeriod(rule.period_month)}`}
            badge={<DetailPill tone="onDark">{approvalStatusMeta(rule.status).label}</DetailPill>}
            loading={impactLoading}
            onClose={() => setImpact(null)}
            footer={
              <>
                <p className="mr-auto text-xs text-slate-500">Preview only. Nothing is saved.</p>
                <button type="button" onClick={() => openImpact(rule)} disabled={impactLoading} className="px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50"><HiRefresh className="w-4 h-4" /> Work out again</button>
                {canApply && data && (
                  <button type="button" onClick={() => apply(rule)} disabled={!!busyKey || data.awardedCount === 0} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50">
                    {busyKey === `apply:${rule.id}` ? <Spinner light /> : <HiSparkles className="w-4 h-4" />} Apply to payroll
                  </button>
                )}
              </>
            }
          >
            {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</p>}
            {data && (
              <>
                <DetailStats
                  items={[
                    { label: "Will get a bonus", value: plural(data.awardedCount, "person", "people"), icon: HiUserGroup },
                    { label: "Total gross bonus", value: formatMoney(data.total), icon: HiGift },
                    { label: "Average bonus", value: formatMoney(average), icon: HiCalculator },
                    { label: "Left out", value: plural(data.skippedCount, "person", "people"), icon: HiBan },
                  ]}
                />
                <p className="flex items-start gap-2 text-xs text-purple-800 bg-purple-100/60 border border-purple-200 rounded-xl px-3.5 py-2.5">
                  <HiInformationCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {showBasis ? (data.basisLabel ? `Percentages use the ${data.basisLabel.toLowerCase()}. ` : "Percentages use each person's approved salary structure for the month. ") : ""}
                    {data.capped > 0 && hasCap(rule) ? `${plural(data.capped, "bonus", "bonuses")} ${data.capped === 1 ? "is" : "are"} at the ${formatMoney(rule.max_amount_per_employee)} limit per person. ` : ""}
                    These are gross amounts. PF, ESI and income tax are worked out on the whole month when the payroll run is calculated, so take-home pay rises by less.
                  </span>
                </p>
                <DetailSection title="Who gets a bonus" icon={HiUserGroup}>
                  <DetailTable
                    rowKey={(row, i) => row.user_id || i}
                    rows={data.awards}
                    empty="Nobody qualifies for this rule, so it can't be applied."
                    columns={[
                      { header: "Employee", render: (row) => <span className="font-semibold text-slate-800">{nameFor(row)}</span> },
                      { header: "Code", render: (row) => codeFor(row) },
                      ...(showBasis ? [{ header: "Salary used", align: "right", render: (row) => (row.basisAmount !== null ? <span className="tabular-nums">{formatMoney(row.basisAmount)}</span> : null) }] : []),
                      {
                        header: "Gross bonus",
                        align: "right",
                        render: (row) => (
                          <span className="font-bold tabular-nums text-purple-700">
                            {formatMoney(row.amount)}
                            {row.atCap && (
                              <span
                                className="ml-1.5 text-[10px] font-bold uppercase text-fuchsia-700"
                                title={row.uncappedAmount ? `Worked out as ${formatMoney(row.uncappedAmount)} before the limit` : undefined}
                              >
                                At limit
                              </span>
                            )}
                          </span>
                        ),
                      },
                    ]}
                  />
                </DetailSection>
                {data.skipped.length > 0 && (
                  <DetailSection title="Who is left out, and why" icon={HiBan}>
                    <DetailTable
                      rowKey={(row, i) => row.user_id || i}
                      rows={data.skipped}
                      columns={[
                        { header: "Employee", render: (row) => <span className="font-semibold text-slate-800">{nameFor(row)}</span> },
                        { header: "Code", render: (row) => codeFor(row) },
                        { header: "Reason", render: (row) => skipReasonText(row.reason) },
                      ]}
                    />
                  </DetailSection>
                )}
              </>
            )}
          </DetailDialog>
        );
      })()}

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}
