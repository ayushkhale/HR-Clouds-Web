import React, { useState, useEffect, useCallback } from "react";
import { leaveAPI } from "../../../../shared/api";
import { leaveErrorMessage } from "../../../../shared/utils/leaveErrors";
import { noticeValue } from "../../../../shared/utils/leaveConfig";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiPencil,
  HiCalendar, HiInformationCircle, HiRefresh,
} from "react-icons/hi";

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
      {ok ? <HiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" /> : <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

// ─── Balance Card ─────────────────────────────────────────────────────────────
// Purple shades only.
const CARD_COLORS = [
  { bg: "bg-purple-50", border: "border-purple-100", accent: "text-purple-700", dot: "bg-purple-500" },
  { bg: "bg-violet-50", border: "border-violet-100", accent: "text-violet-700", dot: "bg-violet-500" },
  { bg: "bg-purple-100/60", border: "border-purple-200", accent: "text-purple-800", dot: "bg-purple-600" },
  { bg: "bg-violet-100/60", border: "border-violet-200", accent: "text-violet-800", dot: "bg-violet-600" },
];

/** Up to 4 balances share one row; larger sets use a column count that divides evenly. */
function balanceGridCols(count) {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "grid-cols-1 sm:grid-cols-3";
  if (count === 4) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
  if (count % 3 === 0) return "grid-cols-1 sm:grid-cols-3";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
}

const fmtDays = (n) => (Number.isFinite(n) ? (Number.isInteger(n) ? `${n}` : n.toFixed(1)) : "0");

function BalanceCard({ balance, index }) {
  const color = CARD_COLORS[index % CARD_COLORS.length];
  const current = parseFloat(balance.current_balance);
  const earned = parseFloat(balance.total_accrued);
  const taken = parseFloat(balance.total_used);

  return (
    <div className={`rounded-2xl border p-5 ${color.bg} ${color.border}`}>
      <div className="flex items-center gap-2 mb-3 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${color.dot}`} />
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide truncate">{balance.leave_type?.name || "Leave"}</p>
        {balance.leave_type?.code && (
          <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/70 shrink-0 ${color.accent}`}>
            {balance.leave_type.code}
          </span>
        )}
      </div>
      <p className={`text-3xl font-extrabold ${color.accent} mb-1`}>{fmtDays(current)}</p>
      <p className="text-xs text-slate-500 font-medium">days left</p>
      <div className="mt-3 pt-3 border-t border-white/70 flex gap-4 text-xs text-slate-500">
        <span><span className="font-semibold text-slate-700">{fmtDays(earned)}</span> given so far</span>
        <span><span className="font-semibold text-slate-700">{fmtDays(taken)}</span> taken</span>
      </div>
    </div>
  );
}

// ─── Customise Leave Rules Modal ──────────────────────────────────────────────
function CustomiseRulesModal({ userId, balance, onClose, onSaved }) {
  // The balances endpoint returns NO current-config object (see backend
  // clarification B1), so we cannot prefill the employee's real rule values.
  // Every field therefore starts blank and only fields the HR user actually
  // changes are sent — unsent fields keep their current server-side values, as
  // the backend contract guarantees ("Unsent fields remain at their current
  // values"). This prevents silently resetting accrual type / carry-forward /
  // probation / overdraft, and avoids capping the annual quota at a mid-year
  // partial `total_accrued`.
  const [form, setForm] = useState({
    assigned_annual_quota: "",
    accrual_type: "",
    max_carry_forward: "",
    probation_restriction_days: "",
    max_negative_balance: "",
    notice_mode: "",   // "" = unchanged; else unrestricted | blocked | capped
    notice_days: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); setError(""); }

  const isDirty = (v) => v !== "" && v !== null && v !== undefined;
  // notice_days alone is not a change; only a chosen notice_mode is.
  const dirtyCount = Object.entries(form)
    .filter(([k, v]) => k !== "notice_days" && isDirty(v)).length;

  async function handleSubmit(e) {
    e.preventDefault();
    if (dirtyCount === 0) {
      setError("Change at least one field. Blank fields keep their current values.");
      return;
    }
    if (form.notice_mode === "capped" && (form.notice_days === "" || parseInt(form.notice_days, 10) < 1)) {
      setError("Enter the most days allowed during the notice period, or choose No limit / Not allowed.");
      return;
    }
    setLoading(true); setError("");
    const payload = {};
    if (isDirty(form.assigned_annual_quota)) payload.assigned_annual_quota = parseFloat(form.assigned_annual_quota) || 0;
    if (isDirty(form.accrual_type)) payload.accrual_type = form.accrual_type;
    if (isDirty(form.max_carry_forward)) payload.max_carry_forward = parseFloat(form.max_carry_forward) || 0;
    if (isDirty(form.probation_restriction_days)) payload.probation_restriction_days = parseInt(form.probation_restriction_days) || 0;
    if (isDirty(form.max_negative_balance)) payload.max_negative_balance = parseFloat(form.max_negative_balance) || 0;
    if (isDirty(form.notice_mode)) payload.notice_period_max_days = noticeValue(form.notice_mode, form.notice_days);
    try {
      await leaveAPI.overrideConfig(userId, balance.leave_type_id, payload);
      onSaved("Leave rules updated for this employee. The balance was adjusted if needed.");
    } catch (err) {
      setError(leaveErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition";
  const labelClass = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-bold text-slate-800">Customise Leave Rules</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Change the <strong>{balance.leave_type?.name}</strong> rules for this employee only.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <HiX className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-purple-800 bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
            <HiInformationCircle className="w-4 h-4 shrink-0 mt-0.5 text-purple-500" />
            <span>
              Only the fields you fill in are changed — <strong>leave a field blank to keep it as it is</strong>.
              If you raise the days per year for leave that is <strong>given all at once</strong>, the extra days are added straight away.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Days per year</label>
              <input type="number" step="0.5" min="0" max="365" value={form.assigned_annual_quota} onChange={e => set("assigned_annual_quota", e.target.value)} placeholder="No change" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>
                How leave is given
                {!form.accrual_type && <span className="ml-2 normal-case font-normal text-slate-400">(no change)</span>}
              </label>
              <div className="flex gap-2 mt-1">
                {[{ v: "upfront", l: "All at once" }, { v: "monthly", l: "Every month" }].map(t => (
                  <label key={t.v} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${form.accrual_type === t.v ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`}>
                    <input type="radio" name="accrual_type_override" value={t.v} checked={form.accrual_type === t.v} onChange={() => set("accrual_type", t.v)} className="sr-only" />
                    {t.l}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Unused days kept for next year</label>
              <input type="number" step="0.5" min="0" value={form.max_carry_forward} onChange={e => set("max_carry_forward", e.target.value)} placeholder="No change" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Wait after joining (days)</label>
              <input type="number" step="1" min="0" value={form.probation_restriction_days} onChange={e => set("probation_restriction_days", e.target.value)} placeholder="No change" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Extra days allowed (below zero)</label>
              <input type="number" step="0.5" min="0" value={form.max_negative_balance} onChange={e => set("max_negative_balance", e.target.value)} placeholder="No change" className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Leave during notice period</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { v: "", l: "No change" },
                { v: "unrestricted", l: "No limit" },
                { v: "blocked", l: "Not allowed" },
                { v: "capped", l: "Limited" },
              ].map(opt => (
                <button type="button" key={opt.v || "unchanged"} onClick={() => set("notice_mode", opt.v)}
                  className={`py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${form.notice_mode === opt.v ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`}>
                  {opt.l}
                </button>
              ))}
            </div>
            {form.notice_mode === "capped" && (
              <input type="number" step="1" min="1" value={form.notice_days} onChange={e => set("notice_days", e.target.value)}
                placeholder="Most days allowed during notice period"
                className={`mt-2 ${inputClass}`} />
            )}
            <p className="text-[10px] text-slate-400 mt-1">"Not allowed" means no leave after resigning; "Limited" allows up to the number of days you enter.</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading || dirtyCount === 0} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-xl transition">
              {loading ? "Saving…" : dirtyCount === 0 ? "Change a field to save" : "Save changes"}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main LeaveTab Component ──────────────────────────────────────────────────
const LT_CURRENT_YEAR = new Date().getFullYear();
const LT_YEAR_OPTIONS = [LT_CURRENT_YEAR, LT_CURRENT_YEAR - 1, LT_CURRENT_YEAR - 2];

export default function LeaveTab({ userId }) {
  const [balances, setBalances] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [year, setYear] = useState(LT_CURRENT_YEAR);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [confirmAssign, setConfirmAssign] = useState(false);
  const [customiseTarget, setCustomiseTarget] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const loadBalances = useCallback(async () => {
    setBalancesLoading(true);
    try {
      const res = await leaveAPI.getUserBalances(userId, year);
      setBalances(res.data || []);
    } catch {
      showToast("Failed to load leave balances.", "error");
    } finally {
      setBalancesLoading(false);
    }
  }, [userId, year]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await leaveAPI.getTemplates();
      setTemplates(res.data || []);
    } catch {
      // Non-critical — don't block the UI
    }
  }, []);

  // Balances reload independently when the year changes (no full-tab skeleton).
  useEffect(() => { loadBalances(); }, [loadBalances]);

  useEffect(() => {
    setLoading(true);
    loadTemplates().finally(() => setLoading(false));
  }, [loadTemplates]);

  function handleAssignClick() {
    if (!selectedTemplateId) {
      showToast("Please select a policy template first.", "error");
      return;
    }
    // Show confirmation before destructive replace of existing configs
    setConfirmAssign(true);
  }

  async function executeAssign() {
    setConfirmAssign(false);
    setAssigning(true);
    try {
      await leaveAPI.assignPolicy(userId, { template_id: selectedTemplateId });
      showToast("Policy assigned! Leave balances have been added.");
      setSelectedTemplateId("");
      await loadBalances();
    } catch (err) {
      showToast(err.message || "Failed to assign policy.", "error");
    } finally {
      setAssigning(false);
    }
  }

  function onCustomiseSaved(msg) {
    setCustomiseTarget(null);
    showToast(msg);
    loadBalances();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-purple-50 rounded-2xl animate-pulse" />)}
        </div>
        <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Section 1: Balance Cards ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Leave Balances</h3>
            <p className="text-xs text-slate-400 mt-0.5">Leave days available to this employee.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white" title="Balance year">
              {LT_YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={loadBalances} disabled={balancesLoading} className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition disabled:opacity-50" title="Refresh">
              <HiRefresh className={`w-4 h-4 ${balancesLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {balancesLoading ? (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-purple-50 rounded-2xl animate-pulse" />)}
          </div>
        ) : balances.length === 0 ? (
          <div className="px-6 py-10 flex flex-col items-center gap-2 text-center">
            <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center mb-1">
              <HiCalendar className="w-6 h-6 text-purple-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No leave policy assigned</p>
            <p className="text-xs text-slate-400">{year === LT_CURRENT_YEAR ? "Assign a policy below to give this employee their leave days." : `No leave balances recorded for ${year}.`}</p>
          </div>
        ) : (
          <div className={`p-6 grid gap-4 ${balanceGridCols(balances.length)}`}>
            {balances.map((b, i) => <BalanceCard key={b.id || b.leave_type_id} balance={b} index={i} />)}
          </div>
        )}
      </div>

      {/* ── Section 2: Assign Policy ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Assign Policy</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Gives this employee the leave days from a policy template, adjusted for how much of the year is left. Any existing leave rules are replaced.
          </p>
        </div>
        <div className="p-6 flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="flex-1 w-full">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Select Policy Template</label>
            <select
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
            >
              <option value="">Choose a template...</option>
              {templates.map(t => {
                const entCount = t.entitlements?.length ?? 0;
                return (
                  <option key={t.id} value={t.id}>
                    {t.name}{entCount === 0 ? " ⚠ (empty)" : ""}
                  </option>
                );
              })}
            </select>
            {selectedTemplateId && templates.find(t => t.id === selectedTemplateId)?.entitlements?.length === 0 && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                <HiInformationCircle className="w-3.5 h-3.5" />
                This template has no leave types — the employee will get 0 leave days.
              </p>
            )}
          </div>
          <button
            onClick={handleAssignClick}
            disabled={assigning || !selectedTemplateId}
            className="shrink-0 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
          >
            {assigning ? "Assigning…" : "Assign Policy"}
          </button>
        </div>
      </div>

      {/* ── Section 3: Customise rules for this employee ── */}
      {balances.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Customise Leave Rules</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Change a leave type's rules for this employee only — the policy template stays the same for everyone else.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-slate-50">
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Leave Type</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Days Left</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Given / Taken</th>
                  <th className="px-6 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {balances.map((b) => (
                  <tr key={b.leave_type_id} className="hover:bg-purple-50/30 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{b.leave_type?.name || "N/A"}</span>
                        {b.leave_type?.code && <span className="font-mono text-[10px] font-bold bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">{b.leave_type.code}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm font-bold text-slate-700">{fmtDays(parseFloat(b.current_balance))} days</td>
                    <td className="px-6 py-3 text-xs text-slate-500">
                      {fmtDays(parseFloat(b.total_accrued))} given · {fmtDays(parseFloat(b.total_used))} taken
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => setCustomiseTarget(b)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition"
                        >
                          <HiPencil className="w-3.5 h-3.5" /> Customise
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {customiseTarget && (
        <CustomiseRulesModal
          userId={userId}
          balance={customiseTarget}
          onClose={() => setCustomiseTarget(null)}
          onSaved={onCustomiseSaved}
        />
      )}

      {/* Assign Policy Confirmation */}
      {confirmAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">Confirm Policy Assignment</h2>
              <p className="text-xs text-slate-400 mt-1.5">
                Assigning a new policy will{" "}
                <strong className="text-amber-600">replace all of this employee's current leave rules</strong>{" "}
                and recalculate their leave days based on how much of the year is left. This cannot be undone.
              </p>
            </div>
            <div className="p-6 flex gap-3">
              <button
                onClick={executeAssign}
                disabled={assigning}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition"
              >
                {assigning ? "Assigning…" : "Yes, Assign Policy"}
              </button>
              <button
                onClick={() => setConfirmAssign(false)}
                className="px-5 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
