import React, { useState, useEffect, useCallback } from "react";
import { leaveAPI } from "../../../../shared/api";
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
const CARD_COLORS = [
  { bg: "bg-purple-50", border: "border-purple-100", accent: "text-purple-700", dot: "bg-purple-500" },
  { bg: "bg-blue-50", border: "border-blue-100", accent: "text-blue-700", dot: "bg-blue-500" },
  { bg: "bg-emerald-50", border: "border-emerald-100", accent: "text-emerald-700", dot: "bg-emerald-500" },
  { bg: "bg-amber-50", border: "border-amber-100", accent: "text-amber-700", dot: "bg-amber-500" },
  { bg: "bg-rose-50", border: "border-rose-100", accent: "text-rose-700", dot: "bg-rose-500" },
  { bg: "bg-cyan-50", border: "border-cyan-100", accent: "text-cyan-700", dot: "bg-cyan-500" },
];

function BalanceCard({ balance, index }) {
  const color = CARD_COLORS[index % CARD_COLORS.length];
  const current = parseFloat(balance.current_balance);
  const accrued = parseFloat(balance.total_accrued);
  const used = parseFloat(balance.total_used);

  function fmt(n) {
    return Number.isInteger(n) ? `${n}` : n.toFixed(1);
  }

  return (
    <div className={`rounded-2xl border p-5 ${color.bg} ${color.border}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${color.dot}`} />
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">{balance.leave_type?.name || "Leave"}</p>
        <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/60 ${color.accent}`}>
          {balance.leave_type?.code}
        </span>
      </div>
      <p className={`text-3xl font-extrabold ${color.accent} mb-1`}>{fmt(current)}</p>
      <p className="text-xs text-slate-400 font-medium">days remaining</p>
      <div className="mt-3 pt-3 border-t border-white/50 flex gap-4 text-xs text-slate-500">
        <span><span className="font-semibold text-slate-700">{fmt(accrued)}</span> accrued</span>
        <span><span className="font-semibold text-slate-700">{fmt(used)}</span> used</span>
      </div>
    </div>
  );
}

// ─── Override Config Modal ────────────────────────────────────────────────────
function OverrideModal({ userId, balance, onClose, onSaved }) {
  const [form, setForm] = useState({
    // Prefer the stored config quota; fall back to total_accrued only when config is unavailable.
    assigned_annual_quota: parseFloat(balance.config?.assigned_annual_quota ?? balance.total_accrued) || "",
    accrual_type: balance.config?.accrual_type || "upfront",
    max_carry_forward: balance.config?.max_carry_forward ?? 0,
    probation_restriction_days: balance.config?.probation_restriction_days ?? 0,
    max_negative_balance: balance.config?.max_negative_balance ?? 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError("");
    const payload = {};
    if (form.assigned_annual_quota !== "") payload.assigned_annual_quota = parseFloat(form.assigned_annual_quota) || 0;
    payload.accrual_type = form.accrual_type;
    payload.max_carry_forward = parseFloat(form.max_carry_forward) || 0;
    payload.probation_restriction_days = parseInt(form.probation_restriction_days) || 0;
    payload.max_negative_balance = parseFloat(form.max_negative_balance) || 0;
    try {
      await leaveAPI.overrideConfig(userId, balance.leave_type_id, payload);
      onSaved("Config overridden. Balance updated automatically if applicable.");
    } catch (err) {
      if (err.data?.code === "CONFIG_NOT_FOUND") {
        setError("No config found for this leave type. Assign a policy first.");
      } else {
        setError(err.message || "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-bold text-slate-800">Override Config</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Customise <strong>{balance.leave_type?.name}</strong> rules for this employee only.
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

          {/* Info tip */}
          <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <HiInformationCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
            <span>If you increase the annual quota for an <strong>upfront</strong> policy, the balance is automatically credited immediately.</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Annual Quota (days)</label>
              <input
                type="number" step="0.5" min="0" max="365"
                value={form.assigned_annual_quota}
                onChange={e => set("assigned_annual_quota", e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Accrual Type</label>
              <div className="flex gap-2 mt-1">
                {["upfront", "monthly"].map(t => (
                  <label key={t} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${form.accrual_type === t ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`}>
                    <input type="radio" name="accrual_type_override" value={t} checked={form.accrual_type === t} onChange={() => set("accrual_type", t)} className="sr-only" />
                    {t === "upfront" ? "Upfront" : "Monthly"}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Carry Forward</label>
              <input type="number" step="0.5" min="0" value={form.max_carry_forward} onChange={e => set("max_carry_forward", e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Probation (days)</label>
              <input type="number" step="1" min="0" value={form.probation_restriction_days} onChange={e => set("probation_restriction_days", e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Overdraft (days)</label>
              <input type="number" step="0.5" min="0" value={form.max_negative_balance} onChange={e => set("max_negative_balance", e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition">
              {loading ? "Saving…" : "Save Override"}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main LeaveTab Component ──────────────────────────────────────────────────
export default function LeaveTab({ userId }) {
  const [balances, setBalances] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [confirmAssign, setConfirmAssign] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const loadBalances = useCallback(async () => {
    try {
      const res = await leaveAPI.getUserBalances(userId);
      setBalances(res.data || []);
    } catch {
      showToast("Failed to load leave balances.", "error");
    }
  }, [userId]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await leaveAPI.getTemplates();
      setTemplates(res.data || []);
    } catch {
      // Non-critical — don't block the UI
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadBalances(), loadTemplates()]).finally(() => setLoading(false));
  }, [loadBalances, loadTemplates]);

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
      showToast("Policy assigned! Balances have been credited.");
      setSelectedTemplateId("");
      await loadBalances();
    } catch (err) {
      showToast(err.message || "Failed to assign policy.", "error");
    } finally {
      setAssigning(false);
    }
  }

  function onOverrideSaved(msg) {
    setOverrideTarget(null);
    showToast(msg);
    loadBalances();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}
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
            <p className="text-xs text-slate-400 mt-0.5">Current year leave wallet for this employee.</p>
          </div>
          <button onClick={loadBalances} className="text-slate-400 hover:text-purple-600 p-1.5 rounded-lg hover:bg-purple-50 transition" title="Refresh">
            <HiRefresh className="w-4 h-4" />
          </button>
        </div>

        {balances.length === 0 ? (
          <div className="px-6 py-10 flex flex-col items-center gap-2 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-1">
              <HiCalendar className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No leave policy assigned</p>
            <p className="text-xs text-slate-400">Assign a policy below to initialise this employee's leave balance.</p>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {balances.map((b, i) => <BalanceCard key={b.id || b.leave_type_id} balance={b} index={i} />)}
          </div>
        )}
      </div>

      {/* ── Section 2: Assign Policy ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Assign Policy</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Assigns a policy template and credits leave balances via pro-rata calculation. Existing configs are replaced.
          </p>
        </div>
        <div className="p-6 flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="flex-1">
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
                This template has no entitlements — employee will receive 0 leaves.
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

      {/* ── Section 3: Override Config ── */}
      {balances.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Override Config</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Adjust individual leave type rules for this employee only — without changing the policy template.
            </p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Leave Type</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Balance</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Accrued / Used</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {balances.map((b) => {
                const current = parseFloat(b.current_balance);
                const accrued = parseFloat(b.total_accrued);
                const used = parseFloat(b.total_used);
                function fmt(n) { return Number.isInteger(n) ? `${n}` : n.toFixed(1); }
                return (
                  <tr key={b.leave_type_id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{b.leave_type?.name}</span>
                        <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{b.leave_type?.code}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm font-bold text-slate-700">{fmt(current)} days</td>
                    <td className="px-6 py-3 text-xs text-slate-500">
                      {fmt(accrued)} accrued · {fmt(used)} used
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => setOverrideTarget(b)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition"
                        >
                          <HiPencil className="w-3.5 h-3.5" /> Override
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

      {/* Override Modal */}
      {overrideTarget && (
        <OverrideModal
          userId={userId}
          balance={overrideTarget}
          onClose={() => setOverrideTarget(null)}
          onSaved={onOverrideSaved}
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
                <strong className="text-amber-600">replace all existing leave configurations</strong>{" "}
                for this employee and recalculate their balances via pro-rata math. This cannot be undone.
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
