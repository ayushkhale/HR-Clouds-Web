import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import {
  HiX, HiPlus, HiUpload, HiCheck, HiAdjustments, HiTrash, HiDocumentText, HiShieldCheck,
  HiSearch, HiChevronLeft, HiChevronRight, HiRefresh, HiExclamationCircle, HiExternalLink, HiCollection,
  HiInformationCircle,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import ReasonDialog from "../../../../shared/components/ReasonDialog";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailStats, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { payrollErrorMessage, bulkErrorLines, formErrorsFrom, clearFieldErrors } from "../../../../shared/utils/payrollErrors";
import useEmployeeDirectory from "../useEmployeeDirectory";
import { formatMoney, formatPeriod, formatDate } from "../../../../shared/utils/formatUtils";
import { normalizePaginated, listFrom, personName } from "../../../../shared/attendance/normalize";
import PayrollToast from "../PayrollToast";
import useToast from "../useToast";
import PeriodPicker from "../PeriodPicker";
import { toCount, plural } from "../runMeta";
import {
  currentPeriod, isPeriod, periodOptions, parseAmount,
  approvalStatusMeta, isPendingStatus, APPROVAL_STATUS_FILTERS, ADJUSTMENT_TYPE_LABEL, ADJUSTMENT_CATEGORY_LABEL,
  CATEGORIES_BY_TYPE, FILTER_CATEGORIES, adjustmentSource, canCancelAdjustment, isAppliedAdjustment, adjustmentLockedReason,
  codeFromName, componentCodeProblem, BULK_CSV_HEADERS, BULK_OPTIONAL_HEADERS, BULK_CSV_SAMPLE, BULK_MAX_ROWS,
  bulkRowMessage, bulkTotals, csvDataRowCount, csvHeaderProblem, embeddedEmployee, actorName,
} from "../variablePayMeta";
import { PersonSelect } from "../../../../shared/components/PersonPicker";

const PAGE_SIZE = 20;
const CUSTOM_COMPONENT = "__custom__";
const PREVIEW_ROW_LIMIT = 500;
const fieldCls = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none disabled:opacity-60";
const labelCls = "block text-[11px] font-bold text-slate-500 uppercase mb-2";
const errorTextCls = "text-xs font-semibold text-rose-600 mt-1.5";
const typeWord = (adj) => (adj?.adjustment_type === "deduction" ? "deduction" : "addition");
// A byte-order mark (Excel "CSV UTF-8") breaks the backend's exact header match.
const withoutBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

function Spinner({ light = false }) {
  return <span className={`inline-block w-4 h-4 border-2 rounded-full animate-spin ${light ? "border-white/30 border-t-white" : "border-purple-200 border-t-purple-600"}`} />;
}

function useEscape(handlerRef) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") handlerRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handlerRef]);
}

// ── New adjustment (#57) ────────────────────────────────────────────────────
const emptyForm = () => ({
  user_id: "", period_month: currentPeriod(), adjustment_type: "earning", category: "bonus",
  component_id: "", component_name: "", component_code: "", codeEdited: false, amount: "", reason: "",
  is_taxable: true, pf_applicable: false, esi_applicable: false,
});

function validateAdjustment(f) {
  const e = {};
  if (!f.user_id) e.user_id = "Choose an employee.";
  if (!isPeriod(f.period_month)) e.period_month = "Choose a month.";
  if (!(CATEGORIES_BY_TYPE[f.adjustment_type] || []).includes(f.category)) e.category = "Choose a category.";
  if (!f.component_id) e.component = "Choose a salary component, or pick “Other” and type a name.";
  else if (f.component_id === CUSTOM_COMPONENT) {
    if (f.component_name.trim().length < 2) e.component = "Type a name for this line (at least 2 characters).";
    const codeProblem = componentCodeProblem(f.component_code);
    if (codeProblem) e.component_code = codeProblem;
  }
  if (Number.isNaN(parseAmount(f.amount))) e.amount = "Enter an amount above 0, with up to 2 decimals.";
  if (f.reason.trim().length < 3) e.reason = "Write a short reason (at least 3 characters).";
  return e;
}

// Form-state key → error key, for both server paths (gap G-1) and clearing on
// edit. The month picker can't hold an invalid value, so `period_month` stays
// out and a server problem with it goes in the banner.
const ADJUSTMENT_ERROR_KEY = {
  user_id: "user_id", category: "category", amount: "amount", reason: "reason",
  component_id: "component", component_name: "component", component_code: "component_code",
};

function AdjustmentFormDialog({ employees, components, onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [serverFields, setServerFields] = useState({});
  const savingRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = saving ? () => {} : onClose;
  useEscape(closeRef);

  // Inactive components are refused (COMPONENT_NOT_FOUND_OR_INACTIVE), and the
  // body's component_code must be valid and not engine-reserved even when a
  // catalog row is picked, so rows without a usable code are left out.
  const catalog = useMemo(
    () => components.filter((c) => c.component_type === form.adjustment_type && c.is_active !== false && !c.is_statutory && !componentCodeProblem(c.code)),
    [components, form.adjustment_type],
  );
  const selectedComponent = catalog.find((c) => c.id === form.component_id) || null;

  const errors = validateAdjustment(form);
  const show = (key) => (touched && errors[key]) || serverFields[key] || "";
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setServerError("");
    setServerFields((s) => clearFieldErrors(s, patch, ADJUSTMENT_ERROR_KEY));
  };

  const changeType = (type) => set({ adjustment_type: type, category: CATEGORIES_BY_TYPE[type][0], component_id: "", component_name: "", component_code: "", codeEdited: false });
  const changeComponent = (value) => {
    const comp = catalog.find((c) => c.id === value);
    if (!comp) {
      set({ component_id: value, component_name: "", component_code: "", codeEdited: false });
      return;
    }
    // The backend takes tax / PF / ESI from the catalog row and ignores the
    // form's flags, but code and name still come from the body — copy both.
    set({ component_id: comp.id, component_name: comp.name || "", component_code: comp.code || "", codeEdited: false, is_taxable: !!comp.is_taxable, pf_applicable: !!comp.pf_applicable, esi_applicable: !!comp.esi_applicable });
  };
  // The code follows the name until the user edits it by hand.
  const changeCustomName = (name) => set(form.codeEdited ? { component_name: name } : { component_name: name, component_code: codeFromName(name) });

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length > 0 || savingRef.current) return;
    // A picked catalog component that has since dropped out of the list.
    if (form.component_id && form.component_id !== CUSTOM_COMPONENT && !selectedComponent) {
      setServerError("That salary component is no longer available. Choose it again, or pick “Other”.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setServerError("");
    setServerFields({});
    const payload = {
      user_id: form.user_id,
      period_month: form.period_month,
      adjustment_type: form.adjustment_type,
      category: form.category,
      amount: parseAmount(form.amount),
      reason: form.reason.trim(),
    };
    if (selectedComponent) {
      Object.assign(payload, { component_id: selectedComponent.id, component_code: selectedComponent.code, component_name: selectedComponent.name });
    } else {
      Object.assign(payload, {
        component_code: form.component_code.trim(),
        component_name: form.component_name.trim(),
        is_taxable: form.is_taxable,
        pf_applicable: form.pf_applicable,
        esi_applicable: form.esi_applicable,
      });
    }
    try {
      const res = await payrollAPI.createAdjustment(payload);
      onSaved(res?.data ?? res);
    } catch (err) {
      const { fields, banner } = formErrorsFrom(err, (path) => ADJUSTMENT_ERROR_KEY[path] || "", "Couldn't save this adjustment.");
      setServerFields(fields);
      setServerError(banner);
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <form onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-label="New adjustment" className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 sm:px-8 py-5 border-b border-purple-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">New adjustment</h2>
            <p className="text-sm text-slate-500 mt-0.5">A one-time addition to, or deduction from, one employee’s pay for one month.</p>
          </div>
          <button type="button" onClick={() => closeRef.current()} disabled={saving} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 sm:px-8 py-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
            <div>
              <label htmlFor="adj-employee" className={labelCls}>Employee <span className="text-rose-500">*</span></label>
              <PersonSelect id="adj-employee" people={employees} value={form.user_id} onChange={(id) => set({ user_id: id })} placeholder="Choose an employee" invalid={!!show("user_id")} />
              {show("user_id") && <p className={errorTextCls}>{show("user_id")}</p>}
            </div>
            <div>
              <label htmlFor="adj-period-month" className={labelCls}>Pay month <span className="text-rose-500">*</span></label>
              <PeriodPicker value={form.period_month} onChange={(v) => set({ period_month: v })} idPrefix="adj-period" selectClassName={fieldCls} yearsBack={1} yearsAhead={2} />
              <p className="text-[11px] text-slate-400 mt-1.5">The payroll run for this month will include it.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <div>
              <span className={labelCls}>Type <span className="text-rose-500">*</span></span>
              <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1" role="radiogroup" aria-label="Adjustment type">
                {["earning", "deduction"].map((type) => (
                  <button key={type} type="button" role="radio" aria-checked={form.adjustment_type === type} onClick={() => changeType(type)} className={`py-2 rounded-lg text-sm font-bold transition ${form.adjustment_type === type ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    {type === "earning" ? "+ Addition" : "− Deduction"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="adj-category" className={labelCls}>Category <span className="text-rose-500">*</span></label>
              <select id="adj-category" value={form.category} onChange={(e) => set({ category: e.target.value })} className={fieldCls}>
                {CATEGORIES_BY_TYPE[form.adjustment_type].map((c) => <option key={c} value={c}>{ADJUSTMENT_CATEGORY_LABEL[c]}</option>)}
              </select>
              {show("category") && <p className={errorTextCls}>{show("category")}</p>}
            </div>
            <div>
              <label htmlFor="adj-component" className={labelCls}>Salary component <span className="text-rose-500">*</span></label>
              <select id="adj-component" value={form.component_id} onChange={(e) => changeComponent(e.target.value)} className={fieldCls} aria-invalid={!!show("component")}>
                <option value="">Choose a component</option>
                {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value={CUSTOM_COMPONENT}>Other (type a name)</option>
              </select>
              {form.component_id === CUSTOM_COMPONENT && (
                <>
                  <input value={form.component_name} maxLength={150} onChange={(e) => changeCustomName(e.target.value)} placeholder="e.g. Spot award" aria-label="Component name" className={`${fieldCls} mt-2`} />
                  <input
                    value={form.component_code}
                    maxLength={50}
                    onChange={(e) => {
                      const value = e.target.value.toUpperCase().replace(/[\s-]+/g, "_");
                      // Clearing the code hands it back to the name.
                      set({ component_code: value, codeEdited: value !== "" });
                    }}
                    placeholder="Code, e.g. SPOT_AWARD"
                    aria-label="Component code"
                    aria-invalid={!!show("component_code")}
                    className={`${fieldCls} mt-2 font-mono`}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">The code is shown on the payslip line.</p>
                </>
              )}
              {show("component") && <p className={errorTextCls}>{show("component")}</p>}
              {show("component_code") && <p className={errorTextCls}>{show("component_code")}</p>}
            </div>
            <div>
              <label htmlFor="adj-amount" className={labelCls}>Amount <span className="text-rose-500">*</span></label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                <input id="adj-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} className={`${fieldCls} pl-8`} aria-invalid={!!show("amount")} />
              </div>
              {show("amount") && <p className={errorTextCls}>{show("amount")}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="adj-reason" className={labelCls}>Reason <span className="text-rose-500">*</span></label>
            <textarea id="adj-reason" rows={3} maxLength={1000} value={form.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="e.g. Outstanding Q3 project delivery" className={`${fieldCls} resize-none`} aria-invalid={!!show("reason")} />
            {show("reason") && <p className={errorTextCls}>{show("reason")}</p>}
          </div>

          <fieldset className="rounded-2xl border border-purple-100 bg-purple-50/40 px-4 py-3.5">
            <legend className="px-1 text-[11px] font-bold text-purple-700 uppercase">Tax & contributions</legend>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {[["is_taxable", "Taxable"], ["pf_applicable", "Counts for PF"], ["esi_applicable", "Counts for ESI"]].map(([key, label]) => (
                <label key={key} className={`flex items-center gap-2 ${selectedComponent ? "cursor-not-allowed" : "cursor-pointer"}`}>
                  <input type="checkbox" checked={!!form[key]} disabled={!!selectedComponent} onChange={(e) => set({ [key]: e.target.checked })} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                  <span className="text-sm font-medium text-slate-700">{label}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              {selectedComponent ? `Taken from the “${selectedComponent.name}” component and can't be changed here.` : "Set these for a custom line. Bonuses and incentives never count towards ESI coverage."}
            </p>
          </fieldset>

          <p className="flex items-start gap-2 text-xs text-slate-500">
            <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500" />
            If your organisation needs a second HR person to approve pay changes, this will wait for their approval. Otherwise it is approved straight away.
          </p>

          {serverError && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">{serverError}</p>}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 sm:px-8 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <button type="button" onClick={() => closeRef.current()} disabled={saving} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">Close</button>
          <button type="submit" disabled={saving} className="sm:min-w-[200px] px-6 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-60 flex justify-center items-center gap-2">
            {saving ? <Spinner light /> : "Save adjustment"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Bulk upload (#63 preview → #64 commit) ─────────────────────────────────
function BulkUploadDialog({ directory, onClose, onCommitted }) {
  const [period, setPeriod] = useState(currentPeriod);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);
  // Line-level problems carried by CSV_PARSE_FAILED / BULK_VALIDATION_FAILED.
  const [errorLines, setErrorLines] = useState([]);
  const busyRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = busy ? () => {} : onClose;
  useEscape(closeRef);

  const rowCount = csvDataRowCount(csv);
  const tooMany = rowCount > BULK_MAX_ROWS;
  const invalidate = () => { setPreview(null); setError(""); setErrorLines([]); setOnlyErrors(false); };
  const showFailure = (err, fallback) => {
    setError(payrollErrorMessage(err, fallback));
    setErrorLines(bulkErrorLines(err));
  };

  const onFile = (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("That file is larger than 10 MB. Split it into smaller files.");
      return;
    }
    const reader = new FileReader();
    // Excel's "CSV UTF-8" starts with a byte-order mark, and the backend matches
    // header names exactly, so drop it before anything else sees the text.
    reader.onload = (ev) => { setCsv(withoutBom(String(ev.target?.result || ""))); setFileName(file.name); invalidate(); };
    reader.onerror = () => setError("Couldn't read that file. Save it again as CSV and retry.");
    reader.readAsText(file);
  };

  const runPreview = async () => {
    if (busyRef.current) return;
    if (!csv.trim()) { setError("Paste CSV rows or upload a .csv file first."); return; }
    // A wrong header fails every row; say which column is missing before sending.
    const headerProblem = csvHeaderProblem(csv);
    if (headerProblem) { setError(headerProblem); setErrorLines([]); return; }
    if (rowCount === 0) { setError("The CSV has a header row but no data rows."); return; }
    if (tooMany) return;
    busyRef.current = true;
    setBusy("preview");
    setError("");
    setErrorLines([]);
    try {
      // Pasted text can carry a byte-order mark too.
      const res = await payrollAPI.previewBulkAdjustments({ period_month: period, csv_content: withoutBom(csv) });
      setPreview(res?.data && typeof res.data === "object" ? res.data : {});
    } catch (err) {
      showFailure(err, "Couldn't check this file.");
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };

  // Preview never fails on bad rows: each row is `status: "ok" | "error"` with
  // an `error_code`, and the totals count only the ok rows.
  const rows = Array.isArray(preview?.rows) ? preview.rows : [];
  const isErrorRow = (r) => r.status === "error";
  const totals = bulkTotals(preview);
  const { totalRows, errorRows } = totals;
  const validRows = totals.okRows;
  const canCommit = !!preview && errorRows === 0 && validRows > 0 && !busy;
  const shownRows = (onlyErrors ? rows.filter(isErrorRow) : rows).slice(0, PREVIEW_ROW_LIMIT);

  const commit = async () => {
    if (!canCommit || busyRef.current) return;
    busyRef.current = true;
    try {
      const ok = await window.confirm(`Create ${plural(validRows, "adjustment")} for ${formatPeriod(period)}? Additions ${formatMoney(totals.earnings)}, deductions ${formatMoney(totals.deductions)}. They are saved together: if any row fails, none are saved.`);
      if (!ok) return;
      setBusy("commit");
      setError("");
      setErrorLines([]);
      const res = await payrollAPI.commitBulkAdjustments({ period_month: period, csv_content: withoutBom(csv) });
      const d = res?.data && typeof res.data === "object" ? res.data : {};
      onCommitted({ count: toCount(d.created_count) || validRows, batchId: d.batch_id || "", status: d.status, period });
    } catch (err) {
      // Rows are checked again on save (e.g. someone left meanwhile); the
      // failing lines come back in details.errors.
      showFailure(err, "Couldn't save these adjustments. Nothing was saved.");
      // The "all rows ready" preview is now wrong; make the user check the file again.
      if (err?.data?.errorCode === "BULK_VALIDATION_FAILED") setPreview(null);
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div role="dialog" aria-modal="true" aria-label="Bulk upload adjustments" className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
        <div className="flex items-start justify-between gap-4 px-6 sm:px-8 py-5 border-b border-purple-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Bulk upload adjustments</h2>
            <p className="text-sm text-slate-500 mt-0.5">Check the file first. Nothing is saved until every row is valid and you confirm.</p>
          </div>
          <button type="button" onClick={() => closeRef.current()} disabled={!!busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 sm:px-8 py-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
            <div className="space-y-4">
              <div>
                <label htmlFor="bulk-period-month" className={labelCls}>Pay month for every row</label>
                <PeriodPicker value={period} onChange={(v) => { setPeriod(v); invalidate(); }} idPrefix="bulk-period" selectClassName={fieldCls} yearsBack={1} yearsAhead={2} disabled={!!busy} />
              </div>
              <div className="rounded-xl border border-purple-100 bg-purple-50/40 px-3.5 py-3 text-xs text-slate-600 space-y-1.5">
                <p className="font-bold text-purple-700 uppercase text-[11px]">File format</p>
                <p>The first line must name these columns:</p>
                <p className="font-mono text-[11px] text-slate-700 break-words">{BULK_CSV_HEADERS.join(", ")}</p>
                <p>You can use <b>user_id</b> instead of <b>employee_code</b>. Optional columns: <span className="font-mono text-[11px]">{BULK_OPTIONAL_HEADERS.join(", ")}</span> (true or false).</p>
                <p><b>adjustment_type</b>: earning or deduction. <b>category</b>: bonus, incentive, ad_hoc_earning, ad_hoc_deduction or recovery. <b>component_code</b>: capital letters, digits and underscores. Amounts are always positive.</p>
                <p>Up to {BULK_MAX_ROWS.toLocaleString("en-IN")} rows.</p>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label htmlFor="bulk-csv" className="text-[11px] font-bold text-slate-500 uppercase">CSV rows</label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => { setCsv(BULK_CSV_SAMPLE); setFileName(""); invalidate(); }} className="text-[11px] font-bold text-purple-600 hover:underline">Insert sample</button>
                  <label className="text-[11px] font-bold text-purple-600 hover:underline cursor-pointer flex items-center gap-1">
                    <HiUpload className="w-3.5 h-3.5" /> Upload .csv
                    <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                </div>
              </div>
              <textarea
                id="bulk-csv"
                value={csv}
                onChange={(e) => { setCsv(e.target.value); setFileName(""); invalidate(); }}
                rows={9}
                spellCheck={false}
                placeholder={BULK_CSV_SAMPLE}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:border-purple-400 outline-none resize-y"
              />
              <p className={`text-[11px] mt-1.5 ${tooMany ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
                {fileName ? `${fileName} · ` : ""}{plural(rowCount, "data row")}{tooMany ? ` — more than ${BULK_MAX_ROWS.toLocaleString("en-IN")}. Split the file.` : ""}
              </p>
            </div>
          </div>

          {error && (
            <div role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
              <p>{error}</p>
              {errorLines.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-y-auto space-y-0.5 text-xs">
                  {errorLines.slice(0, 100).map((line, i) => (
                    <li key={`${line.line ?? "?"}-${i}`}><b>Line {line.line ?? "?"}:</b> {line.message || bulkRowMessage(line.error_code)}</li>
                  ))}
                  {errorLines.length > 100 && <li>…and {errorLines.length - 100} more.</li>}
                </ul>
              )}
            </div>
          )}

          {preview && (
            <section className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  ["Rows", totalRows, "text-slate-800"],
                  ["Ready", validRows, "text-purple-700"],
                  ["With problems", errorRows, errorRows ? "text-rose-600" : "text-slate-400"],
                  ["Total additions", formatMoney(totals.earnings), "text-slate-800"],
                  ["Total deductions", formatMoney(totals.deductions), "text-slate-800"],
                ].map(([label, value, cls]) => (
                  <div key={label} className="rounded-xl border border-purple-100 bg-white px-3.5 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500">{label}</p>
                    <p className={`text-lg font-black tabular-nums ${cls}`}>{value}</p>
                  </div>
                ))}
              </div>

              {errorRows > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
                  <span>Fix the rows marked below in your file, then check it again. Nothing has been saved.</span>
                  <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                    <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} className="w-4 h-4 text-purple-600 rounded border-slate-300" /> Only show problems
                  </label>
                </div>
              )}

              <div className="border border-purple-100 rounded-xl overflow-hidden">
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-left border-collapse text-xs min-w-[720px]">
                    <thead className="sticky top-0">
                      <tr className="bg-purple-50 text-[10px] uppercase font-bold text-purple-600">
                        <th className="px-3 py-2">Line</th>
                        <th className="px-3 py-2">Employee code</th>
                        <th className="px-3 py-2">Employee</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50 bg-white">
                      {shownRows.map((row, idx) => {
                        const bad = isErrorRow(row);
                        // An unparseable amount is echoed back as typed; don't show it as ₹0.
                        const amountOk = Number.isFinite(Number.parseFloat(row.amount));
                        return (
                          <tr key={`${row.line ?? idx}-${idx}`} className={bad ? "bg-rose-50/60" : ""}>
                            <td className="px-3 py-1.5 text-slate-400 tabular-nums">{row.line ?? idx + 2}</td>
                            <td className="px-3 py-1.5 font-semibold text-slate-700">{row.employee_code || "N/A"}</td>
                            <td className="px-3 py-1.5 text-slate-600">{(row.user_id && directory.byId.get(row.user_id)?.name) || "N/A"}</td>
                            <td className="px-3 py-1.5 text-right text-slate-700 tabular-nums">{amountOk ? formatMoney(row.amount) : row.amount || "N/A"}</td>
                            <td className="px-3 py-1.5">
                              {bad ? <span className="font-bold text-rose-600">{bulkRowMessage(row.error_code)}</span> : <span className="font-bold text-purple-700">Ready</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {shownRows.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No rows to show.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {(onlyErrors ? rows.filter(isErrorRow).length : rows.length) > PREVIEW_ROW_LIMIT && (
                  <p className="px-3 py-2 text-[11px] text-slate-500 border-t border-purple-50">Showing the first {PREVIEW_ROW_LIMIT} rows.</p>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 sm:px-8 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <button type="button" onClick={() => closeRef.current()} disabled={!!busy} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">Close</button>
          {!preview ? (
            <button type="button" onClick={runPreview} disabled={!!busy || tooMany} className="sm:min-w-[200px] px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-purple-600 hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 flex justify-center items-center gap-2">
              {busy === "preview" ? <><Spinner light /> Checking…</> : "Check file"}
            </button>
          ) : (
            <button type="button" onClick={commit} disabled={!canCommit} className="sm:min-w-[200px] px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-purple-600 hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
              {busy === "commit" ? <><Spinner light /> Saving…</> : errorRows > 0 ? "Fix problems to save" : `Save ${plural(validRows, "adjustment")}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PayrollAdjustmentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const batchId = searchParams.get("batch_id") || "";
  const { toast, showToast, hideToast } = useToast();

  const [filters, setFilters] = useState({ status: "", period_month: "", adjustment_type: "", category: "" });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [list, setList] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const reqRef = useRef(0);

  // Every employee, leavers included, so older adjustments still show names.
  const people = useEmployeeDirectory();
  const [components, setComponents] = useState([]);

  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const busyRef = useRef(false);
  const detailReq = useRef(0);
  const detailIdRef = useRef(null);
  detailIdRef.current = detail?.id ?? null;

  const directory = people.directory;
  const lookupName = people.nameOf;
  const months = useMemo(() => periodOptions({ back: 18, ahead: 6 }), []);
  // "Loading…" while the directory loads, never a premature "Employee not found".
  // The backend's embedded employee (gap G-2) wins; it resolves leavers too.
  const nameOf = useCallback((adj) => embeddedEmployee(adj)?.name || directory.byId.get(adj?.user_id)?.name || personName(adj, "") || lookupName(adj?.user_id), [directory, lookupName]);
  const codeOf = (adj) => embeddedEmployee(adj)?.code || directory.byId.get(adj?.user_id)?.code || "";
  const userName = (id) => (id ? directory.byId.get(id)?.name || null : null);
  // Actor names: `<field>_user` (gap G-2), else the directory.
  const actor = (row, ...fields) => fields.map((f) => actorName(row, f)).find(Boolean) || userName(fields.map((f) => row?.[f]).find(Boolean));

  const loadList = useCallback(async ({ silent = false } = {}) => {
    const reqId = ++reqRef.current;
    if (!silent) setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
      if (batchId) params.batch_id = batchId;
      const res = await payrollAPI.getAdjustments(params);
      if (reqId !== reqRef.current) return;
      const norm = normalizePaginated(res, ["adjustments", "records", "items"], params);
      setList({ items: norm.items, total: norm.total, totalPages: norm.totalPages });
      setLoadError("");
    } catch (err) {
      if (reqId !== reqRef.current) return;
      setLoadError(payrollErrorMessage(err, "Couldn't load adjustments."));
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [page, filters, batchId]);

  useEffect(() => { loadList(); }, [loadList]);

  // Reference data changes rarely; don't refetch it with every filter change.
  useEffect(() => {
    let cancelled = false;
    // Employees come from useEmployeeDirectory.
    payrollAPI.getComponents()
      .then((res) => { if (!cancelled) setComponents(listFrom(res, ["components", "records"])); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const setFilter = (key, value) => {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      if (key === "adjustment_type" && value && next.category && !CATEGORIES_BY_TYPE[value].includes(next.category)) next.category = "";
      return next;
    });
    setPage(1);
  };
  const hasFilters = Object.values(filters).some(Boolean) || !!batchId;
  const clearFilters = () => {
    setFilters({ status: "", period_month: "", adjustment_type: "", category: "" });
    setPage(1);
    if (batchId) setSearchParams({}, { replace: true });
  };
  const showBatch = (id) => {
    setPage(1);
    closeDetail();
    setSearchParams({ batch_id: id }, { replace: true });
  };

  const guarded = async (key, run, failMessage) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const message = await run(() => setBusyKey(key));
      if (message) {
        showToast(message);
        closeDetail();
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

  const approve = (adj) => guarded(`approve:${adj.id}`, async (start) => {
    if (!(await window.confirm(`Approve this ${typeWord(adj)} of ${formatMoney(adj.amount)} for ${nameOf(adj)} in ${formatPeriod(adj.period_month)}? If payroll for that month is already calculated, it will need recalculating.`))) return null;
    start();
    await payrollAPI.approveAdjustment(adj.id);
    return "Adjustment approved.";
  }, "Couldn't approve this adjustment.");

  const cancelOne = (adj) => guarded(`cancel:${adj.id}`, async (start) => {
    if (!(await window.confirm(`Cancel this ${formatMoney(adj.amount)} ${typeWord(adj)} for ${nameOf(adj)}? It won't be paid or deducted.`))) return null;
    start();
    await payrollAPI.cancelAdjustment(adj.id);
    return "Adjustment cancelled.";
  }, "Couldn't cancel this adjustment.");

  const cancelBatch = (id) => guarded(`batch:${id}`, async (start) => {
    if (!(await window.confirm("Cancel every row from this upload that isn't already in an approved payroll? Rows already used in payroll stay as they are."))) return null;
    start();
    const res = await payrollAPI.cancelAdjustmentBatch(id);
    const d = res?.data && typeof res.data === "object" ? res.data : {};
    const cancelled = toCount(d.cancelled_count);
    // Skipped rows were already used by a payroll run, so they stay as they are.
    const skipped = toCount(d.skipped_applied_count);
    const cancelledText = cancelled === 0 ? "No adjustments were cancelled" : `${plural(cancelled, "adjustment")} cancelled`;
    return skipped > 0
      ? `${cancelledText}. ${plural(skipped, "adjustment")} ${skipped === 1 ? "was" : "were"} already used in a payroll run, so ${skipped === 1 ? "it stays" : "they stay"}.`
      : `${cancelledText}.`;
  }, "Couldn't cancel this upload.");

  const submitReject = async (reason) => {
    if (!rejectTarget) return;
    setRejectBusy(true);
    setRejectError("");
    try {
      await payrollAPI.rejectAdjustment(rejectTarget.id, { rejection_reason: reason });
      setRejectTarget(null);
      closeDetail();
      showToast("Adjustment rejected.");
      loadList({ silent: true });
    } catch (err) {
      setRejectError(payrollErrorMessage(err, "Couldn't reject this adjustment."));
    } finally {
      setRejectBusy(false);
    }
  };

  // Fetch the full record. Actions stay disabled until it lands so nobody
  // approves or cancels from a stale list row.
  const reloadDetail = async (id, { notifyOnError = false } = {}) => {
    const reqId = ++detailReq.current;
    setDetailLoading(true);
    try {
      const res = await payrollAPI.getAdjustment(id);
      const full = res?.data ?? res;
      if (reqId !== detailReq.current) return;
      setDetail((d) => (d && d.id === id ? { ...d, ...(full && typeof full === "object" ? full : {}) } : d));
    } catch (err) {
      if (reqId === detailReq.current && notifyOnError) {
        showToast(payrollErrorMessage(err, "Couldn't load the full adjustment. Showing what the list has."), "error");
      }
    } finally {
      if (reqId === detailReq.current) setDetailLoading(false);
    }
  };

  const openDetail = (adj) => {
    setDetail(adj);
    reloadDetail(adj.id, { notifyOnError: true });
  };

  const closeDetail = () => {
    detailReq.current += 1;
    setDetail(null);
    setDetailLoading(false);
  };

  const query = search.trim().toLowerCase();
  const visible = query
    ? list.items.filter((adj) => [nameOf(adj), codeOf(adj), adj.component_name, adj.reason].some((v) => (v || "").toLowerCase().includes(query)))
    : list.items;
  // Arrears can't be created here but can exist, so they are only a filter choice.
  const categoryChoices = filters.adjustment_type ? CATEGORIES_BY_TYPE[filters.adjustment_type] : FILTER_CATEGORIES;
  const selectCls = "h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400";

  return (
    <>
      <DashboardTopBar title="Salary Adjustments" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 w-full">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Salary Adjustments</h1>
            <p className="text-sm text-slate-500 mt-1">One-time additions and deductions, such as bonuses or recoveries. Open a row to see its details and approve, reject or cancel it.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={() => setBulkOpen(true)} className="h-[42px] px-4 text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition flex items-center gap-2">
              <HiUpload className="w-5 h-5" /> Bulk upload
            </button>
            <button type="button" onClick={() => setFormOpen(true)} className="h-[42px] px-4 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
              <HiPlus className="w-5 h-5" /> New adjustment
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5 flex flex-col xl:flex-row xl:items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter this page by employee, component or reason" aria-label="Filter this page" className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 xl:flex xl:items-center">
            <select aria-label="Status" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={selectCls}>
              {APPROVAL_STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select aria-label="Pay month" value={filters.period_month} onChange={(e) => setFilter("period_month", e.target.value)} className={selectCls}>
              <option value="">Any month</option>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select aria-label="Type" value={filters.adjustment_type} onChange={(e) => setFilter("adjustment_type", e.target.value)} className={selectCls}>
              <option value="">Additions & deductions</option>
              <option value="earning">Additions only</option>
              <option value="deduction">Deductions only</option>
            </select>
            <select aria-label="Category" value={filters.category} onChange={(e) => setFilter("category", e.target.value)} className={selectCls}>
              <option value="">Any category</option>
              {categoryChoices.map((c) => <option key={c} value={c}>{ADJUSTMENT_CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && <button type="button" onClick={clearFilters} className="h-10 px-3 text-xs font-bold text-purple-700 hover:bg-purple-50 rounded-xl transition">Clear</button>}
            <button type="button" onClick={() => loadList()} aria-label="Refresh" title="Refresh" className="h-10 px-3 text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition"><HiRefresh className="w-4 h-4" /></button>
          </div>
        </div>

        {batchId && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm text-purple-800 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
            <span className="flex items-center gap-2 font-semibold"><HiCollection className="w-5 h-5" /> Showing rows from one bulk upload or bonus rule.</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => cancelBatch(batchId)} disabled={!!busyKey} className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg transition disabled:opacity-50">Cancel unapplied rows</button>
              <button type="button" onClick={() => setSearchParams({}, { replace: true })} className="px-3 py-1.5 text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-100 rounded-lg transition">Show everything</button>
            </div>
          </div>
        )}

        {loading ? <Skeleton type="table" rows={6} /> : loadError ? (
          <div className="py-12 px-6 text-center bg-white rounded-2xl border border-rose-200">
            <HiExclamationCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-rose-700">{loadError}</p>
            <button type="button" onClick={() => loadList()} className="mt-4 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">Try again</button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1150px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-5 py-4 border-b border-slate-100">Employee</th>
                    <th className="px-5 py-4 border-b border-slate-100">Pay month</th>
                    <th className="px-5 py-4 border-b border-slate-100">Type</th>
                    <th className="px-5 py-4 border-b border-slate-100">Component</th>
                    <th className="px-5 py-4 border-b border-slate-100 text-right">Amount</th>
                    <th className="px-5 py-4 border-b border-slate-100">Added via</th>
                    <th className="px-5 py-4 border-b border-slate-100">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {visible.map((adj) => {
                    const status = approvalStatusMeta(adj.status);
                    const pending = isPendingStatus(adj.status);
                    const name = nameOf(adj);
                    const openLabel = `${pending ? "Review" : "View"} adjustment for ${name}`;
                    return (
                      <tr key={adj.id} {...rowPreviewProps(() => openDetail(adj), openLabel)}>
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-800">{name}</p>
                          <p className="text-xs text-slate-400">{codeOf(adj) || "N/A"}</p>
                        </td>
                        <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{formatPeriod(adj.period_month)}</td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-800">{ADJUSTMENT_TYPE_LABEL[adj.adjustment_type] || "N/A"}</p>
                          <p className="text-[11px] text-slate-400">{ADJUSTMENT_CATEGORY_LABEL[adj.category] || "N/A"}</p>
                        </td>
                        <td className="px-5 py-4 text-slate-600">{adj.component_name || "N/A"}</td>
                        <td className={`px-5 py-4 text-right font-bold whitespace-nowrap tabular-nums ${adj.adjustment_type === "deduction" ? "text-rose-600" : "text-purple-700"}`}>
                          {adj.adjustment_type === "deduction" ? "−" : "+"}{formatMoney(adj.amount)}
                        </td>
                        <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{adjustmentSource(adj)}</td>
                        <td className="px-5 py-4">
                          <span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${status.pill}`}>{status.label}</span>
                          {isAppliedAdjustment(adj) && <span className="block mt-1.5 text-[10px] font-bold text-purple-600 uppercase">In payroll</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      {list.items.length === 0 ? (hasFilters ? "No adjustments match these filters." : "No adjustments yet.") : "No rows on this page match your search."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {list.totalPages > 1 && (
              <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">Page {page} of {list.totalPages} · {plural(list.total, "adjustment")}</p>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronLeft className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setPage((p) => Math.min(list.totalPages, p + 1))} disabled={page >= list.totalPages} aria-label="Next page" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {formOpen && (
        <AdjustmentFormDialog
          // New adjustments are for current staff only; leavers stay in the lookup for old rows.
          employees={directory.activeOptions}
          components={components}
          onClose={() => setFormOpen(false)}
          onSaved={(saved) => {
            setFormOpen(false);
            // Whether it lands approved or pending depends on the separate-checker setting.
            showToast(isPendingStatus(saved?.status)
              ? "Adjustment submitted for approval by another HR user."
              : "Adjustment saved and will be included in the next calculation.");
            loadList({ silent: true });
          }}
        />
      )}

      {bulkOpen && (
        <BulkUploadDialog
          directory={directory}
          onClose={() => setBulkOpen(false)}
          onCommitted={({ count, batchId: newBatch, status, period }) => {
            setBulkOpen(false);
            showToast(isPendingStatus(status)
              ? `${plural(count, "adjustment")} for ${formatPeriod(period)} submitted for approval by another HR user.`
              : `${plural(count, "adjustment")} created for ${formatPeriod(period)} and will be included in the next calculation.`);
            if (newBatch) showBatch(newBatch);
            else loadList({ silent: true });
          }}
        />
      )}

      {rejectTarget && (
        <ReasonDialog
          title={`Reject this ${typeWord(rejectTarget)} for ${nameOf(rejectTarget)}?`}
          description={`${formatMoney(rejectTarget.amount)} · ${formatPeriod(rejectTarget.period_month)}. The person who proposed it will see your reason.`}
          label="Why are you rejecting it?"
          placeholder="e.g. Not enough justification provided"
          confirmLabel="Reject"
          tone="danger"
          busy={rejectBusy}
          error={rejectError}
          onSubmit={submitReject}
          onClose={() => { if (!rejectBusy) setRejectTarget(null); }}
        />
      )}

      {detail && (() => {
        const d = detail;
        const isEarning = d.adjustment_type !== "deduction";
        const pending = isPendingStatus(d.status);
        const cancellable = canCancelAdjustment(d);
        // Wait for the full record before acting on it.
        const busy = !!busyKey || detailLoading;
        return (
          <DetailDialog
            eyebrow="Salary adjustment"
            icon={HiAdjustments}
            title={nameOf(d)}
            subtitle={[codeOf(d), formatPeriod(d.period_month)].filter(Boolean).join(" · ")}
            badge={<DetailPill tone="onDark">{approvalStatusMeta(d.status).label}</DetailPill>}
            loading={detailLoading}
            onClose={closeDetail}
            footer={pending || cancellable ? (
              <>
                {cancellable && (
                  <button type="button" onClick={() => cancelOne(d)} disabled={busy} className="sm:mr-auto px-4 py-2.5 text-sm font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50">
                    {busyKey === `cancel:${d.id}` ? <Spinner /> : <HiTrash className="w-4 h-4" />} Cancel adjustment
                  </button>
                )}
                {pending && (
                  <>
                    <button type="button" onClick={() => { setRejectError(""); setRejectTarget(d); }} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50"><HiX className="w-4 h-4" /> Reject</button>
                    <button type="button" onClick={() => approve(d)} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50">
                      {busyKey === `approve:${d.id}` ? <Spinner light /> : <HiCheck className="w-4 h-4" />} Approve
                    </button>
                  </>
                )}
              </>
            ) : !detailLoading && <DetailFooterNote>{adjustmentLockedReason(d)}</DetailFooterNote>}
          >
            <DetailStats
              items={[
                { label: "Amount", value: `${isEarning ? "+" : "−"}${formatMoney(d.amount)}` },
                { label: "Type", value: ADJUSTMENT_TYPE_LABEL[d.adjustment_type] },
                { label: "Category", value: ADJUSTMENT_CATEGORY_LABEL[d.category] },
                { label: "Component", value: d.component_name },
              ]}
            />

            <DetailSection title="Where it stands" icon={HiDocumentText}>
              <DetailGrid
                items={[
                  ["Status", approvalStatusMeta(d.status).label],
                  ["Pay month", formatPeriod(d.period_month)],
                  ["Added via", adjustmentSource(d)],
                  ["In an approved payroll", isAppliedAdjustment(d) ? "Yes" : "Not yet"],
                  ["Proposed by", actor(d, "proposed_by", "created_by") || personName(d.proposer, "") || null],
                  ["Created on", d.created_at ? formatDate(d.created_at) : null],
                  ["Approved or rejected by", actor(d, "approved_by", "rejected_by") || personName(d.approver, "") || null],
                  ["Decided on", d.actioned_at ? formatDate(d.actioned_at) : null],
                  ["Used in payroll on", d.applied_at ? formatDate(d.applied_at) : null],
                  ["Component code", d.component_code],
                ]}
              />
              <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                <DetailText label="Reason">{d.reason}</DetailText>
                {d.rejection_reason && <DetailText label="Why it was rejected">{d.rejection_reason}</DetailText>}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {d.applied_run_id && (
                  <button type="button" onClick={() => navigate(`/dashboard/hr/payroll/runs/${d.applied_run_id}`)} className="px-3 py-1.5 text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-lg transition inline-flex items-center gap-1">Open the payroll run <HiExternalLink className="w-3.5 h-3.5" /></button>
                )}
                {d.bonus_rule_id && (
                  <button type="button" onClick={() => navigate("/dashboard/hr/payroll/bonus-rules")} className="px-3 py-1.5 text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-lg transition inline-flex items-center gap-1">Open bonus rules <HiExternalLink className="w-3.5 h-3.5" /></button>
                )}
                {d.source_loan_id && (
                  <button type="button" onClick={() => navigate("/dashboard/hr/payroll/loans")} className="px-3 py-1.5 text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-lg transition inline-flex items-center gap-1">Open loans <HiExternalLink className="w-3.5 h-3.5" /></button>
                )}
                {d.batch_id && batchId !== d.batch_id && (
                  <button type="button" onClick={() => showBatch(d.batch_id)} className="px-3 py-1.5 text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-lg transition inline-flex items-center gap-1"><HiCollection className="w-3.5 h-3.5" /> Show the whole upload</button>
                )}
                {d.batch_id && !isAppliedAdjustment(d) && (
                  <button type="button" onClick={() => cancelBatch(d.batch_id)} disabled={busy} className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg transition disabled:opacity-50">Cancel the whole upload</button>
                )}
              </div>
            </DetailSection>

            <DetailSection title="Tax & contributions" icon={HiShieldCheck}>
              <DetailGrid
                cols={3}
                items={[
                  ["Taxable", d.is_taxable ? "Yes" : "No"],
                  ["Counts for PF", d.pf_applicable ? "Yes" : "No"],
                  ["Counts for ESI", d.esi_applicable ? "Yes" : "No"],
                ]}
              />
              {(d.category === "bonus" || d.category === "incentive") && (
                <p className="text-[11px] text-slate-500 mt-2">Bonuses and incentives are never counted when deciding ESI coverage.</p>
              )}
            </DetailSection>
          </DetailDialog>
        );
      })()}

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}
