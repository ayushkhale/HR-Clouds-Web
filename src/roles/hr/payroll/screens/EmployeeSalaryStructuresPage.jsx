import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { fetchAllOrgEmployees } from "../../../../shared/utils/orgEmployees";
import { normalizePaginated } from "../../../../shared/attendance/normalize";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiPencil, HiUserGroup, HiClock, HiEye,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { StatutorySummary, StatutoryUnavailableNotice, RecalculationPendingNotice } from "../../../../shared/components/StatutoryBreakdown";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatDate } from "../../../../shared/utils/formatUtils";
import { normalizeStatutory } from "../../../../shared/utils/statutoryBreakdown";
import { costFromPreview, deductionsFromPreview, componentFlagsByCode, hasBalancingLine, solveCtcForTargetCost } from "../../../../shared/utils/employerStatutoryCost";
import CtcMoneyFlow from "../CtcMoneyFlow";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-violet-50 text-violet-700 border border-violet-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-violet-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

const REVISION_LABELS = {
  initial: "Initial", increment: "Increment", promotion: "Promotion",
  correction: "Correction", restructure: "Restructure",
};

const STRUCT_STATUS = {
  approved: "bg-violet-50 text-violet-700 border border-violet-200",
  proposed: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200",
  rejected: "bg-rose-50 text-rose-700 border border-rose-200",
  cancelled: "bg-slate-100 text-slate-500",
};

// Org employee rows carry `user_id` (the users.id every payroll route takes); they have no `id`.
const userId = (u) => u?.user_id ?? u?.id ?? u?._id;
// A failed lookup is not "no structure": showing "Not set" would invite a duplicate assignment.
const LOAD_ERROR = Symbol("load_error");

const STRUCTURE_KEYS = ["structures", "records"];
const PAGE_LIMIT = 100; // backend maximum
const MAX_PAGES = 50;

/**
 * Every employee's active structure as `user_id -> structure`, from the bulk
 * list endpoint. This grid used to fire one request per employee (N+1); it is
 * now one request per 100. Rows arrive with `employee` and `components`
 * embedded, so nothing secondary is needed to show the CTC.
 */
async function fetchAllCurrentStructures() {
  const first = await payrollAPI.getCurrentSalaryStructures({ page: 1, limit: PAGE_LIMIT });
  const firstPage = normalizePaginated(first, STRUCTURE_KEYS, { page: 1, limit: PAGE_LIMIT });
  const pages = Math.min(MAX_PAGES, firstPage.totalPages);
  const rest = pages > 1
    ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => payrollAPI.getCurrentSalaryStructures({ page: i + 2, limit: PAGE_LIMIT })))
    : [];

  const map = {};
  for (const row of [firstPage.items, ...rest.map((res) => normalizePaginated(res, STRUCTURE_KEYS).items)].flat()) {
    const id = row?.user_id;
    // Sorted created_at DESC, so the first row for a person is their latest.
    if (id && !map[id]) map[id] = row;
  }
  return map;
}
const userName = (u) => u?.name || u?.display_name || [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || u?.identifier || "Unknown";
const userDept = (u) => u?.department || u?.department_name || "N/A";

// ── Revision history (all statuses — HR needs the full audit picture, #17) ──
function HistoryModal({ user, onClose, showToast }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    payrollAPI.getEmployeeStructureHistory(userId(user))
      .then((res) => { if (!cancelled) setRows(res.data?.records || res.data || []); })
      .catch((err) => { if (!cancelled) { showToast(payrollErrorMessage(err, "Failed to load history"), "error"); setRows([]); } });
    return () => { cancelled = true; };
  }, [user, showToast]);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Salary history</h2>
            <p className="text-xs text-slate-500">{userName(user)}{userDept(user) !== "N/A" ? ` · ${userDept(user)}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto">
          {rows === null ? <Skeleton type="table" rows={4} /> : rows.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No salary structures on record yet.</p>
          ) : (
            <ol className="space-y-0">
              {rows.map((h, i) => {
                const isCurrent = h.status === "approved" && !h.effective_to;
                return (
                  <li key={h.id || i} className="relative pl-6 pb-6 last:pb-0 border-l-2 border-slate-100 last:border-transparent">
                    <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full ring-4 ring-white ${isCurrent ? "bg-purple-600" : "bg-slate-300"}`} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-slate-800">{formatMoney(h.annual_ctc)}</span>
                        <span className="text-xs text-slate-400">/ year</span>
                        {h.version != null && <span className="text-[11px] text-slate-400">v{h.version}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                          {REVISION_LABELS[h.revision_type] || h.revision_type || "Revision"}
                        </span>
                        {h.status && <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STRUCT_STATUS[h.status] || "bg-slate-100 text-slate-500"}`}>{h.status}</span>}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {formatDate(h.effective_from)} — {isCurrent ? "Present" : formatDate(h.effective_to)}
                    </p>
                    {h.revision_reason && <p className="text-xs text-slate-400 mt-1 italic">“{h.revision_reason}”</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Assign / revise, with preview-before-commit (#15, #16, #18) ────────────
function AssignModal({ user, templates, statutoryConfig, componentFlags, onClose, onDone, showToast }) {
  const [current, setCurrent] = useState(undefined); // undefined = loading, null = none
  const hasCurrent = !!current;
  // #18 enriches this read with the live PF / ESI / PT / TDS split, so HR can
  // see what the employee actually takes home before pricing a revision.
  const currentStatutory = useMemo(() => normalizeStatutory(current), [current]);
  const currentComponentDeductions = useMemo(
    () => (current?.components || [])
      .filter((c) => c.component_type === "deduction")
      .reduce((sum, c) => sum + (Number.parseFloat(c.monthly_amount) || 0), 0),
    [current],
  );

  const [form, setForm] = useState({
    annual_ctc: "",
    effective_from: new Date().toISOString().split("T")[0],
    revision_type: "initial",
    revision_reason: "",
    template_id: templates[0]?.id || "",
  });
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [solving, setSolving] = useState(false);

  // What the structure really costs. The CTC typed into the form becomes gross
  // pay in full — a balancing component absorbs whatever is left of it — and the
  // employer's PF and ESI are charged on top, so the real cost is always the
  // higher number. No endpoint previews statutory, so this is worked out from
  // the org's own config; it is an estimate and is labelled as one.
  //
  // Verified against the deployed backend 2026-09-19: `annual_ctc` is now all-in
  // and the evaluator reserves the employer's share, so `gap` is 0 on a
  // template-priced structure and the warning below stays hidden. It still
  // fires for anything priced under the old formula. See the header of
  // shared/utils/employerStatutoryCost.js for the measurements.
  const cost = useMemo(() => {
    if (!preview || !statutoryConfig) return null;
    const lines = preview.lines || [];
    const c = costFromPreview({ preview, flags: componentFlags, config: statutoryConfig });
    const enteredCtc = parseFloat(form.annual_ctc) || 0;
    // Since 2026-09-20 the preview is employee-scoped and carries the server's
    // own `statutory_breakdown`, which resolves professional tax and TDS. Those
    // two used to render as "Not estimated" because no client can know the
    // employee's state or declarations. Prefer the server block; fall back to
    // the local estimate only when it is absent.
    const deductions = deductionsFromPreview({ preview, flags: componentFlags, config: statutoryConfig });
    // Compare on the with-extras total: the evaluator reserves EDLI and PF admin
    // charges inside the CTC too, so leaving them out understated the real cost
    // by ₹1,800 a year on the live payload and produced a phantom negative gap.
    return { ...c, enteredCtc, deductions, lines, gap: c.annualCostWithExtras - enteredCtc, balancing: hasBalancingLine(lines) };
  }, [preview, statutoryConfig, componentFlags, form.annual_ctc]);

  // Load the employee's current structure so HR sees what they're revising (#18).
  useEffect(() => {
    let cancelled = false;
    payrollAPI.getEmployeeCurrentStructure(userId(user))
      .then((res) => {
        if (cancelled) return;
        const cur = res.data ?? null;
        setCurrent(cur);
        setForm((f) => ({ ...f, revision_type: cur ? "increment" : "initial" }));
      })
      .catch(() => { if (!cancelled) setCurrent(null); });
    return () => { cancelled = true; };
  }, [user]);

  // Preview invalidates whenever an input that affects it changes.
  const resetPreview = () => setPreview(null);

  const runPreview = async () => {
    if (!form.template_id || !form.annual_ctc) {
      showToast("Pick a template and enter a CTC to preview", "error");
      return;
    }
    setPreviewing(true);
    try {
      const res = await payrollAPI.previewTemplate(form.template_id, { annual_ctc: form.annual_ctc, user_id: userId(user) });
      setPreview(res.data || res);
    } catch (err) {
      // Evaluator 422s (NO_BASIC_COMPONENT, CTC_BELOW_FIXED_COMPONENTS, …) surface here, before commit.
      showToast(payrollErrorMessage(err, "Couldn't preview this structure"), "error");
    } finally {
      setPreviewing(false);
    }
  };

  /** Re-price so the *real* cost lands on the CTC HR originally budgeted. */
  const matchBudget = async () => {
    const target = parseFloat(form.annual_ctc) || 0;
    if (!form.template_id || target <= 0 || !statutoryConfig) return;
    setSolving(true);
    try {
      const result = await solveCtcForTargetCost({
        target,
        previewAt: async (ctc) => {
          const res = await payrollAPI.previewTemplate(form.template_id, { annual_ctc: Math.round(ctc).toString(), user_id: userId(user) });
          return res.data || res;
        },
        costOf: (p) => costFromPreview({ preview: p, flags: componentFlags, config: statutoryConfig }).annualCostWithExtras,
        tolerance: 1,
      });
      const ctc = Math.round(result.ctc).toString();
      // Re-preview first, then commit both together: updating the CTC on its own
      // would leave `cost` comparing the new figure against the old split.
      const res = await payrollAPI.previewTemplate(form.template_id, { annual_ctc: ctc, user_id: userId(user) });
      setForm((f) => ({ ...f, annual_ctc: ctc }));
      setPreview(res.data || res);
      showToast(result.converged
        ? `CTC set to ${formatMoney(ctc)} — the real cost now lands on ${formatMoney(target)}`
        : `Closest match is ${formatMoney(ctc)}. Check the figures before assigning.`, result.converged ? "success" : "error");
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't work out a matching CTC"), "error");
    } finally {
      setSolving(false);
    }
  };

  const reasonRequired = hasCurrent;

  // The preview is the only thing that knows whether this template can actually
  // be evaluated at this CTC. Assigning without one is how an unbalanced
  // structure reaches an employee's record and has to be corrected afterwards,
  // so the preview is a precondition, not a convenience: `reconciled` must be
  // true and the evaluated cost must land on the CTC that was typed in.
  const previewCtcCost = preview?.statutory_breakdown?.figures?.ctc_cost;
  const ctcMatches = previewCtcCost === undefined || previewCtcCost === null
    // An older backend sends no `ctc_cost`; `reconciled` is then all there is.
    ? true
    : Math.abs(Math.round(Number.parseFloat(previewCtcCost) * 100) - Math.round(((parseFloat(form.annual_ctc) || 0) / 12) * 100)) <= 1;

  const blockedReason = !preview
    ? "Preview the split before assigning."
    : !preview.reconciled
      ? "The components don't add up — this can't be assigned."
      : !ctcMatches
        ? "The evaluated cost doesn't match the CTC entered — re-preview before assigning."
        : "";

  const canSubmit =
    form.template_id && form.annual_ctc && form.effective_from &&
    (!reasonRequired || form.revision_reason.trim()) &&
    !blockedReason;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Build payload defensively: template-driven, so send template_id and never
      // an empty string (which would trip the template_id XOR components rule).
      const payload = {
        annual_ctc: form.annual_ctc,
        effective_from: form.effective_from,
        revision_type: form.revision_type,
        template_id: form.template_id,
      };
      if (form.revision_reason.trim()) payload.revision_reason = form.revision_reason.trim();

      const res = await payrollAPI.assignEmployeeStructure(userId(user), payload);
      const status = res.data?.status;
      showToast(status === "proposed"
        ? "Revision submitted — it needs a second HR user to approve"
        : "Salary structure assigned");
      onDone();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to assign structure"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{hasCurrent ? "Revise salary" : "Assign salary"}</h2>
            <p className="text-xs text-slate-500">{userName(user)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-4 min-w-0">
          {/* Current-structure context */}
          {current === undefined ? (
            <div className="h-12 rounded-xl bg-slate-100 animate-pulse" />
          ) : hasCurrent ? (
            <>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Current CTC</p>
                  <p className="text-sm font-bold text-slate-800">{formatMoney(current.annual_ctc)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Since</p>
                  <p className="text-sm font-semibold text-slate-600">{formatDate(current.effective_from)}{current.version != null ? ` · v${current.version}` : ""}</p>
                </div>
              </div>
              {/* Stale-model warning goes above the figures it applies to, so it
                  is read before them rather than as a footnote. */}
              <RecalculationPendingNotice statutory={currentStatutory} />
              {currentStatutory
                ? <StatutorySummary statutory={currentStatutory} componentDeductions={currentComponentDeductions} />
                : <StatutoryUnavailableNotice compact />}
            </>
          ) : (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">No salary structure yet — this will be the initial assignment.</p>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Template <span className="text-rose-500">*</span></label>
            <select required value={form.template_id} onChange={(e) => { setForm({ ...form, template_id: e.target.value }); resetPreview(); }}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
              <option value="">-- Select template --</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
            </select>
            {templates.length === 0 && <p className="text-xs text-fuchsia-600 mt-1">No templates exist yet. Create one under Structure Templates first.</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Annual CTC <span className="text-rose-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                <input type="number" required min="1" value={form.annual_ctc} onChange={(e) => { setForm({ ...form, annual_ctc: e.target.value }); resetPreview(); }}
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Effective from <span className="text-rose-500">*</span></label>
              <input type="date" required value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Revision type</label>
              <select value={form.revision_type} onChange={(e) => setForm({ ...form, revision_type: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                {!hasCurrent && <option value="initial">Initial</option>}
                <option value="increment">Increment</option>
                <option value="promotion">Promotion</option>
                <option value="correction">Correction</option>
                <option value="restructure">Restructure</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">
                Reason {reasonRequired && <span className="text-rose-500">*</span>}
              </label>
              <input type="text" value={form.revision_reason} onChange={(e) => setForm({ ...form, revision_reason: e.target.value })}
                placeholder={reasonRequired ? "Required for a revision" : "Optional"}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
            </div>
          </div>

            </div>

            {/* Right column — what the decision on the left actually costs. */}
            <div className="space-y-4 min-w-0">
          {/* Preview-before-commit */}
          <section className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-slate-50/80 border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><HiEye className="w-4 h-4 text-purple-500" /> Preview</h4>
              <button type="button" onClick={runPreview} disabled={previewing || !form.template_id || !form.annual_ctc}
                className="text-xs font-bold text-purple-600 hover:text-purple-800 disabled:opacity-40 disabled:cursor-not-allowed">
                {previewing ? "Calculating…" : "Preview split"}
              </button>
            </div>
            {preview ? (
              <div className="p-5">
                {/* The components now sum to GROSS, not the CTC — the employer's
                    share is reserved out first — so this no longer claims the CTC. */}
                <div className={`text-[11px] font-semibold rounded-xl px-3.5 py-2.5 flex items-start gap-2 ${preview.reconciled ? "text-violet-800 bg-violet-50 border border-violet-200" : "text-rose-700 bg-rose-50 border border-rose-200"}`}>
                  {preview.reconciled ? <HiCheckCircle className="w-4 h-4 shrink-0" /> : <HiExclamationCircle className="w-4 h-4 shrink-0" />}
                  <span>{preview.reconciled ? "The components add up exactly — nothing is unallocated." : "The components don't add up — check the template."}</span>
                </div>

                {/* The itemisation lives in "Where the money goes"; all this
                    has to answer is whether the spend lands on the budget. */}
                {cost && (
                  <div className="mt-3">
                    {Math.abs(cost.gap) <= 1 ? (
                      <p className="flex items-start gap-2 rounded-xl bg-violet-50 border border-violet-200 px-3.5 py-2.5 text-[11px] font-semibold text-violet-800">
                        <HiCheckCircle className="w-4 h-4 shrink-0" />
                        <span>Costs the company exactly the {formatMoney(cost.enteredCtc)} entered — the employer&apos;s statutory share is reserved inside it.</span>
                      </p>
                    ) : cost.gap > 1 ? (
                      <div className="rounded-xl bg-fuchsia-50 border border-fuchsia-200 px-3.5 py-2.5">
                        <p className="flex items-start gap-2 text-[11px] font-bold text-fuchsia-800">
                          <HiExclamationCircle className="w-4 h-4 shrink-0" />
                          <span>
                            Costs {formatMoney(cost.annualCostWithExtras)} — {formatMoney(cost.gap)} a year more than the{" "}
                            {formatMoney(cost.enteredCtc)} entered ({((cost.gap / cost.enteredCtc) * 100).toFixed(1)}% over).
                          </span>
                        </p>
                        {cost.balancing && (
                          <p className="text-[10px] text-fuchsia-700 mt-1 leading-relaxed">
                            The balancing component takes whatever is left of the CTC, so the whole CTC becomes gross pay and the employer&apos;s share is added on top of it.
                          </p>
                        )}
                        <button type="button" onClick={matchBudget} disabled={solving}
                          className="mt-2 w-full px-3 py-2 rounded-xl text-[11px] font-bold text-white bg-purple-600 hover:bg-purple-700 transition disabled:opacity-50">
                          {solving ? "Working out the CTC…" : `Re-price so the real cost is ${formatMoney(cost.enteredCtc)}`}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <p className="px-5 py-4 text-xs text-slate-500">Pick a template and enter a CTC, then preview to see exactly where the money goes before assigning.</p>
            )}
          </section>

          {cost && (
            <CtcMoneyFlow
              annualCtc={cost.enteredCtc || cost.annualCostWithExtras}
              cost={cost}
              deductions={cost.deductions}
              lines={cost.lines}
            />
          )}

            </div>
          </div>

          <div className="shrink-0 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
            {/* A disabled Assign button with no stated reason reads as a broken
                page. Name the one thing standing in the way. */}
            {blockedReason && (
              <p className="flex items-start gap-1.5 mb-2.5 text-[11px] font-semibold text-slate-500">
                <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 text-purple-500 mt-px" />
                <span>{blockedReason}</span>
              </p>
            )}
            <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
            <button type="submit" disabled={!canSubmit || submitting}
              className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
              {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (hasCurrent ? "Assign revision" : "Assign structure")}
            </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EmployeeSalaryStructuresPage() {
  const [employees, setEmployees] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [statutoryConfig, setStatutoryConfig] = useState(null);
  const [componentFlags, setComponentFlags] = useState({});
  const [ctcByUser, setCtcByUser] = useState({}); // userId -> current structure (or null)
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [assignUser, setAssignUser] = useState(null);
  const [historyUser, setHistoryUser] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // A newer load (or leaving the page) discards an older one's results.
  const loadReq = useRef(0);
  useEffect(() => () => { loadReq.current += 1; }, []);

  // After an assignment only that employee's figure changes; read just that row.
  const refreshOne = useCallback(async (user) => {
    const id = userId(user);
    setCtcByUser((m) => ({ ...m, [id]: undefined }));
    try {
      const res = await payrollAPI.getEmployeeCurrentStructure(id);
      setCtcByUser((m) => ({ ...m, [id]: res?.data ?? null }));
    } catch (err) {
      setCtcByUser((m) => ({ ...m, [id]: err?.status === 404 ? null : LOAD_ERROR }));
    }
  }, []);

  const loadData = useCallback(async () => {
    const reqId = ++loadReq.current;
    setLoading(true);
    // The roster names everyone (including people with no structure yet), the
    // bulk list carries the CTCs. Either can fail without blanking the screen.
    const [listRes, tplRes, ctcRes, cfgRes, compRes] = await Promise.allSettled([
      fetchAllOrgEmployees({ includeInactive: false }), // current employees only
      payrollAPI.getTemplates(),
      fetchAllCurrentStructures(),
      // Needed to show what a structure really costs before it is committed:
      // the rates, and which components count towards the PF / ESI wage.
      payrollAPI.getStatutoryConfig(),
      payrollAPI.getComponents({ is_active: true }),
    ]);
    if (reqId !== loadReq.current) return;

    setStatutoryConfig(cfgRes.status === "fulfilled" ? cfgRes.value.data || null : null);
    setComponentFlags(componentFlagsByCode(
      compRes.status === "fulfilled" ? compRes.value.data?.records || compRes.value.data || [] : [],
    ));

    const list = listRes.status === "fulfilled" ? listRes.value : [];
    if (listRes.status === "fulfilled") setEmployees(list);
    else showToast(payrollErrorMessage(listRes.reason, "Failed to load employees"), "error");

    if (tplRes.status === "fulfilled") setTemplates(tplRes.value.data?.records || tplRes.value.data || []);

    // Every employee gets an explicit entry: their structure, null (none yet) or
    // LOAD_ERROR. "Not set" must never stand in for a read that failed, or HR
    // would assign a second structure to someone who already has one.
    const next = {};
    if (ctcRes.status === "fulfilled") {
      list.forEach((u) => { next[userId(u)] = ctcRes.value[userId(u)] ?? null; });
    } else {
      list.forEach((u) => { next[userId(u)] = LOAD_ERROR; });
      showToast(payrollErrorMessage(ctcRes.reason, "Failed to load salary structures"), "error");
    }
    setCtcByUser(next);
    setLoading(false);
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <>
      <DashboardTopBar title="Employee Salary Structures" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Salary Assignment
          </h1>
          <p className="text-sm text-slate-500 mt-1">Review current pay, then assign or revise salary structures.</p>
        </div>

        {loading ? <Skeleton type="table" rows={6} /> : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4">Employee</th>
                    <th className="px-6 py-4">Department</th>
                    <th className="px-6 py-4 text-right">Current CTC</th>
                    <th className="px-6 py-4">Effective from</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {employees.map((user, i) => {
                    const cur = ctcByUser[userId(user)];
                    return (
                      <tr key={userId(user) || i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-800">{userName(user)}</p>
                          {user.email && <p className="text-xs text-slate-400">{user.email}</p>}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{userDept(user)}</td>
                        <td className="px-6 py-4 text-right tabular-nums">
                          {cur === undefined ? (
                            <span className="inline-block w-16 h-4 rounded bg-slate-100 animate-pulse" />
                          ) : cur === LOAD_ERROR ? (
                            <span className="text-xs font-semibold text-rose-500">Couldn&apos;t load</span>
                          ) : cur ? (
                            <span className="font-bold text-slate-800">{formatMoney(cur.annual_ctc)}</span>
                          ) : (
                            <span className="text-xs text-slate-400">Not set</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-500">{cur && cur !== LOAD_ERROR ? formatDate(cur.effective_from) : "N/A"}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => setHistoryUser(user)} title="Salary history"
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition">
                              <HiClock className="w-3.5 h-3.5" /> History
                            </button>
                            <button onClick={() => setAssignUser(user)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                              <HiPencil className="w-3.5 h-3.5" /> {cur ? "Revise" : "Assign"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {employees.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No employees found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {historyUser && <HistoryModal user={historyUser} onClose={() => setHistoryUser(null)} showToast={showToast} />}

      {assignUser && (
        <AssignModal
          user={assignUser}
          templates={templates}
          statutoryConfig={statutoryConfig}
          componentFlags={componentFlags}
          showToast={showToast}
          onClose={() => setAssignUser(null)}
          onDone={() => { const assigned = assignUser; setAssignUser(null); refreshOne(assigned); }}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
