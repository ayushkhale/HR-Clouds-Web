import React, { useState, useEffect, useCallback } from "react";
import { leaveAPI } from "../../../../shared/api";
import { fmtDate, ymdOnly } from "../../../../shared/attendance/dates";
import { formatDayCount } from "../../../../shared/utils/formatUtils";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiPencil,
  HiCalendar, HiRefresh, HiClipboardCheck,
} from "react-icons/hi";
import AssignLeavePolicyDialog from "../../../../shared/leaves/AssignLeavePolicyDialog";
import CustomiseLeaveRulesDialog from "../../../../shared/leaves/CustomiseLeaveRulesDialog";
import { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${ok ? "bg-violet-50 text-violet-700 border border-violet-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
      {ok ? <HiCheckCircle className="w-5 h-5 text-violet-500 shrink-0" /> : <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0" />}
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
export function balanceGridCols(count) {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "grid-cols-1 sm:grid-cols-3";
  if (count === 4) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
  if (count % 3 === 0) return "grid-cols-1 sm:grid-cols-3";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
}

export function BalanceCard({ balance, index }) {
  const color = CARD_COLORS[index % CARD_COLORS.length];
  const current = parseFloat(balance.current_balance);
  const earned = parseFloat(balance.total_accrued);
  const taken = parseFloat(balance.total_used);

  return (
    <div className={`rounded-2xl border p-5 ${color.bg} ${color.border}`}>
      {/* The name wraps, never truncates: four cards across a 14" screen cut
          "Casual Leave" to "CASUAL L…", which named nothing. */}
      <div className="flex items-start gap-2 mb-3 min-w-0">
        <span className={`w-2 h-2 mt-1 rounded-full shrink-0 ${color.dot}`} />
        <p className="flex-1 min-w-0 text-xs font-bold text-slate-600 leading-snug">{balance.leave_type?.name || "Leave"}</p>
        {balance.leave_type?.code && (
          <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/70 shrink-0 ${color.accent}`}>
            {balance.leave_type.code}
          </span>
        )}
      </div>
      <p className={`text-xl font-extrabold leading-tight ${color.accent} mb-1`}>{formatDayCount(current, { fallback: "0 Days" })}</p>
      <p className="text-xs text-slate-500 font-medium">left</p>
      <div className="mt-3 pt-3 border-t border-white/70 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="whitespace-nowrap"><span className="font-semibold text-slate-700">{formatDayCount(earned, { lower: true, fallback: "0 days" })}</span> given so far</span>
        <span className="whitespace-nowrap"><span className="font-semibold text-slate-700">{formatDayCount(taken, { lower: true, fallback: "0 days" })}</span> taken</span>
      </div>
    </div>
  );
}

// ─── Main LeaveTab Component ──────────────────────────────────────────────────
const LT_CURRENT_YEAR = new Date().getFullYear();
const LT_YEAR_OPTIONS = [LT_CURRENT_YEAR, LT_CURRENT_YEAR - 1, LT_CURRENT_YEAR - 2];

export default function LeaveTab({ userId, employeeName = "" }) {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [year, setYear] = useState(LT_CURRENT_YEAR);
  // The assign form is the shared one (shared/leaves/AssignLeavePolicyDialog),
  // the same dialog HR gets from the org-wide Leave Requests page — here with
  // the person already decided, so it skips its picker.
  const [assignOpen, setAssignOpen] = useState(false);
  const [customiseTarget, setCustomiseTarget] = useState(null);
  const [toast, setToast] = useState(null);
  // Which policy they are on, and the three value sets behind each leave type
  // (what applies now, what the policy says, what the template says today).
  // A failed read is kept apart from "no policy": the first invites a retry, the
  // second invites assigning one, and showing the wrong one is how somebody
  // assigns over rules that were there all along (CLAUDE.md §7).
  const [config, setConfig] = useState({ status: "loading", assignment: null, types: [] });

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
      // The tab used to wait on the policy-template list, which the shared
      // dialog now fetches for itself. The balances are the only thing left
      // worth a skeleton, so they end it.
      setLoading(false);
    }
  }, [userId, year]);

  const loadConfig = useCallback(async () => {
    setConfig({ status: "loading", assignment: null, types: [] });
    try {
      const res = await leaveAPI.getUserLeaveConfig(userId);
      const data = res?.data ?? {};
      setConfig({ status: "ok", assignment: data.assignment || null, types: Array.isArray(data.types) ? data.types : [] });
    } catch {
      setConfig({ status: "error", assignment: null, types: [] });
    }
  }, [userId]);

  // Balances reload independently when the year changes (no full-tab skeleton
  // after the first one — `loading` is only ever true until the first read).
  useEffect(() => { loadBalances(); }, [loadBalances]);
  // The config is not year-scoped, so it is read once per person.
  useEffect(() => { loadConfig(); }, [loadConfig]);

  function onCustomiseSaved(msg) {
    setCustomiseTarget(null);
    showToast(msg);
    loadBalances();
    loadConfig();
  }

  /** The config row behind a balance row — the Customise dialog's prefill. */
  const typeFor = (leaveTypeId) => config.types.find((t) => t.leave_type_id === leaveTypeId) || null;

  /**
   * Why Customise can't be used on a balance row, or "" when it can. A balance
   * with no live config is normal, not a glitch: a leave type the current policy
   * lacks stops applying but keeps whatever was left in it.
   */
  function customiseBlockedBecause(leaveTypeId) {
    if (config.status === "loading") return "Loading their current rules…";
    if (config.status === "error") return "Couldn’t load their current rules";
    if (!typeFor(leaveTypeId)) return "This leave isn’t part of their policy any more — only the days left are kept";
    return "";
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

  const assignment = config.assignment;
  const policyLine = config.status === "loading" ? "Checking which policy they’re on…"
    : config.status === "error" ? "Couldn’t load which policy they’re on."
      : assignment?.legacy ? "On a leave policy, but which one was never recorded. Assign one to track it."
        : assignment?.template?.name
          ? `On ${assignment.template.name}${assignment.effective_from ? ` since ${fmtDate(ymdOnly(assignment.effective_from))}` : ""}${assignment.effective_to ? `, until ${fmtDate(ymdOnly(assignment.effective_to))}` : ""}`
          : "No leave policy assigned, so they can’t apply for leave yet.";
  const policyTone = config.status === "error" ? "text-rose-700"
    : config.status === "ok" && !assignment ? "text-fuchsia-700" : "text-slate-700";

  return (
    <div className="space-y-6">
      {/* ── Which policy they are on. The tab used to show balances with no way
          to tell where they came from, so a wrong quota had no explanation. ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-4 flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
          <HiClipboardCheck className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-bold ${policyTone}`}>{policyLine}</p>
          {config.status === "ok" && assignment?.assigned_by?.name && (
            <p className="text-xs text-slate-400 mt-0.5">Set up by {assignment.assigned_by.name}</p>
          )}
        </div>
      </div>

      {/* ── Section 1: Balance Cards ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Leave Balances</h3>
            <p className="text-xs text-slate-400 mt-0.5">Leave days available to this employee.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="h-8 px-3 text-xs font-semibold border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition bg-white" title="Balance year">
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

      {/* ── Section 2: Assign Policy ──
          One row, not a header-plus-body card. The form that used to fill the
          body now lives in the dialog, and keeping the old two-part shell left
          ~140px of border and padding wrapped around a single button. */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800">Assign a leave policy</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Gives this employee the leave days from a policy, adjusted for how much of the year is left. Any existing leave rules are replaced.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAssignOpen(true)}
          className="shrink-0 self-start sm:self-auto inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition whitespace-nowrap"
        >
          <HiClipboardCheck className="w-4 h-4" />
          {balances.length > 0 ? "Change policy" : "Assign a policy"}
        </button>
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
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider"><HelpLabel text="Given / Taken" help={{ surface: "organization.employee_profile", field: "given_taken", size: "sm", label: "given and taken" }} /></th>
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
                    <td className="px-6 py-3 text-sm font-bold text-slate-700">{formatDayCount(b.current_balance, { fallback: "0 days" })}</td>
                    <td className="px-6 py-3 text-xs text-slate-500">
                      {formatDayCount(b.total_accrued, { lower: true, fallback: "0 days" })} given · {formatDayCount(b.total_used, { lower: true, fallback: "0 days" })} taken
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-end">
                        {/* Held back until the rules have actually been read:
                            the form prefills from them, and an empty form would
                            silently reset whatever it didn’t show. A disabled
                            button always says why. */}
                        <button
                          onClick={() => setCustomiseTarget(typeFor(b.leave_type_id))}
                          disabled={!!customiseBlockedBecause(b.leave_type_id)}
                          title={customiseBlockedBecause(b.leave_type_id) || undefined}
                          className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
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
        <CustomiseLeaveRulesDialog
          userId={userId}
          leaveTypeId={customiseTarget.leave_type_id}
          leaveTypeName={customiseTarget.leave_type?.name || "This leave"}
          subjectName={employeeName}
          effective={customiseTarget.effective}
          policyDefault={customiseTarget.policy_default}
          templateCurrent={customiseTarget.template_current}
          overriddenFields={customiseTarget.overridden_fields || []}
          onClose={() => setCustomiseTarget(null)}
          onSaved={onCustomiseSaved}
          zIndex="z-50"
        />
      )}

      {assignOpen && (
        <AssignLeavePolicyDialog
          userId={userId}
          subjectName={employeeName}
          onAssigned={(message) => { showToast(message); loadBalances(); loadConfig(); }}
          onClose={() => setAssignOpen(false)}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
