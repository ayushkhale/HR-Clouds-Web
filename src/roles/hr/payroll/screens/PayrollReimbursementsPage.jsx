import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import {
  HiPlus, HiSearch, HiRefresh, HiChevronLeft, HiChevronRight, HiExclamationCircle,
  HiReceiptRefund, HiX, HiCheck, HiTag, HiPencil, HiBan, HiRefresh as HiReactivate,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import ReasonDialog from "../../../../shared/components/ReasonDialog";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import ClaimDetailSections from "../../../../shared/components/ClaimDetailSections";
import ClaimDecisionDialog from "../../../../shared/components/ClaimDecisionDialog";
import AttachmentViewerDialog from "../../../../shared/components/AttachmentViewerDialog";
import { payrollErrorMessage, payrollErrorCode } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatPeriod, formatDate } from "../../../../shared/utils/formatUtils";
import { listFrom } from "../../../../shared/attendance/normalize";
import { usePagedList } from "../../../../shared/attendance/usePagedList";
import { useAuth } from "../../../../shared/contexts/AuthContext";
import useEmployeeDirectory from "../useEmployeeDirectory";
import useToast from "../useToast";
import PayrollToast from "../PayrollToast";
import { periodOptions, matchesEmployee } from "../variablePayMeta";
import { plural } from "../runMeta";
import {
  claimStatusMeta, claimStage, claimActions, normalizeClaimDetail, limitViolations,
  parseMoney, claimLimitText, periodLimitText, receiptRuleText, LIMIT_PERIOD_LABEL,
  CLAIM_STATUS_FILTERS, CATEGORY_STATUS_FILTERS,
} from "../../../../shared/utils/reimbursementMeta";

const PAGE_SIZE = 20;
const fieldCls = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none disabled:opacity-60";
const labelCls = "block text-[11px] font-bold text-slate-500 uppercase mb-2";
const errorTextCls = "text-xs font-semibold text-rose-600 mt-1.5";
const selectCls = "h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400";

function Spinner({ light = false }) {
  return <span className={`inline-block w-4 h-4 border-2 rounded-full animate-spin ${light ? "border-white/30 border-t-white" : "border-purple-200 border-t-purple-600"}`} />;
}

const CATEGORY_CODE_RE = /^[A-Z0-9_]{2,50}$/;
const codeFromName = (name) => String(name || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
const capValue = (v, { allowZero = false } = {}) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = parseMoney(v, { allowZero });
  return Number.isNaN(n) ? null : n;
};

// ── Category form (#128 create / #131 edit) ─────────────────────────────────
const emptyCategory = () => ({
  name: "", code: "", codeEdited: false, description: "",
  is_taxable: false, requires_receipt: true, receipt_required_above_amount: "",
  max_amount_per_claim: "", max_amount_per_period: "", limit_period: "financial_year",
  component_id: "", is_active: true,
});

function categoryToForm(cat) {
  return {
    name: cat.name || "", code: cat.code || "", codeEdited: true, description: cat.description || "",
    is_taxable: !!cat.is_taxable, requires_receipt: cat.requires_receipt !== false,
    receipt_required_above_amount: cat.receipt_required_above_amount ?? "",
    max_amount_per_claim: cat.max_amount_per_claim ?? "",
    max_amount_per_period: cat.max_amount_per_period ?? "",
    limit_period: cat.limit_period || "financial_year",
    component_id: cat.component_id || "", is_active: cat.is_active !== false,
  };
}

function validateCategory(f, { isEdit }) {
  const e = {};
  if (f.name.trim().length < 2 || f.name.trim().length > 150) e.name = "Enter a name (2–150 characters).";
  if (!isEdit && !CATEGORY_CODE_RE.test(f.code)) e.code = "Use capital letters, digits and underscores (2–50 characters).";
  if (f.description.length > 1000) e.description = "Keep the description under 1000 characters.";
  if (f.requires_receipt && f.receipt_required_above_amount !== "" && Number.isNaN(parseMoney(f.receipt_required_above_amount, { allowZero: true }))) {
    e.receipt_required_above_amount = "Enter an amount, or leave it empty for “always”.";
  }
  if (f.max_amount_per_claim !== "" && Number.isNaN(parseMoney(f.max_amount_per_claim))) e.max_amount_per_claim = "Enter an amount above 0, or leave it empty.";
  if (f.max_amount_per_period !== "" && Number.isNaN(parseMoney(f.max_amount_per_period, { allowZero: true }))) e.max_amount_per_period = "Enter an amount (0 or more), or leave it empty.";
  return e;
}

function CategoryFormDialog({ category, components, onClose, onSaved }) {
  const isEdit = !!category;
  const [form, setForm] = useState(() => (category ? categoryToForm(category) : emptyCategory()));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [fieldErr, setFieldErr] = useState({});
  const savingRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = saving ? () => {} : onClose;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const errors = validateCategory(form, { isEdit });
  const show = (key) => (touched ? errors[key] : "") || fieldErr[key] || "";
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setServerError(""); setFieldErr({}); };
  const changeName = (name) => set(form.codeEdited || isEdit ? { name } : { name, code: codeFromName(name) });

  const catalog = useMemo(
    () => (Array.isArray(components) ? components : []).filter((c) => c.is_active !== false && !c.is_statutory),
    [components],
  );

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length > 0 || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setServerError("");
    const perClaim = capValue(form.max_amount_per_claim);
    const perPeriod = capValue(form.max_amount_per_period, { allowZero: true });
    const receiptAbove = form.requires_receipt ? capValue(form.receipt_required_above_amount, { allowZero: true }) : null;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      is_taxable: form.is_taxable,
      requires_receipt: form.requires_receipt,
      receipt_required_above_amount: receiptAbove,
      max_amount_per_claim: perClaim,
      max_amount_per_period: perPeriod,
      limit_period: form.limit_period,
      component_id: form.component_id || null,
      is_active: form.is_active,
    };
    if (!isEdit) payload.code = form.code.trim();
    try {
      const res = isEdit
        ? await payrollAPI.updateReimbursementCategory(category.id, payload)
        : await payrollAPI.createReimbursementCategory(payload);
      onSaved(res?.data ?? res, isEdit);
    } catch (err) {
      const code = payrollErrorCode(err);
      if (code === "CATEGORY_CODE_EXISTS") setFieldErr({ code: payrollErrorMessage(err) });
      else setServerError(payrollErrorMessage(err, "Couldn't save this category."));
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-purple-950/40 backdrop-blur-sm p-4 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <form onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-label={isEdit ? "Edit category" : "New category"} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 sm:px-8 py-5 border-b border-purple-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{isEdit ? "Edit category" : "New expense category"}</h2>
            <p className="text-sm text-slate-500 mt-0.5">Set the limits, the receipt rule and how it&apos;s taxed. Employees claim against active categories.</p>
          </div>
          <button type="button" onClick={() => closeRef.current()} disabled={saving} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 sm:px-8 py-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="cat-name" className={labelCls}>Name <span className="text-rose-500">*</span></label>
              <input id="cat-name" value={form.name} maxLength={150} onChange={(e) => changeName(e.target.value)} placeholder="e.g. Travel" className={fieldCls} aria-invalid={!!show("name")} />
              {show("name") && <p className={errorTextCls}>{show("name")}</p>}
            </div>
            <div>
              <label htmlFor="cat-code" className={labelCls}>Code {!isEdit && <span className="text-rose-500">*</span>}</label>
              <input
                id="cat-code"
                value={form.code}
                maxLength={50}
                disabled={isEdit}
                onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[\s-]+/g, "_"), codeEdited: true })}
                placeholder="e.g. TRAVEL"
                className={`${fieldCls} font-mono`}
                aria-invalid={!!show("code")}
              />
              <p className="text-[11px] text-slate-400 mt-1">{isEdit ? "The code can't be changed." : "Shown on the payslip line."}</p>
              {show("code") && <p className={errorTextCls}>{show("code")}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="cat-desc" className={labelCls}>Description</label>
            <textarea id="cat-desc" rows={2} maxLength={1000} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Tell employees what they can claim here." className={`${fieldCls} resize-none`} />
          </div>

          <fieldset className="rounded-2xl border border-purple-100 bg-purple-50/40 px-4 py-3.5 space-y-3">
            <legend className="px-1 text-[11px] font-bold text-purple-700 uppercase">Receipts & tax</legend>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.requires_receipt} onChange={(e) => set({ requires_receipt: e.target.checked })} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
              <span className="text-sm font-medium text-slate-700">A receipt is needed</span>
            </label>
            {form.requires_receipt && (
              <div className="max-w-xs">
                <label htmlFor="cat-receipt-above" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Only above (leave empty for always)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                  <input id="cat-receipt-above" type="number" inputMode="decimal" min="0" step="0.01" value={form.receipt_required_above_amount} onChange={(e) => set({ receipt_required_above_amount: e.target.value })} className={`${fieldCls} pl-7`} aria-invalid={!!show("receipt_required_above_amount")} />
                </div>
                {show("receipt_required_above_amount") && <p className={errorTextCls}>{show("receipt_required_above_amount")}</p>}
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_taxable} onChange={(e) => set({ is_taxable: e.target.checked })} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
              <span className="text-sm font-medium text-slate-700">Taxable</span>
            </label>
            <p className="text-[11px] text-slate-500">{form.is_taxable ? "Taxed as income and counted for professional tax, not for PF/ESI." : "Paid on top of salary. Not taxed, not counted for PF/ESI."}</p>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label htmlFor="cat-per-claim" className={labelCls}>Limit per claim</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                <input id="cat-per-claim" type="number" inputMode="decimal" min="0" step="0.01" value={form.max_amount_per_claim} onChange={(e) => set({ max_amount_per_claim: e.target.value })} placeholder="No limit" className={`${fieldCls} pl-7`} aria-invalid={!!show("max_amount_per_claim")} />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">All items of this category in one claim count together.</p>
              {show("max_amount_per_claim") && <p className={errorTextCls}>{show("max_amount_per_claim")}</p>}
            </div>
            <div>
              <label htmlFor="cat-per-period" className={labelCls}>Limit per period</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                <input id="cat-per-period" type="number" inputMode="decimal" min="0" step="0.01" value={form.max_amount_per_period} onChange={(e) => set({ max_amount_per_period: e.target.value })} placeholder="No limit" className={`${fieldCls} pl-7`} aria-invalid={!!show("max_amount_per_period")} />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">0 means nobody can claim in this category.</p>
              {show("max_amount_per_period") && <p className={errorTextCls}>{show("max_amount_per_period")}</p>}
            </div>
            <div>
              <label htmlFor="cat-period" className={labelCls}>Period</label>
              <select id="cat-period" value={form.limit_period} onChange={(e) => set({ limit_period: e.target.value })} disabled={form.max_amount_per_period === ""} className={fieldCls}>
                <option value="month">Per month</option>
                <option value="financial_year">Per financial year</option>
              </select>
            </div>
          </div>

          {form.max_amount_per_claim !== "" && form.max_amount_per_period !== "" && parseMoney(form.max_amount_per_claim) > parseMoney(form.max_amount_per_period, { allowZero: true }) && (
            <p className="text-[11px] text-fuchsia-600">One claim can never use the full per-claim limit, because it&apos;s higher than the period limit.</p>
          )}

          <details className="rounded-xl border border-slate-200 px-4 py-3">
            <summary className="text-sm font-bold text-slate-600 cursor-pointer">Advanced</summary>
            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor="cat-component" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Salary component (optional)</label>
                <select id="cat-component" value={form.component_id} onChange={(e) => set({ component_id: e.target.value })} className={fieldCls}>
                  <option value="">Payroll picks one automatically</option>
                  {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
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

          {isEdit && <p className="text-[11px] text-slate-500">Changes apply to claims created from now on. Claims already created keep the old rules.</p>}
          {serverError && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">{serverError}</p>}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 sm:px-8 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <button type="button" onClick={() => closeRef.current()} disabled={saving} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">Close</button>
          <button type="submit" disabled={saving} className="sm:min-w-[180px] px-6 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-60 flex justify-center items-center gap-2">
            {saving ? <Spinner light /> : isEdit ? "Save changes" : "Save category"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Categories tab ───────────────────────────────────────────────────────────
function CategoriesTab({ showToast }) {
  const [statusFilter, setStatusFilter] = useState("true");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [components, setComponents] = useState([]);
  const [formTarget, setFormTarget] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const busyRef = useRef(false);
  const reqRef = useRef(0);
  const detailReq = useRef(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    const reqId = ++reqRef.current;
    if (!silent) setLoading(true);
    try {
      const params = {};
      if (statusFilter !== "") params.is_active = statusFilter;
      const res = await payrollAPI.getReimbursementCategories(params);
      if (reqId !== reqRef.current) return;
      setRows(listFrom(res, ["categories", "rows", "records"]));
      setLoadError("");
    } catch (err) {
      if (reqId !== reqRef.current) return;
      setLoadError(payrollErrorMessage(err, "Couldn't load categories."));
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let cancelled = false;
    payrollAPI.getComponents().then((res) => { if (!cancelled) setComponents(listFrom(res, ["components", "records"])); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const reloadDetail = async (id) => {
    const reqId = ++detailReq.current;
    setDetailLoading(true);
    try {
      const res = await payrollAPI.getReimbursementCategory(id);
      const full = res?.data ?? res;
      if (reqId !== detailReq.current) return;
      setDetail((d) => (d && d.id === id ? { ...d, ...(full && typeof full === "object" ? full : {}) } : d));
    } catch {
      /* keep list-row data */
    } finally {
      if (reqId === detailReq.current) setDetailLoading(false);
    }
  };
  const openDetail = (cat) => { setDetail(cat); reloadDetail(cat.id); };
  const closeDetail = () => { detailReq.current += 1; setDetail(null); setDetailLoading(false); };

  const guarded = async (key, run, failMessage) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyKey(key);
    try {
      const message = await run();
      if (message) { showToast(message); closeDetail(); load({ silent: true }); }
    } catch (err) {
      showToast(payrollErrorMessage(err, failMessage), "error");
    } finally {
      busyRef.current = false;
      setBusyKey("");
    }
  };

  const deactivate = (cat) => guarded(`off:${cat.id}`, async () => {
    if (!(await window.confirm(`Stop new claims in ${cat.name}? Claims already made keep it.`))) return null;
    await payrollAPI.deactivateReimbursementCategory(cat.id);
    return "Category switched off.";
  }, "Couldn't switch this category off.");

  const reactivate = (cat) => guarded(`on:${cat.id}`, async () => {
    if (!(await window.confirm(`Turn ${cat.name} back on so employees can claim against it?`))) return null;
    await payrollAPI.updateReimbursementCategory(cat.id, { is_active: true });
    return "Category switched on.";
  }, "Couldn't switch this category on.");

  const query = search.trim().toLowerCase();
  const visible = query ? rows.filter((c) => [c.name, c.code].some((v) => (v || "").toLowerCase().includes(query))) : rows;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter this page by name or code" aria-label="Filter categories" className="h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none w-64" />
          </div>
          <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
            {CATEGORY_STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button type="button" onClick={() => load()} aria-label="Refresh" title="Refresh" className="h-10 px-3 text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition"><HiRefresh className="w-4 h-4" /></button>
        </div>
        <button type="button" onClick={() => setFormTarget(null)} className="h-10 px-4 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
          <HiPlus className="w-5 h-5" /> New category
        </button>
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
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <th className="px-5 py-4 border-b border-slate-100">Category</th>
                  <th className="px-5 py-4 border-b border-slate-100">Tax</th>
                  <th className="px-5 py-4 border-b border-slate-100">Receipt</th>
                  <th className="px-5 py-4 border-b border-slate-100 text-right">Per claim</th>
                  <th className="px-5 py-4 border-b border-slate-100">Per period</th>
                  <th className="px-5 py-4 border-b border-slate-100">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {visible.map((cat) => {
                  const openLabel = `View category ${cat.name}`;
                  return (
                    <tr key={cat.id} {...rowPreviewProps(() => openDetail(cat), openLabel)}>
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-800">{cat.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{cat.code}</p>
                      </td>
                      <td className="px-5 py-4">{cat.is_taxable ? <span className="px-2 py-1 rounded-md border text-[10px] font-bold uppercase bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200">Taxed</span> : <span className="px-2 py-1 rounded-md border text-[10px] font-bold uppercase bg-violet-50 text-violet-700 border-violet-200">Not taxed</span>}</td>
                      <td className="px-5 py-4 text-slate-600">{receiptRuleText(cat, formatMoney)}</td>
                      <td className="px-5 py-4 text-right text-slate-700 tabular-nums">{claimLimitText(cat, formatMoney)}</td>
                      <td className="px-5 py-4 text-slate-600">{periodLimitText(cat, formatMoney)}</td>
                      <td className="px-5 py-4">{cat.is_active !== false ? <span className="text-violet-600 font-bold text-xs">Active</span> : <span className="text-slate-400 font-bold text-xs">Inactive</span>}</td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    {rows.length === 0 ? "No categories yet. Add one so employees can start claiming." : "No categories on this page match your search."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formTarget !== undefined && (
        <CategoryFormDialog
          category={formTarget}
          components={components}
          onClose={() => setFormTarget(undefined)}
          onSaved={(saved, wasEdit) => {
            setFormTarget(undefined);
            showToast(wasEdit ? "Category updated. Claims already submitted keep their old rules." : "Category added. Employees can claim against it now.");
            if (wasEdit && detail) reloadDetail(detail.id);
            load({ silent: true });
          }}
        />
      )}

      {detail && (() => {
        const d = detail;
        const active = d.is_active !== false;
        const busy = !!busyKey || detailLoading;
        return (
          <DetailDialog
            eyebrow="Expense category"
            icon={HiTag}
            title={d.name}
            subtitle={d.code}
            badge={<DetailPill tone="onDark">{active ? "Active" : "Inactive"}</DetailPill>}
            loading={detailLoading}
            onClose={closeDetail}
            footer={(
              <>
                {active && (
                  <button type="button" onClick={() => deactivate(d)} disabled={busy} className="sm:mr-auto px-4 py-2.5 text-sm font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50">
                    {busyKey === `off:${d.id}` ? <Spinner /> : <HiBan className="w-4 h-4" />} Deactivate
                  </button>
                )}
                {!active && (
                  <button type="button" onClick={() => reactivate(d)} disabled={busy} className="sm:mr-auto px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50">
                    {busyKey === `on:${d.id}` ? <Spinner /> : <HiReactivate className="w-4 h-4" />} Reactivate
                  </button>
                )}
                <button type="button" onClick={() => setFormTarget(d)} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50">
                  <HiPencil className="w-4 h-4" /> Edit
                </button>
              </>
            )}
          >
            {d.description && <DetailSection><p className="text-sm text-slate-700 whitespace-pre-wrap">{d.description}</p></DetailSection>}
            <DetailSection title="Rules">
              <DetailGrid
                items={[
                  ["Taxable", d.is_taxable ? "Yes" : "No"],
                  ["Receipt", receiptRuleText(d, formatMoney)],
                  ["Limit per claim", claimLimitText(d, formatMoney)],
                  ["Limit per period", periodLimitText(d, formatMoney)],
                  ["Period", LIMIT_PERIOD_LABEL[d.limit_period] || "per financial year"],
                  ["Status", active ? "Active" : "Inactive"],
                ]}
              />
            </DetailSection>
          </DetailDialog>
        );
      })()}
    </>
  );
}

// ── Claims tab (HR queue) ────────────────────────────────────────────────────
function ClaimsTab({ showToast, directory, nameOf, seedStatus }) {
  const { user } = useAuth();
  const viewerId = user?.id;
  const [filters, setFilters] = useState({ status: seedStatus || "", user_id: "", category_id: "", payout_period_month: "", created_from: "", created_to: "" });
  const [empQuery, setEmpQuery] = useState("");
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState([]);
  const months = useMemo(() => periodOptions({ back: 18, ahead: 6 }), []);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailReq = useRef(0);
  const detailIdRef = useRef(null);
  detailIdRef.current = detail?.id ?? null;

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [decisionViolations, setDecisionViolations] = useState([]);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState("");
  const [viewAttachment, setViewAttachment] = useState(null);

  const filterKey = JSON.stringify(filters);
  const fetchPage = useCallback(({ page, limit }) => {
    const params = { page, limit };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    return payrollAPI.getReimbursementClaims(params);
  }, [filters]);
  const list = usePagedList(fetchPage, { limit: PAGE_SIZE, keys: ["claims", "rows", "records"], filterKey });

  useEffect(() => {
    let cancelled = false;
    payrollAPI.getReimbursementCategories().then((res) => { if (!cancelled) setCategories(listFrom(res, ["categories", "rows", "records"])); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const hasFilters = Object.values(filters).some(Boolean);
  const clearFilters = () => setFilters({ status: "", user_id: "", category_id: "", payout_period_month: "", created_from: "", created_to: "" });

  const reloadDetail = async (id, { notifyOnError = false } = {}) => {
    const reqId = ++detailReq.current;
    setDetailLoading(true);
    try {
      const res = await payrollAPI.getReimbursementClaim(id);
      const full = normalizeClaimDetail(res?.data ?? res);
      if (reqId !== detailReq.current) return;
      setDetail((d) => (d && d.id === id ? { ...d, ...full } : d));
    } catch (err) {
      if (reqId === detailReq.current && notifyOnError) showToast(payrollErrorMessage(err, "Couldn't load the full claim. Showing what the list has."), "error");
      if (payrollErrorCode(err) === "CLAIM_NOT_FOUND" || payrollErrorCode(err) === "FORBIDDEN") { closeDetail(); list.reload(); }
    } finally {
      if (reqId === detailReq.current) setDetailLoading(false);
    }
  };
  const openDetail = (claim) => { setDetail(claim); reloadDetail(claim.id, { notifyOnError: true }); };
  const closeDetail = () => { detailReq.current += 1; setDetail(null); setDetailLoading(false); setDecisionOpen(false); };

  const submitDecision = async (payload) => {
    if (!detail || decisionBusy) return;
    setDecisionBusy(true);
    setDecisionError("");
    setDecisionViolations([]);
    try {
      const res = await payrollAPI.approveReimbursementClaim(detail.id, payload);
      const claim = res?.data ?? res;
      setDecisionOpen(false);
      closeDetail();
      if (claim?.status === "rejected") showToast("All items were rejected, so the claim is rejected.");
      else {
        const month = claim?.payout_period_month ? formatPeriod(claim.payout_period_month) : "an upcoming month";
        showToast(`Approved ${formatMoney(claim?.approved_amount)}. It will be paid with ${month} payroll. If that payroll is already calculated, recalculate it before approving.`);
      }
      list.reload();
    } catch (err) {
      const code = payrollErrorCode(err);
      if (code === "CATEGORY_LIMIT_EXCEEDED") { setDecisionViolations(limitViolations(err)); setDecisionError(payrollErrorMessage(err)); }
      else if (["APPROVED_EXCEEDS_CLAIMED", "NO_OPEN_PAYOUT_PERIOD", "RUN_CALCULATION_IN_PROGRESS"].includes(code)) setDecisionError(payrollErrorMessage(err));
      else { setDecisionOpen(false); showToast(payrollErrorMessage(err, "Couldn't approve this claim."), "error"); reloadDetail(detail.id); list.reload(); }
    } finally {
      setDecisionBusy(false);
    }
  };

  const submitReject = async (reason) => {
    if (!rejectTarget) return;
    setRejectBusy(true);
    setRejectError("");
    try {
      await payrollAPI.rejectReimbursementClaim(rejectTarget.id, reason);
      setRejectTarget(null);
      closeDetail();
      showToast("Claim rejected. The employee will see your reason.");
      list.reload();
    } catch (err) {
      setRejectError(payrollErrorMessage(err, "Couldn't reject this claim."));
    } finally {
      setRejectBusy(false);
    }
  };

  const employeeChoices = useMemo(() => directory.options.filter((e) => e.id === filters.user_id || matchesEmployee(e, empQuery)), [directory, empQuery, filters.user_id]);
  const query = search.trim().toLowerCase();
  const visible = query ? list.items.filter((c) => [nameOf(c.user_id), c.claim_number, c.title].some((v) => (v || "").toLowerCase().includes(query))) : list.items;

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5 flex flex-col xl:flex-row xl:items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter this page by employee, number or title" aria-label="Filter this page" className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:flex xl:items-center gap-2">
          <select aria-label="Status" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={selectCls}>
            {CLAIM_STATUS_FILTERS.hr.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Category" value={filters.category_id} onChange={(e) => setFilter("category_id", e.target.value)} className={selectCls}>
            <option value="">Any category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active === false ? " (inactive)" : ""}</option>)}
          </select>
          <select aria-label="Pay month" value={filters.payout_period_month} onChange={(e) => setFilter("payout_period_month", e.target.value)} className={selectCls}>
            <option value="">Any pay month</option>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <input value={empQuery} onChange={(e) => setEmpQuery(e.target.value)} placeholder="Search employee" aria-label="Search employee" className={selectCls} />
          <select aria-label="Employee" value={filters.user_id} onChange={(e) => setFilter("user_id", e.target.value)} className={selectCls}>
            <option value="">Any employee</option>
            {employeeChoices.map((e) => <option key={e.id} value={e.id}>{e.name}{e.code ? ` (${e.code})` : ""}</option>)}
          </select>
          <input type="date" aria-label="Submitted from" value={filters.created_from} onChange={(e) => setFilter("created_from", e.target.value)} className={selectCls} />
          <input type="date" aria-label="Submitted to" value={filters.created_to} onChange={(e) => setFilter("created_to", e.target.value)} className={selectCls} />
        </div>
        <div className="flex items-center gap-2">
          {hasFilters && <button type="button" onClick={clearFilters} className="h-10 px-3 text-xs font-bold text-purple-700 hover:bg-purple-50 rounded-xl transition">Clear</button>}
          <button type="button" onClick={() => list.reload()} aria-label="Refresh" title="Refresh" className="h-10 px-3 text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition"><HiRefresh className="w-4 h-4" /></button>
        </div>
      </div>

      {list.loading ? <Skeleton type="table" rows={6} /> : list.error ? (
        <div className="py-12 px-6 text-center bg-white rounded-2xl border border-rose-200">
          <HiExclamationCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-rose-700">{payrollErrorMessage(list.error, "Couldn't load claims.")}</p>
          <button type="button" onClick={() => list.reload()} className="mt-4 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">Try again</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1050px]">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <th className="px-5 py-4 border-b border-slate-100">Employee</th>
                  <th className="px-5 py-4 border-b border-slate-100">Claim</th>
                  <th className="px-5 py-4 border-b border-slate-100">Submitted</th>
                  <th className="px-5 py-4 border-b border-slate-100 text-right">Amount</th>
                  <th className="px-5 py-4 border-b border-slate-100">Status</th>
                  <th className="px-5 py-4 border-b border-slate-100">Pay month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {visible.map((claim) => {
                  const stage = claimStage(claim);
                  const acts = claimActions(claim, { audience: "hr", viewerId });
                  const status = claimStatusMeta(claim.status);
                  const name = nameOf(claim.user_id);
                  const openLabel = `${acts.canDecide ? "Review" : "View"} claim for ${name}`;
                  return (
                    <tr key={claim.id} {...rowPreviewProps(() => openDetail(claim), openLabel)}>
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-800">{name}</p>
                        <p className="text-xs text-slate-400">{directory.byId.get(claim.user_id)?.code || "N/A"}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800">{claim.status === "draft" ? "Draft" : claim.claim_number || "N/A"}</p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[220px]">{claim.title || "N/A"}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{claim.submitted_at ? formatDate(claim.submitted_at) : "Not submitted"}</td>
                      <td className="px-5 py-4 text-right whitespace-nowrap tabular-nums">
                        <p className="font-bold text-slate-800">{formatMoney(claim.total_amount)}</p>
                        {["approved", "processed"].includes(claim.status) && claim.approved_amount != null && <p className="text-[11px] text-violet-600">Approved {formatMoney(claim.approved_amount)}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${status.pill}`}>{status.label}</span>
                        <p className="text-[11px] text-slate-400 mt-1">{stage.label}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600 whitespace-nowrap">
                        {claim.payout_period_month ? formatPeriod(claim.payout_period_month) : "Set at final approval"}
                        {claim.applied_run_id && <span className="block text-[10px] font-bold text-purple-600 uppercase mt-1">In payroll</span>}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    {list.items.length === 0 ? (hasFilters ? "No claims match these filters." : "No claims yet.") : "No rows on this page match your search."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {list.totalPages > 1 && (
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Page {list.page} of {list.totalPages} · {plural(list.total, "claim")}</p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => list.setPage((p) => Math.max(1, p - 1))} disabled={list.page === 1} aria-label="Previous page" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronLeft className="w-4 h-4" /></button>
                <button type="button" onClick={() => list.setPage((p) => Math.min(list.totalPages, p + 1))} disabled={list.page >= list.totalPages} aria-label="Next page" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {detail && (() => {
        const acts = claimActions(detail, { audience: "hr", viewerId });
        const busy = detailLoading || decisionBusy || rejectBusy;
        return (
          <DetailDialog
            eyebrow="Reimbursement claim"
            icon={HiReceiptRefund}
            title={nameOf(detail.user_id)}
            subtitle={[detail.status === "draft" ? "Draft" : detail.claim_number, detail.title].filter(Boolean).join(" · ")}
            badge={<DetailPill tone="onDark">{claimStatusMeta(detail.status).label}</DetailPill>}
            loading={detailLoading}
            onClose={closeDetail}
            footer={acts.canDecide ? (
              <>
                <button type="button" onClick={() => { setRejectError(""); setRejectTarget(detail); }} disabled={busy} className="sm:mr-auto px-4 py-2.5 text-sm font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50"><HiX className="w-4 h-4" /> Reject</button>
                <button type="button" onClick={() => { setDecisionError(""); setDecisionViolations([]); setDecisionOpen(true); }} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50"><HiCheck className="w-4 h-4" /> Approve</button>
              </>
            ) : !detailLoading && <DetailFooterNote>{acts.reason}</DetailFooterNote>}
          >
            <ClaimDetailSections claim={detail} audience="hr" nameOf={nameOf} showLimits onViewAttachment={setViewAttachment} />
          </DetailDialog>
        );
      })()}

      {decisionOpen && detail && (
        <ClaimDecisionDialog
          claim={detail}
          levelLabel="HR approval (final)"
          busy={decisionBusy}
          error={decisionError}
          violations={decisionViolations}
          onSubmit={submitDecision}
          onClose={() => { if (!decisionBusy) setDecisionOpen(false); }}
        />
      )}

      {rejectTarget && (
        <ReasonDialog
          title="Reject this claim?"
          description={`${rejectTarget.claim_number || "Claim"} · ${formatMoney(rejectTarget.total_amount)} · ${nameOf(rejectTarget.user_id)}. The employee will see your reason.`}
          label="Why are you rejecting it?"
          confirmLabel="Reject claim"
          tone="danger"
          minLength={5}
          busy={rejectBusy}
          error={rejectError}
          onSubmit={submitReject}
          onClose={() => { if (!rejectBusy) setRejectTarget(null); }}
        />
      )}

      {viewAttachment && (
        <AttachmentViewerDialog attachment={viewAttachment} getViewUrl={payrollAPI.getAttachmentViewUrl} onClose={() => setViewAttachment(null)} />
      )}
    </>
  );
}

const TABS = [["claims", "Claims"], ["categories", "Categories"]];

/** embedded: HR Inbox view — the claims queue only, opened on submitted claims, without touching the host URL. */
export default function PayrollReimbursementsPage({ embedded = false } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast, showToast, hideToast } = useToast();
  const people = useEmployeeDirectory();
  const directory = people.directory;
  const nameOf = useCallback((id) => people.nameOf(id), [people]);

  const rawTab = embedded ? "claims" : searchParams.get("tab");
  const tab = TABS.some(([v]) => v === rawTab) ? rawTab : "claims";
  const seedStatus = useRef(embedded ? "submitted" : searchParams.get("status") || "").current;

  useEffect(() => {
    if (rawTab && !TABS.some(([v]) => v === rawTab)) setSearchParams((p) => { const n = new URLSearchParams(p); n.set("tab", "claims"); return n; }, { replace: true });
  }, [rawTab, setSearchParams]);

  const setTab = (value) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("tab", value); return n; }, { replace: true });

  return (
    <>
      <DashboardTopBar title="Reimbursements" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Reimbursements</h1>
          <p className="text-sm text-slate-500 mt-1">Review every claim in the organisation and keep the category catalog employees claim against.</p>
        </div>

        <div className="flex items-center gap-1 border-b border-slate-200 mb-6">
          {TABS.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTab(value)} className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${tab === value ? "border-purple-600 text-purple-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "categories"
          ? <CategoriesTab showToast={showToast} />
          : <ClaimsTab showToast={showToast} directory={directory} nameOf={nameOf} seedStatus={seedStatus} />}
      </main>

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}
