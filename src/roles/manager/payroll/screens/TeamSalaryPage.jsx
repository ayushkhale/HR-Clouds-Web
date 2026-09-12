import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiCurrencyRupee, HiPencil, HiClock, HiLockClosed } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatDate } from "../../../../shared/utils/formatUtils";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

const REVISION_LABELS = { initial: "Initial", increment: "Increment", promotion: "Promotion", correction: "Correction", restructure: "Restructure" };
const STATUS_PILL = {
  approved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  proposed: "bg-amber-50 text-amber-700 border border-amber-200",
  rejected: "bg-red-50 text-red-700 border border-red-200",
  cancelled: "bg-slate-100 text-slate-500",
};

// Members are documented as { user, current_ctc }; fall back to the member
// object itself so a flat { id, name, current_ctc } shape still resolves.
const memberUser = (m) => m.user || m.employee || m;
const memberCtc = (m) => m.current_ctc ?? m.annual_ctc;

// ── Report's current + history, manager-scoped (#28, #29) ──────────────────
function HistoryModal({ member, onClose, showToast }) {
  const u = memberUser(member);
  const [current, setCurrent] = useState(undefined);
  const [rows, setRows] = useState(undefined);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      payrollAPI.getTeamMemberCurrentStructure(u.id),
      payrollAPI.getTeamMemberStructureHistory(u.id),
    ]).then(([curR, histR]) => {
      if (cancelled) return;
      const denialCode = "COMPENSATION_VIEW_DISABLED";
      const wasDenied = [curR, histR].some((r) => r.status === "rejected" && r.reason?.data?.errorCode === denialCode);
      if (wasDenied) { setDenied(true); setCurrent(null); setRows([]); return; }
      setCurrent(curR.status === "fulfilled" ? (curR.value.data ?? null) : null);
      setRows(histR.status === "fulfilled" ? (histR.value.data?.records || histR.value.data || []) : []);
    });
    return () => { cancelled = true; };
  }, [u.id]);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Salary history</h2>
            <p className="text-xs text-slate-500">{u.name || u.identifier || "Team member"}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto">
          {denied ? (
            <div className="flex flex-col items-center text-center py-8 text-slate-500">
              <HiLockClosed className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-sm font-semibold">Compensation view is disabled</p>
              <p className="text-xs mt-1">Your organisation's policy prevents managers from seeing per-employee salary figures.</p>
            </div>
          ) : rows === undefined ? <Skeleton type="table" rows={4} /> : (
            <>
              {current && (
                <div className="flex items-center justify-between rounded-xl bg-purple-50 border border-purple-100 px-4 py-3 mb-5">
                  <div><p className="text-[10px] font-bold text-purple-400 uppercase">Current CTC</p><p className="text-sm font-black text-purple-700">{formatMoney(current.annual_ctc)}</p></div>
                  <div className="text-right"><p className="text-[10px] font-bold text-purple-400 uppercase">Since</p><p className="text-sm font-semibold text-slate-600">{formatDate(current.effective_from)}</p></div>
                </div>
              )}
              {rows.length === 0 ? (
                <p className="text-center text-slate-400 py-6">No approved salary history to show.</p>
              ) : (
                <ol className="space-y-0">
                  {rows.map((h, i) => {
                    const isCurrent = h.status === "approved" && !h.effective_to;
                    return (
                      <li key={h.id || i} className="relative pl-6 pb-6 last:pb-0 border-l-2 border-slate-100 last:border-transparent">
                        <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full ring-4 ring-white ${isCurrent ? "bg-purple-600" : "bg-slate-300"}`} />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-800">{formatMoney(h.annual_ctc)}<span className="text-xs text-slate-400 font-normal ml-1">/ year</span></span>
                          <span className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">{REVISION_LABELS[h.revision_type] || h.revision_type || "Revision"}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{formatDate(h.effective_from)} — {isCurrent ? "Present" : formatDate(h.effective_to)}</p>
                        {h.revision_reason && <p className="text-xs text-slate-400 mt-1 italic">“{h.revision_reason}”</p>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TeamSalaryPage() {
  const [tab, setTab] = useState("team");
  const [teamData, setTeamData] = useState(null); // { headcount, team_ctc_total, team_ctc_average, members? }
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const [proposeMember, setProposeMember] = useState(null);
  const [historyMember, setHistoryMember] = useState(null);
  const [form, setForm] = useState({ annual_ctc: "", effective_from: new Date().toISOString().split("T")[0], revision_type: "increment", revision_reason: "" });
  const [submitting, setSubmitting] = useState(false);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getTeamSalaryStructures();
      setTeamData(res.data || res);
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to load team compensation"), "error");
      setTeamData(null);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadProposals = useCallback(async () => {
    setProposalsLoading(true);
    try {
      const res = await payrollAPI.getMyProposals();
      setProposals(res.data?.records || res.data || []);
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to load your proposals"), "error");
    } finally {
      setProposalsLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadTeam(); }, [loadTeam]);
  useEffect(() => { if (tab === "proposals") loadProposals(); }, [tab, loadProposals]);

  const members = teamData?.members;
  const compHidden = !!teamData && !members; // members omitted when comp-view is off

  // Map user_id → name for proposals that only carry an id (never show a UUID).
  const nameById = {};
  (members || []).forEach((m) => { const u = memberUser(m); if (u.id) nameById[u.id] = u.name || u.identifier; });
  const proposalName = (p) => p.user?.name || p.employee?.name || nameById[p.user_id] || "Team member";

  const openPropose = (member) => {
    setProposeMember(member);
    setForm({ annual_ctc: memberCtc(member) || "", effective_from: new Date().toISOString().split("T")[0], revision_type: "increment", revision_reason: "" });
  };

  const submitPropose = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const u = memberUser(proposeMember);
      await payrollAPI.proposeTeamMemberStructure(u.id, {
        annual_ctc: form.annual_ctc,
        effective_from: form.effective_from,
        revision_type: form.revision_type,
        revision_reason: form.revision_reason.trim(),
      });
      showToast("Revision proposed — awaiting HR approval");
      setProposeMember(null);
      if (tab === "proposals") loadProposals();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to propose revision"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelProposal = async (p) => {
    if (!window.confirm("Cancel this proposal? HR will no longer see it.")) return;
    try {
      await payrollAPI.cancelMyProposal(p.id);
      showToast("Proposal cancelled");
      loadProposals();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to cancel proposal"), "error");
    }
  };

  return (
    <>
      <DashboardTopBar title="Team Compensation" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <HiCurrencyRupee className="text-purple-600 w-7 h-7" /> Team Compensation
          </h1>
          <p className="text-sm text-slate-500 mt-1">Review your direct reports' pay and propose revisions for HR approval.</p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-max mb-6 text-sm font-semibold">
          {[["team", "Team"], ["proposals", "My Proposals"]].map(([val, label]) => (
            <button key={val} onClick={() => setTab(val)}
              className={`px-4 py-2 rounded-md transition ${tab === val ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "team" && (loading ? <Skeleton type="dashboard" /> : (
          <>
            {/* Aggregates — always available, even when per-head is hidden (#27) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="text-[11px] font-bold text-slate-400 uppercase">Team size</p>
                <p className="text-2xl font-black text-slate-800 mt-1 tabular-nums">{teamData?.headcount ?? 0}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="text-[11px] font-bold text-slate-400 uppercase">Total CTC</p>
                <p className="text-2xl font-black text-purple-700 mt-1 tabular-nums">{formatMoney(teamData?.team_ctc_total)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="text-[11px] font-bold text-slate-400 uppercase">Average CTC</p>
                <p className="text-2xl font-black text-slate-800 mt-1 tabular-nums">{formatMoney(teamData?.team_ctc_average)}</p>
              </div>
            </div>

            {compHidden ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
                <HiLockClosed className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold text-slate-600">Per-employee compensation is hidden</p>
                <p className="text-xs text-slate-400 mt-1">Your organisation's policy shows managers team aggregates only. The figures above summarise your whole team.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[640px]">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        <th className="px-6 py-4">Team member</th>
                        <th className="px-6 py-4 text-right">Current CTC</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(members || []).map((m, i) => {
                        const u = memberUser(m);
                        return (
                          <tr key={u.id || i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-bold text-slate-800">{u.name || u.identifier || "—"}</p>
                              {u.email && <p className="text-xs text-slate-400">{u.email}</p>}
                            </td>
                            <td className="px-6 py-4 text-right tabular-nums">
                              {memberCtc(m) ? <span className="font-bold text-slate-800">{formatMoney(memberCtc(m))}</span> : <span className="text-xs text-slate-400">Not set</span>}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-1.5">
                                <button onClick={() => setHistoryMember(m)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition">
                                  <HiClock className="w-3.5 h-3.5" /> History
                                </button>
                                <button onClick={() => openPropose(m)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                                  <HiPencil className="w-3.5 h-3.5" /> Propose
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {(members || []).length === 0 && (
                        <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-500">No direct reports found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ))}

        {tab === "proposals" && (proposalsLoading ? <Skeleton type="table" rows={4} /> : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4">Team member</th>
                    <th className="px-6 py-4 text-right">Proposed CTC</th>
                    <th className="px-6 py-4">Effective from</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {proposals.map((p, i) => (
                    <tr key={p.id || i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">{proposalName(p)}</td>
                      <td className="px-6 py-4 text-right tabular-nums font-semibold text-slate-800">{formatMoney(p.annual_ctc)}</td>
                      <td className="px-6 py-4 text-slate-500">{formatDate(p.effective_from)}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${STATUS_PILL[p.status] || "bg-slate-100 text-slate-500"}`}>{p.status}</span>
                        {p.status === "rejected" && p.rejection_reason && <p className="text-[11px] text-red-500 mt-1">{p.rejection_reason}</p>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {p.status === "proposed"
                          ? <button onClick={() => cancelProposal(p)} className="px-2.5 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition">Cancel</button>
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                  {proposals.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">You haven't proposed any revisions yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </main>

      {historyMember && <HistoryModal member={historyMember} onClose={() => setHistoryMember(null)} showToast={showToast} />}

      {proposeMember && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Propose revision — {memberUser(proposeMember).name}</h2>
              <button onClick={() => setProposeMember(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitPropose} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">New annual CTC <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input type="number" required min="1" value={form.annual_ctc} onChange={(e) => setForm({ ...form, annual_ctc: e.target.value })} className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Effective from</label>
                  <input type="date" required value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Revision type</label>
                  <select value={form.revision_type} onChange={(e) => setForm({ ...form, revision_type: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    <option value="increment">Increment</option>
                    <option value="promotion">Promotion</option>
                    <option value="correction">Correction</option>
                    <option value="restructure">Restructure</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Reason <span className="text-red-500">*</span></label>
                <input type="text" required value={form.revision_reason} onChange={(e) => setForm({ ...form, revision_reason: e.target.value })} placeholder="Why is this revision being proposed?" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setProposeMember(null)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 flex justify-center items-center gap-2">
                  {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Propose to HR"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
