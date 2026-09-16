import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import {
  HiPlus, HiRefresh, HiChevronLeft, HiChevronRight, HiExclamationCircle, HiReceiptRefund,
  HiX, HiTrash, HiCheck, HiPencil, HiEye, HiHeart,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import ReasonDialog from "../../../../shared/components/ReasonDialog";
import DetailDialog, { DetailFooterNote, DetailPill, DetailStats, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import ClaimDetailSections from "../../../../shared/components/ClaimDetailSections";
import AttachmentViewerDialog from "../../../../shared/components/AttachmentViewerDialog";
import AttachmentUploadButton from "../../../../shared/components/AttachmentUploadButton";
import { payrollErrorMessage, payrollErrorCode } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatPeriod, formatDate } from "../../../../shared/utils/formatUtils";
import { listFrom } from "../../../../shared/attendance/normalize";
import { usePagedList } from "../../../../shared/attendance/usePagedList";
import { useAuth } from "../../../../shared/contexts/AuthContext";
import useToast from "../../../hr/payroll/useToast";
import PayrollToast from "../../../hr/payroll/PayrollToast";
import { periodOptions } from "../../../hr/payroll/variablePayMeta";
import { plural } from "../../../hr/payroll/runMeta";
import { benefitTypeLabel, enrollmentStatusMeta, effectiveContribution, normalizeMyBenefits } from "../../../../shared/utils/benefitMeta";
import {
  claimStatusMeta, claimStage, claimActions, normalizeClaimDetail, normalizeHeadroomRow,
  parseMoney, receiptNeeded, receiptRuleText, claimLimitText, periodLimitText, limitViolations, receiptProblem,
  CLAIM_STATUS_FILTERS,
} from "../../../../shared/utils/reimbursementMeta";

const PAGE_SIZE = 20;
const fieldCls = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none disabled:opacity-60";
const selectCls = "h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400";
const todayStr = () => new Date().toISOString().slice(0, 10);

function Spinner({ light = false }) {
  return <span className={`inline-block w-4 h-4 border-2 rounded-full animate-spin ${light ? "border-white/30 border-t-white" : "border-purple-200 border-t-purple-600"}`} />;
}

// #154 loaded once, shared by the claims editor and the limits tab.
function useMyCategories() {
  const [state, setState] = useState({ rows: [], status: "loading" });
  const reqRef = useRef(0);
  const reload = useCallback(async () => {
    const reqId = ++reqRef.current;
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const res = await payrollAPI.getMyReimbursementCategories();
      const rows = listFrom(res, ["categories", "rows", "records"]).map(normalizeHeadroomRow);
      if (reqId !== reqRef.current) return;
      setState({ rows, status: "ready" });
    } catch {
      if (reqId === reqRef.current) setState((s) => ({ ...s, status: "error" }));
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const byId = useMemo(() => {
    const map = new Map();
    for (const r of state.rows) if (r.category?.id) map.set(r.category.id, r);
    return map;
  }, [state.rows]);
  return { rows: state.rows, byId, status: state.status, reload };
}

// ── Claim editor (#155 create / #158 replace / #159 submit) ──────────────────
const newItem = () => ({ key: Math.random().toString(36).slice(2), id: null, category_id: "", expense_date: todayStr(), merchant: "", description: "", amount: "", attachments: [] });

function itemsFromClaim(claim) {
  const items = Array.isArray(claim?.items) ? claim.items : [];
  if (items.length === 0) return [newItem()];
  return items.map((it) => ({
    key: it.id || Math.random().toString(36).slice(2),
    id: it.id || null,
    category_id: it.category_id || "",
    expense_date: it.expense_date ? String(it.expense_date).slice(0, 10) : todayStr(),
    merchant: it.merchant || "",
    description: it.description || "",
    amount: it.amount != null ? String(it.amount) : "",
    attachments: Array.isArray(it.attachments) ? it.attachments : [],
  }));
}

const itemsSig = (items) => JSON.stringify(items.map((it) => ({ c: it.category_id, d: it.expense_date, a: String(it.amount ?? ""), m: it.merchant || "", s: it.description || "" })));

function ClaimEditorDialog({ claim, categories, onClose, onSaved, onSubmitted, showToast, onViewAttachment }) {
  const [claimId, setClaimId] = useState(claim?.id || null);
  const [title, setTitle] = useState(claim?.title || "");
  const [items, setItems] = useState(() => itemsFromClaim(claim));
  const [savedSig, setSavedSig] = useState(() => (claim?.id ? itemsSig(itemsFromClaim(claim)) : null));
  const [savedTitle, setSavedTitle] = useState(claim?.title || "");
  const [busy, setBusy] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [badItemKey, setBadItemKey] = useState("");
  const busyRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = busy ? () => {} : onClose;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const isNew = !claimId;
  const dirty = isNew || title.trim() !== savedTitle.trim() || itemsSig(items) !== savedSig;

  const setItem = (key, patch) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const addItem = () => setItems((list) => [...list, newItem()]);
  const removeItem = (key) => setItems((list) => (list.length > 1 ? list.filter((it) => it.key !== key) : list));

  const itemError = (it) => {
    if (!it.category_id) return "Choose a category.";
    if (!it.expense_date) return "Add the date you paid.";
    if (it.expense_date > todayStr()) return "Use the date you paid, not a future date.";
    if (Number.isNaN(parseMoney(it.amount))) return "Enter an amount above 0.";
    return "";
  };
  const validItems = items.every((it) => !itemError(it));

  const buildPayload = () => ({
    title: title.trim(),
    items: items.map((it, i) => ({
      category_id: it.category_id,
      expense_date: it.expense_date,
      amount: parseMoney(it.amount),
      merchant: it.merchant.trim() || undefined,
      description: it.description.trim() || undefined,
      display_order: i,
    })),
  });

  const reseed = (saved) => {
    const detail = normalizeClaimDetail(saved);
    setClaimId(detail.id);
    const seeded = itemsFromClaim(detail);
    setItems(seeded);
    setSavedSig(itemsSig(seeded));
    setSavedTitle(detail.title || "");
    return detail;
  };

  // Save the draft. Returns the saved detail, or null when it couldn't save / was aborted.
  const saveDraft = async ({ announce = true } = {}) => {
    setTouched(true);
    if (title.trim().length < 3) { setError("Give the claim a title (at least 3 characters)."); return null; }
    if (!validItems) { setError("Check the highlighted expenses."); return null; }
    if (!isNew && !dirty) { if (announce) showToast("No changes to save."); return normalizeClaimDetail({ ...claim, id: claimId, title, items }); }
    // G5-3: replacing items removes their receipts.
    if (!isNew) {
      const withReceipts = items.reduce((n, it) => n + (it.attachments?.length || 0), 0);
      if (withReceipts > 0) {
        const ok = await window.confirm(`Saving these changes removes the ${plural(withReceipts, "receipt")} already attached, because every item is saved again. Continue?`);
        if (!ok) return null;
      }
    }
    busyRef.current = true;
    setBusy("save");
    setError("");
    try {
      const res = isNew ? await payrollAPI.createMyReimbursementClaim(buildPayload()) : await payrollAPI.replaceMyReimbursementClaim(claimId, buildPayload());
      const detail = reseed(res?.data ?? res);
      onSaved?.();
      if (announce) showToast(isNew ? "Draft saved. You can attach receipts now." : "Draft saved.");
      return detail;
    } catch (err) {
      const code = payrollErrorCode(err);
      if (code === "CLAIM_NOT_DRAFT") { showToast(payrollErrorMessage(err), "error"); closeRef.current(); }
      else setError(payrollErrorMessage(err, "Couldn't save this draft."));
      return null;
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };

  const submit = async () => {
    if (busyRef.current) return;
    setTouched(true);
    if (title.trim().length < 3) { setError("Give the claim a title (at least 3 characters)."); return; }
    if (items.length === 0 || !validItems) { setError("Add at least one valid expense before submitting."); return; }
    // Save first if there are unsaved changes (this may remove receipts, per G5-3).
    let workingId = claimId;
    let workingItems = items;
    if (isNew || dirty) {
      const saved = await saveDraft({ announce: false });
      if (!saved) return;
      workingId = saved.id;
      workingItems = itemsFromClaim(saved);
    }
    // Receipt-required check on the saved state.
    const missing = workingItems.filter((it) => {
      const cat = categories.byId.get(it.category_id)?.category;
      return receiptNeeded(cat, it.amount) && (it.attachments?.length || 0) === 0;
    });
    if (missing.length > 0) {
      const names = missing.map((it) => categories.byId.get(it.category_id)?.category?.name || "an expense").join(", ");
      setError(`Attach a receipt for: ${names}.`);
      return;
    }
    const total = workingItems.reduce((sum, it) => sum + (parseMoney(it.amount) || 0), 0);
    const ok = await window.confirm(`Submit ${formatMoney(total)} for approval? You can't edit it after this, but you can withdraw it until HR gives final approval.`);
    if (!ok) return;
    busyRef.current = true;
    setBusy("submit");
    setError("");
    try {
      const res = await payrollAPI.submitMyReimbursementClaim(workingId);
      onSubmitted?.(res?.data ?? res);
    } catch (err) {
      const code = payrollErrorCode(err);
      if (code === "RECEIPT_REQUIRED") { setBadItemKey(receiptProblem(err)); setError(payrollErrorMessage(err)); }
      else if (code === "CATEGORY_LIMIT_EXCEEDED") setError([payrollErrorMessage(err), ...limitViolations(err).map((v) => (typeof v === "string" ? v : v.message || ""))].filter(Boolean).join(" "));
      else setError(payrollErrorMessage(err, "Couldn't submit this claim."));
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };

  const onReceiptUploaded = (key, attachment) => {
    setItem(key, { attachments: [...(items.find((it) => it.key === key)?.attachments || []), attachment] });
  };
  const onReceiptDeleted = async (key, attachment) => {
    if (!(await window.confirm(`Remove ${attachment.file_name}?`))) return;
    try {
      await payrollAPI.deleteMyAttachment(attachment.id);
      setItem(key, { attachments: (items.find((it) => it.key === key)?.attachments || []).filter((a) => a.id !== attachment.id) });
      showToast("Receipt removed.");
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't remove this receipt."), "error");
    }
  };

  const catOptions = categories.rows.map((r) => r.category).filter((c) => c?.is_active !== false);
  const noCategories = categories.status === "ready" && catOptions.length === 0;
  const canEdit = categories.status === "ready" && catOptions.length > 0;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-purple-950/40 backdrop-blur-sm p-3 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div role="dialog" aria-modal="true" aria-label="Reimbursement claim" className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[94vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 sm:px-8 py-5 border-b border-purple-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{claim ? "Edit claim" : "New claim"}</h2>
            <p className="text-sm text-slate-500 mt-0.5">Add each expense, attach receipts where needed, then submit for approval.</p>
          </div>
          <button type="button" onClick={() => closeRef.current()} disabled={!!busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 sm:px-8 py-6 space-y-5 overflow-y-auto">
          <div>
            <label htmlFor="claim-title" className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Title <span className="text-rose-500">*</span></label>
            <input id="claim-title" value={title} maxLength={200} onChange={(e) => { setTitle(e.target.value); setError(""); }} placeholder="e.g. Client visit — Mumbai" className={`${fieldCls} max-w-xl`} aria-invalid={touched && title.trim().length < 3} />
          </div>

          {categories.status === "error" ? (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">Couldn&apos;t load categories. Close this and try again.</p>
          ) : categories.status === "loading" ? (
            <div className="py-6"><Skeleton type="table" rows={2} /></div>
          ) : noCategories ? (
            <div className="rounded-xl border border-dashed border-purple-200 bg-purple-50/40 px-4 py-8 text-center">
              <HiReceiptRefund className="w-8 h-8 text-purple-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">No reimbursement categories are available yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">Your organization hasn&apos;t set up any expense categories to claim against. Please ask your HR team to add reimbursement categories, then come back to file a claim.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((it, idx) => {
                const cat = categories.byId.get(it.category_id)?.category;
                const err = touched ? itemError(it) : "";
                const needs = receiptNeeded(cat, it.amount) && (it.attachments?.length || 0) === 0;
                const flagged = badItemKey && it.id === badItemKey;
                return (
                  <div key={it.key} className={`rounded-xl border p-3.5 ${flagged ? "border-rose-300 bg-rose-50/40" : "border-purple-100 bg-purple-50/30"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-purple-700 uppercase">Expense {idx + 1}</span>
                      {items.length > 1 && <button type="button" onClick={() => removeItem(it.key)} className="text-slate-400 hover:text-rose-600 transition" aria-label="Remove expense"><HiTrash className="w-4 h-4" /></button>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Category</label>
                        <select value={it.category_id} onChange={(e) => setItem(it.key, { category_id: e.target.value })} className={fieldCls} aria-invalid={!!err && !it.category_id}>
                          <option value="">Choose</option>
                          {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Date paid</label>
                        <input type="date" max={todayStr()} value={it.expense_date} onChange={(e) => setItem(it.key, { expense_date: e.target.value })} className={fieldCls} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Merchant</label>
                        <input value={it.merchant} maxLength={150} onChange={(e) => setItem(it.key, { merchant: e.target.value })} placeholder="Optional" className={fieldCls} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Amount</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                          <input type="number" inputMode="decimal" min="0.01" step="0.01" value={it.amount} onChange={(e) => setItem(it.key, { amount: e.target.value })} className={`${fieldCls} pl-7`} aria-invalid={!!err} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Description</label>
                      <input value={it.description} maxLength={1000} onChange={(e) => setItem(it.key, { description: e.target.value })} placeholder="Optional" className={fieldCls} />
                    </div>

                    {/* Receipts */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {(it.attachments || []).map((att) => (
                        <span key={att.id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-white border border-purple-200 text-xs text-slate-700">
                          <HiCheck className="w-3.5 h-3.5 text-violet-600" />
                          <span className="max-w-[140px] truncate">{att.file_name}</span>
                          <button type="button" onClick={() => onViewAttachment(att)} className="text-purple-600 hover:text-purple-800" aria-label="View receipt"><HiEye className="w-3.5 h-3.5" /></button>
                          <button type="button" onClick={() => onReceiptDeleted(it.key, att)} className="text-slate-400 hover:text-rose-600" aria-label="Remove receipt"><HiTrash className="w-3.5 h-3.5" /></button>
                        </span>
                      ))}
                      {it.id && !isNew && !dirty ? (
                        <AttachmentUploadButton
                          issue={(meta) => payrollAPI.requestClaimReceiptUpload(claimId, it.id, meta)}
                          confirm={(id) => payrollAPI.confirmMyAttachment(id)}
                          label="Add receipt"
                          onUploaded={(attachment) => { onReceiptUploaded(it.key, attachment); showToast("Receipt attached."); }}
                        />
                      ) : (
                        <span className="text-[11px] text-slate-500">Save the draft to attach receipts.</span>
                      )}
                      {needs && <span className="text-[11px] font-semibold text-fuchsia-600">Receipt needed</span>}
                    </div>
                    {cat && (
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        {receiptRuleText(cat, formatMoney) !== "Not needed" ? `Receipt ${receiptRuleText(cat, formatMoney).toLowerCase()}. ` : ""}
                        {cat.max_amount_per_claim ? `Up to ${claimLimitText(cat, formatMoney)} per claim. ` : ""}
                        {categories.byId.get(it.category_id)?.remaining != null ? `${formatMoney(categories.byId.get(it.category_id).remaining)} left this period.` : ""}
                      </p>
                    )}
                    {err && <p className="text-xs font-semibold text-rose-600 mt-1.5">{err}</p>}
                  </div>
                );
              })}
              <button type="button" onClick={addItem} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition"><HiPlus className="w-4 h-4" /> Add expense</button>
            </div>
          )}

          {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">{error}</p>}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 sm:px-8 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <button type="button" onClick={() => closeRef.current()} disabled={!!busy} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">Close</button>
          <button type="button" onClick={() => saveDraft()} disabled={!!busy || !canEdit} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 transition disabled:opacity-50 flex justify-center items-center gap-2">
            {busy === "save" ? <Spinner /> : "Save draft"}
          </button>
          <button type="button" onClick={submit} disabled={!!busy || !canEdit} className="sm:min-w-[160px] px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-purple-600 hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 flex justify-center items-center gap-2">
            {busy === "submit" ? <Spinner light /> : "Save & submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── My claims tab ────────────────────────────────────────────────────────────
function ClaimsTab({ showToast, categories }) {
  const [filters, setFilters] = useState({ status: "", payout_period_month: "" });
  const months = useMemo(() => periodOptions({ back: 18, ahead: 6 }), []);
  const [editorClaim, setEditorClaim] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [withdrawTarget, setWithdrawTarget] = useState(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [viewAttachment, setViewAttachment] = useState(null);
  const busyRef = useRef(false);
  const detailReq = useRef(0);

  const filterKey = JSON.stringify(filters);
  const fetchPage = useCallback(({ page, limit }) => {
    const params = { page, limit };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    return payrollAPI.getMyReimbursementClaims(params);
  }, [filters]);
  const list = usePagedList(fetchPage, { limit: PAGE_SIZE, keys: ["claims", "rows", "records"], filterKey });

  const reloadDetail = async (id, { notifyOnError = false } = {}) => {
    const reqId = ++detailReq.current;
    setDetailLoading(true);
    try {
      const res = await payrollAPI.getMyReimbursementClaim(id);
      const full = normalizeClaimDetail(res?.data ?? res);
      if (reqId !== detailReq.current) return;
      setDetail((d) => (d && d.id === id ? { ...d, ...full } : d));
    } catch (err) {
      if (reqId === detailReq.current && notifyOnError) showToast(payrollErrorMessage(err, "Couldn't load the full claim."), "error");
      if (payrollErrorCode(err) === "FORBIDDEN" || payrollErrorCode(err) === "CLAIM_NOT_FOUND") { closeDetail(); list.reload(); }
    } finally {
      if (reqId === detailReq.current) setDetailLoading(false);
    }
  };
  const openDetail = (claim) => { setDetail(claim); reloadDetail(claim.id, { notifyOnError: true }); };
  const closeDetail = () => { detailReq.current += 1; setDetail(null); setDetailLoading(false); };

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const guarded = async (key, run, failMessage) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyKey(key);
    try {
      const message = await run();
      if (message) { showToast(message); closeDetail(); list.reload(); categories.reload(); }
    } catch (err) {
      showToast(payrollErrorMessage(err, failMessage), "error");
      if (detail) reloadDetail(detail.id);
    } finally {
      busyRef.current = false;
      setBusyKey("");
    }
  };

  const submitClaim = (claim) => guarded(`submit:${claim.id}`, async () => {
    const ok = await window.confirm(`Submit ${formatMoney(claim.total_amount)} for approval? You can't edit it after this, but you can withdraw it until HR gives final approval.`);
    if (!ok) return null;
    const res = await payrollAPI.submitMyReimbursementClaim(claim.id);
    const saved = res?.data ?? res;
    return saved?.approvals?.[0]?.approver_role === "hr" ? `Submitted as ${saved.claim_number || "your claim"}. It's with HR.` : `Submitted as ${saved.claim_number || "your claim"}. It's with your manager.`;
  }, "Couldn't submit this claim.");

  const discardDraft = (claim) => guarded(`discard:${claim.id}`, async () => {
    if (!(await window.confirm("Discard this draft? This can't be undone."))) return null;
    await payrollAPI.cancelMyReimbursementClaim(claim.id);
    return "Draft discarded.";
  }, "Couldn't discard this draft.");

  const submitWithdraw = async (reason) => {
    if (!withdrawTarget) return;
    setWithdrawBusy(true);
    setWithdrawError("");
    try {
      await payrollAPI.cancelMyReimbursementClaim(withdrawTarget.id, reason);
      setWithdrawTarget(null);
      closeDetail();
      showToast("Claim withdrawn. Nothing will be paid.");
      list.reload();
      categories.reload();
    } catch (err) {
      setWithdrawError(payrollErrorMessage(err, "Couldn't withdraw this claim."));
    } finally {
      setWithdrawBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <select aria-label="Status" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={selectCls}>
            {CLAIM_STATUS_FILTERS.self.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Pay month" value={filters.payout_period_month} onChange={(e) => setFilter("payout_period_month", e.target.value)} className={selectCls}>
            <option value="">Any pay month</option>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button type="button" onClick={() => list.reload()} aria-label="Refresh" title="Refresh" className="h-10 px-3 text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition"><HiRefresh className="w-4 h-4" /></button>
        </div>
        <button type="button" onClick={() => setEditorClaim(null)} className="h-10 px-4 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200"><HiPlus className="w-5 h-5" /> New claim</button>
      </div>

      {list.loading ? <Skeleton type="table" rows={6} /> : list.error ? (
        <div className="py-12 px-6 text-center bg-white rounded-2xl border border-rose-200">
          <HiExclamationCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-rose-700">{payrollErrorMessage(list.error, "Couldn't load your claims.")}</p>
          <button type="button" onClick={() => list.reload()} className="mt-4 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">Try again</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <th className="px-5 py-4 border-b border-slate-100">Claim</th>
                  <th className="px-5 py-4 border-b border-slate-100">Created</th>
                  <th className="px-5 py-4 border-b border-slate-100 text-right">Claimed</th>
                  <th className="px-5 py-4 border-b border-slate-100 text-right">Approved</th>
                  <th className="px-5 py-4 border-b border-slate-100">Status</th>
                  <th className="px-5 py-4 border-b border-slate-100">Pay month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {list.items.map((claim) => {
                  const status = claimStatusMeta(claim.status);
                  const stage = claimStage(claim);
                  const openLabel = `View claim ${claim.claim_number || "draft"}`;
                  return (
                    <tr key={claim.id} {...rowPreviewProps(() => openDetail(claim), openLabel)}>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800">{claim.status === "draft" ? "Draft" : claim.claim_number || "N/A"}</p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[240px]">{claim.title || "N/A"}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{claim.created_at ? formatDate(claim.created_at) : "N/A"}</td>
                      <td className="px-5 py-4 text-right tabular-nums font-semibold text-slate-800">{formatMoney(claim.total_amount)}</td>
                      <td className="px-5 py-4 text-right tabular-nums text-slate-600">{["approved", "processed"].includes(claim.status) && claim.approved_amount != null ? formatMoney(claim.approved_amount) : "N/A"}</td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${status.pill}`}>{status.label}</span>
                        <p className="text-[11px] text-slate-400 mt-1">{stage.label}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{claim.payout_period_month ? formatPeriod(claim.payout_period_month) : "N/A"}</td>
                    </tr>
                  );
                })}
                {list.items.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    {Object.values(filters).some(Boolean) ? "No claims match these filters." : "No claims yet. Create one to get a work expense reimbursed."}
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

      {editorClaim !== undefined && (
        <ClaimEditorDialog
          claim={editorClaim}
          categories={categories}
          showToast={showToast}
          onViewAttachment={setViewAttachment}
          onClose={() => setEditorClaim(undefined)}
          onSaved={() => list.reload()}
          onSubmitted={(saved) => {
            setEditorClaim(undefined);
            showToast(saved?.approvals?.[0]?.approver_role === "hr" ? `Submitted as ${saved.claim_number || "your claim"}. It's with HR.` : `Submitted as ${saved?.claim_number || "your claim"}. It's with your manager.`);
            list.reload();
            categories.reload();
          }}
        />
      )}

      {detail && (() => {
        const acts = claimActions(detail, { audience: "self" });
        const busy = detailLoading || !!busyKey;
        return (
          <DetailDialog
            eyebrow="My claim"
            icon={HiReceiptRefund}
            title={detail.status === "draft" ? "Draft claim" : detail.claim_number || "Claim"}
            subtitle={detail.title}
            badge={<DetailPill tone="onDark">{claimStatusMeta(detail.status).label}</DetailPill>}
            loading={detailLoading}
            onClose={closeDetail}
            footer={(acts.canEdit || acts.canSubmit || acts.canDiscard || acts.canWithdraw) ? (
              <>
                {acts.canDiscard && <button type="button" onClick={() => discardDraft(detail)} disabled={busy} className="sm:mr-auto px-4 py-2.5 text-sm font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50">{busyKey === `discard:${detail.id}` ? <Spinner /> : <HiTrash className="w-4 h-4" />} Discard draft</button>}
                {acts.canWithdraw && <button type="button" onClick={() => { setWithdrawError(""); setWithdrawTarget(detail); }} disabled={busy} className="sm:mr-auto px-4 py-2.5 text-sm font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50"><HiX className="w-4 h-4" /> Withdraw</button>}
                {acts.canEdit && <button type="button" onClick={() => { closeDetail(); setEditorClaim(detail); }} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50"><HiPencil className="w-4 h-4" /> Edit</button>}
                {acts.canSubmit && <button type="button" onClick={() => submitClaim(detail)} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50">{busyKey === `submit:${detail.id}` ? <Spinner light /> : <HiCheck className="w-4 h-4" />} Submit</button>}
              </>
            ) : !detailLoading && <DetailFooterNote>{acts.reason}</DetailFooterNote>}
          >
            <ClaimDetailSections claim={detail} audience="self" onViewAttachment={setViewAttachment} />
          </DetailDialog>
        );
      })()}

      {withdrawTarget && (
        <ReasonDialog
          title="Withdraw this claim?"
          description={`${withdrawTarget.claim_number || "Claim"} · ${formatMoney(withdrawTarget.total_amount)}. Nothing will be paid.`}
          label="Why are you withdrawing it?"
          confirmLabel="Withdraw claim"
          tone="danger"
          busy={withdrawBusy}
          error={withdrawError}
          onSubmit={submitWithdraw}
          onClose={() => { if (!withdrawBusy) setWithdrawTarget(null); }}
        />
      )}

      {viewAttachment && <AttachmentViewerDialog attachment={viewAttachment} getViewUrl={payrollAPI.getMyAttachmentViewUrl} onClose={() => setViewAttachment(null)} />}
    </>
  );
}

// ── Spending limits tab ──────────────────────────────────────────────────────
function LimitsTab({ categories }) {
  if (categories.status === "loading") return <Skeleton type="table" rows={4} />;
  if (categories.status === "error") return (
    <div className="py-12 px-6 text-center bg-white rounded-2xl border border-rose-200">
      <HiExclamationCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
      <p className="text-sm font-semibold text-rose-700">Couldn&apos;t load your spending limits.</p>
      <button type="button" onClick={categories.reload} className="mt-4 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">Try again</button>
    </div>
  );
  return (
    <>
      <p className="text-xs text-slate-500 mb-3">Only approved claims are counted. Claims still waiting for approval are not subtracted yet.</p>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                <th className="px-5 py-4 border-b border-slate-100">Category</th>
                <th className="px-5 py-4 border-b border-slate-100">Receipt rule</th>
                <th className="px-5 py-4 border-b border-slate-100 text-right">Per claim</th>
                <th className="px-5 py-4 border-b border-slate-100">Period limit</th>
                <th className="px-5 py-4 border-b border-slate-100 text-right">Used</th>
                <th className="px-5 py-4 border-b border-slate-100 text-right">Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {categories.rows.map((r) => {
                const c = r.category;
                return (
                  <tr key={c.id}>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-800">{c.name}</p>
                      {c.description && <p className="text-[11px] text-slate-400 max-w-[260px]">{c.description}</p>}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{receiptRuleText(c, formatMoney)}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-slate-700">{claimLimitText(c, formatMoney)}</td>
                    <td className="px-5 py-4 text-slate-600">{periodLimitText(c, formatMoney)}{r.period_key ? <span className="block text-[11px] text-slate-400">{r.period_key}</span> : null}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-slate-600">{r.consumed != null ? formatMoney(r.consumed) : "N/A"}</td>
                    <td className="px-5 py-4 text-right tabular-nums font-semibold text-slate-800">{r.remaining != null ? formatMoney(r.remaining) : "No limit"}</td>
                  </tr>
                );
              })}
              {categories.rows.length === 0 && <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">No categories are open for claims yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── My benefits tab ──────────────────────────────────────────────────────────
function BenefitsTab() {
  const [state, setState] = useState({ data: null, status: "loading" });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const res = await payrollAPI.getMyBenefits();
      setState({ data: normalizeMyBenefits(res), status: "ready" });
    } catch {
      setState((s) => ({ ...s, status: "error" }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (state.status === "loading") return <Skeleton type="card" />;
  if (state.status === "error") return (
    <div className="py-12 px-6 text-center bg-white rounded-2xl border border-rose-200">
      <HiExclamationCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
      <p className="text-sm font-semibold text-rose-700">Couldn&apos;t load your benefits.</p>
      <button type="button" onClick={load} className="mt-4 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">Try again</button>
    </div>
  );

  const { data } = state;
  const enrollments = data.enrollments || [];
  return (
    <div className="space-y-5">
      <DetailStats
        items={[
          { label: "Financial year", value: data.financialYear || "N/A" },
          { label: "Deducted this year", value: data.fyDeducted != null ? formatMoney(data.fyDeducted) : formatMoney(0) },
          { label: "Active enrollments", value: String(data.count) },
        ]}
      />
      {enrollments.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-sm">
          <HiHeart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">You aren&apos;t enrolled in any company benefit.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {enrollments.map((en, i) => {
            const plan = en.plan || {};
            const contrib = effectiveContribution(en, plan);
            const status = enrollmentStatusMeta(en.status);
            return (
              <div key={en.id || i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-800">{plan.name || "Benefit plan"}</p>
                    <p className="text-[11px] text-slate-400">{benefitTypeLabel(plan.benefit_type)}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase ${status.pill}`}>{status.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="rounded-xl bg-purple-50/70 border border-purple-100/80 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase text-purple-500">You pay / month</p>
                    <p className="text-sm font-semibold text-slate-800 tabular-nums">{contrib.employee != null ? formatMoney(contrib.employee) : "N/A"}{contrib.employeeOverridden && <span className="ml-1 text-[10px] text-purple-500">custom</span>}</p>
                  </div>
                  <div className="rounded-xl bg-purple-50/70 border border-purple-100/80 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase text-purple-500">Company pays / month</p>
                    <p className="text-sm font-semibold text-slate-800 tabular-nums">{contrib.employer != null ? formatMoney(contrib.employer) : "N/A"}</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-3">From {en.enrolled_from ? formatDate(en.enrolled_from) : "N/A"}{en.enrolled_to ? ` to ${formatDate(en.enrolled_to)}` : ""}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const TABS = [["claims", "My claims"], ["limits", "Spending limits"], ["benefits", "My benefits"]];

export default function MyReimbursementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuth();
  const { toast, showToast, hideToast } = useToast();
  const categories = useMyCategories();

  const rawTab = searchParams.get("tab");
  const tab = TABS.some(([v]) => v === rawTab) ? rawTab : "claims";
  useEffect(() => {
    if (rawTab && !TABS.some(([v]) => v === rawTab)) setSearchParams((p) => { const n = new URLSearchParams(p); n.set("tab", "claims"); return n; }, { replace: true });
  }, [rawTab, setSearchParams]);
  const setTab = (value) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("tab", value); return n; }, { replace: true });

  const subtitle = role === "hr" || role === "manager" ? "Your own claims and benefits." : "Claim work expenses and see your benefit enrollments.";

  return (
    <>
      <DashboardTopBar title="My Claims & Benefits" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">My Claims & Benefits</h1>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>

        <div className="flex items-center gap-1 border-b border-slate-200 mb-6">
          {TABS.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTab(value)} className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${tab === value ? "border-purple-600 text-purple-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{label}</button>
          ))}
        </div>

        {tab === "limits" ? <LimitsTab categories={categories} />
          : tab === "benefits" ? <BenefitsTab />
          : <ClaimsTab showToast={showToast} categories={categories} />}
      </main>

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}
