// ─────────────────────────────────────────────────────────────────────────────
// ClaimDecisionDialog.jsx — Approve a reimbursement claim item by item, with
// trimming, per-item rejection and a live limit check against the claim's
// category_limits[]. Used by both the manager (level 1) and HR (final) reviews.
// Stacks on the claim DetailDialog at z-160.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { HiX, HiExclamationCircle } from "react-icons/hi";
import { formatDate, formatMoney } from "../utils/formatUtils";
import { itemBucketKey, LIMIT_PERIOD_LABEL, parseMoney, sameMoney } from "../utils/reimbursementMeta";
import { prettifyCode } from "../../roles/hr/payroll/runMeta";

const fieldCls = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none disabled:opacity-60";

export default function ClaimDecisionDialog({ claim, levelLabel, busy = false, error = "", violations = [], onSubmit, onClose }) {
  const items = useMemo(() => (Array.isArray(claim?.items) ? claim.items : []), [claim]);
  const limits = useMemo(() => (Array.isArray(claim?.limits) ? claim.limits : []), [claim]);

  const [rows, setRows] = useState(() => {
    const map = {};
    for (const it of items) {
      map[it.id] = {
        decision: it.item_status === "rejected" ? "rejected" : "approved",
        amount: String(it.approved_amount ?? it.amount ?? ""),
        remark: it.approver_remarks || "",
      };
    }
    return map;
  });
  const [remarks, setRemarks] = useState("");
  const [touched, setTouched] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busyRef.current) { e.stopPropagation(); onCloseRef.current?.(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const setRow = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  // Per-item validation.
  const itemError = (it) => {
    const row = rows[it.id];
    if (!row) return "";
    if (row.decision === "rejected") return row.remark.trim() ? "" : "Add a remark for the rejection.";
    const amount = parseMoney(row.amount);
    if (Number.isNaN(amount)) return "Enter an amount above 0.";
    if (Math.round(amount * 100) > Math.round(Number(it.amount) * 100)) return "Can't be more than the claimed amount.";
    if (!sameMoney(amount, it.amount) && !row.remark.trim()) return "Add a remark for the lower amount.";
    return "";
  };

  const anyItemError = items.some((it) => itemError(it));
  const allRejected = items.length > 0 && items.every((it) => rows[it.id]?.decision === "rejected");
  const approvedTotal = items.reduce((sum, it) => {
    const row = rows[it.id];
    if (!row || row.decision === "rejected") return sum;
    const amount = parseMoney(row.amount);
    return sum + (Number.isNaN(amount) ? 0 : amount);
  }, 0);

  // Live limit preview: limit − already approved − sum of approved items in this window.
  const limitPreview = useMemo(() => {
    return limits
      .map((row) => {
        if (row.limit === null || row.limit === undefined) return null;
        const sum = items.reduce((acc, it) => {
          const bucket = itemBucketKey(it, limits);
          if (!bucket || bucket.category_code !== row.category_code || bucket.period_key !== row.period_key) return acc;
          const r = rows[it.id];
          if (!r || r.decision === "rejected") return acc;
          const amount = parseMoney(r.amount);
          return acc + (Number.isNaN(amount) ? 0 : amount);
        }, 0);
        const after = Number(row.limit) - Number(row.prior_approved || 0) - sum;
        return { row, after, over: after < -0.005 };
      })
      .filter(Boolean);
  }, [limits, items, rows]);

  const overLimit = limitPreview.some((p) => p.over);
  const canSubmit = items.length > 0 && !anyItemError && !overLimit && !busy;

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    if (allRejected) {
      const ok = await window.confirm("Every item is rejected, so the whole claim will be rejected. Use Reject instead if you want to give one reason.");
      if (!ok) return;
    }
    const payload = {
      items: items.map((it) => {
        const row = rows[it.id];
        const rejected = row.decision === "rejected";
        return {
          item_id: it.id,
          item_status: rejected ? "rejected" : "approved",
          approved_amount: rejected ? 0 : parseMoney(row.amount),
          approver_remarks: row.remark.trim() || undefined,
        };
      }),
      remarks: remarks.trim() || undefined,
    };
    onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-purple-950/40 backdrop-blur-sm p-3 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCloseRef.current?.()}>
      <form onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-label="Review claim" className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-purple-100">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800">Review this claim</h2>
            <p className="text-sm text-slate-500 mt-0.5">{levelLabel || "Your approval"} · Approve each expense, lower it, or reject it. A lowered or rejected item needs a remark.</p>
          </div>
          <button type="button" onClick={() => onCloseRef.current?.()} disabled={busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition disabled:opacity-40" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div className="space-y-3">
            {items.map((it) => {
              const row = rows[it.id] || {};
              const rejected = row.decision === "rejected";
              const err = touched ? itemError(it) : "";
              return (
                <div key={it.id} className="rounded-xl border border-purple-100 bg-purple-50/30 p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{it.category_name || prettifyCode(it.category_code) || "Expense"}</p>
                      <p className="text-[11px] text-slate-400">{[it.expense_date ? formatDate(it.expense_date) : "", it.merchant].filter(Boolean).join(" · ") || "N/A"} · Claimed {formatMoney(it.amount)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-lg p-1" role="radiogroup" aria-label="Decision">
                      {["approved", "rejected"].map((d) => (
                        <button key={d} type="button" role="radio" aria-checked={row.decision === d} onClick={() => setRow(it.id, { decision: d })} className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${row.decision === d ? (d === "rejected" ? "bg-white text-rose-600 shadow-sm" : "bg-white text-purple-700 shadow-sm") : "text-slate-500 hover:text-slate-700"}`}>
                          {d === "approved" ? "Approve" : "Reject"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 mt-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Approved amount</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={rejected ? "0" : row.amount}
                          disabled={rejected}
                          onChange={(e) => setRow(it.id, { amount: e.target.value })}
                          className={`${fieldCls} pl-7`}
                          aria-invalid={!!err}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Remark {rejected ? "(required)" : ""}</label>
                      <input value={row.remark} maxLength={1000} onChange={(e) => setRow(it.id, { remark: e.target.value })} placeholder={rejected ? "Why is it rejected?" : "Only needed if you lower the amount"} className={fieldCls} />
                    </div>
                  </div>
                  {err && <p className="text-xs font-semibold text-rose-600 mt-1.5">{err}</p>}
                </div>
              );
            })}
            {items.length === 0 && <p className="text-sm text-slate-500 text-center py-6">This claim has no expenses to review.</p>}
          </div>

          {limitPreview.length > 0 && (
            <div className="rounded-xl border border-purple-100 bg-white p-3.5">
              <p className="text-[11px] font-bold text-purple-700 uppercase mb-2">Category limits</p>
              <ul className="space-y-1 text-xs">
                {limitPreview.map((p) => (
                  <li key={`${p.row.category_code}-${p.row.period_key}`} className={p.over ? "text-rose-600 font-semibold" : "text-slate-600"}>
                    {p.row.category_name || prettifyCode(p.row.category_code)} ({LIMIT_PERIOD_LABEL[p.row.limit_period] || "limit"})
                    {p.over
                      ? ` — ${formatMoney(Math.abs(p.after))} over the limit`
                      : ` — ${formatMoney(p.after)} left after this`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label htmlFor="claim-decision-remarks" className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Overall note (optional)</label>
            <textarea id="claim-decision-remarks" rows={2} maxLength={1000} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="A note for the record" className={`${fieldCls} resize-none`} />
          </div>

          {violations.length > 0 && (
            <div role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
              <p className="font-semibold">This goes over a spending limit:</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {violations.map((v, i) => <li key={i}>{typeof v === "string" ? v : v.message || JSON.stringify(v)}</li>)}
              </ul>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2"><HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}</p>}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-3 px-6 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <p className="text-xs text-slate-500">{allRejected ? "All items rejected — the whole claim will be rejected." : `Approving ${formatMoney(approvedTotal)} across ${items.filter((it) => rows[it.id]?.decision !== "rejected").length} of ${items.length} items.`}</p>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button type="button" onClick={() => onCloseRef.current?.()} disabled={busy} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">Go back</button>
            <button type="submit" disabled={!canSubmit} className="sm:min-w-[180px] px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-purple-600 hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
              {busy ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : allRejected ? "Reject all items" : `Approve ${formatMoney(approvedTotal)}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
