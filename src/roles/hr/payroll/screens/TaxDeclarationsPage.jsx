import React, { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "../../../../shared/components/DashboardSidebar";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiClipboardList, HiCheck, HiRefresh, HiBan } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { currentFY, fyOptions } from "../fyUtils";

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

const money = (v) => `₹${parseFloat(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const FY_OPTIONS = fyOptions();

const STATUS_PILL = {
  draft: "bg-slate-100 text-slate-600",
  submitted: "bg-amber-100 text-amber-700",
  under_review: "bg-amber-100 text-amber-700",
  verified: "bg-emerald-100 text-emerald-700",
  partially_verified: "bg-purple-100 text-purple-700",
  rejected: "bg-red-100 text-red-700",
};
const Pill = ({ s }) => <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL[s] || "bg-slate-100 text-slate-600"}`}>{(s || "").replace(/_/g, " ")}</span>;

export default function TaxDeclarationsPage() {
  const [fy, setFy] = useState(currentFY());
  const [status, setStatus] = useState("submitted");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [detail, setDetail] = useState(null); // full declaration
  const [detailLoading, setDetailLoading] = useState(false);
  const [verifyItems, setVerifyItems] = useState({}); // item_id -> { verified_amount, proof_status, verifier_remarks }
  const [hrRemarks, setHrRemarks] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reasonText, setReasonText] = useState("");
  const [busy, setBusy] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getDeclarationQueue({ financial_year: fy, status: status || undefined });
      setRows(res.data?.records || res.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load declarations", "error");
    } finally {
      setLoading(false);
    }
  }, [fy, status]);

  useEffect(() => { load(); }, [load]);

  const open = async (row) => {
    setDetail({ ...row, items: [] });
    setDetailLoading(true);
    setHrRemarks("");
    setRejecting(false);
    setReasonText("");
    try {
      const res = await payrollAPI.getDeclaration(row.id);
      const d = res.data || res;
      setDetail(d);
      const seed = {};
      (d.items || []).forEach((it) => {
        const id = it.item_id || it.id;
        seed[id] = {
          verified_amount: it.verified_amount ?? it.declared_amount ?? 0,
          proof_status: it.proof_status && it.proof_status !== "pending" ? it.proof_status : "verified",
          verifier_remarks: it.verifier_remarks || "",
        };
      });
      setVerifyItems(seed);
    } catch (err) {
      showToast(err.message || "Failed to open declaration", "error");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const setItem = (id, patch) => setVerifyItems((v) => ({ ...v, [id]: { ...v[id], ...patch } }));

  const submitVerify = async () => {
    setBusy(true);
    try {
      const items = (detail.items || []).map((it) => {
        const id = it.item_id || it.id;
        const v = verifyItems[id] || {};
        return {
          item_id: id,
          verified_amount: v.proof_status === "rejected" ? 0 : parseFloat(v.verified_amount) || 0,
          proof_status: v.proof_status,
          proof_reference: it.proof_reference || undefined,
          verifier_remarks: v.verifier_remarks || undefined,
        };
      });
      await payrollAPI.verifyDeclaration(detail.id, { items, remarks: hrRemarks || undefined });
      showToast("Declaration verified");
      setDetail(null);
      load();
    } catch (err) {
      showToast(err.message || "Verification failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitReject = async () => {
    if (!reasonText.trim()) return showToast("Reason required", "error");
    setBusy(true);
    try {
      await payrollAPI.rejectDeclaration(detail.id, { rejection_reason: reasonText.trim() });
      showToast("Declaration rejected");
      setDetail(null);
      load();
    } catch (err) {
      showToast(err.message || "Reject failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const reopen = async (row) => {
    const reason = window.prompt("Reason for reopening this declaration to draft:");
    if (!reason) return;
    try {
      await payrollAPI.reopenDeclaration(row.id, { reason });
      showToast("Declaration reopened");
      load();
    } catch (err) {
      showToast(err.message || "Reopen failed", "error");
    }
  };

  const declaredTotal = (detail?.items || []).reduce((s, i) => s + (parseFloat(i.declared_amount) || 0), 0);
  const verifiedTotal = (detail?.items || []).reduce((s, i) => {
    const v = verifyItems[i.item_id || i.id] || {};
    return s + (v.proof_status === "rejected" ? 0 : parseFloat(v.verified_amount) || 0);
  }, 0);

  return (
    <div className="flex min-h-screen bg-[#F8F7FB] font-sans text-slate-800">
      <DashboardSidebar role="hr" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar title="Tax Declarations" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiClipboardList className="text-purple-600 w-7 h-7" /> Investment Declarations
              </h1>
              <p className="text-sm text-slate-500 mt-1">Review and verify employee tax-saving claims item by item.</p>
            </div>
            <div className="flex items-center gap-3">
              <select value={fy} onChange={(e) => setFy(e.target.value)} className="px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400">
                {FY_OPTIONS.map((y) => <option key={y} value={y}>FY {y}</option>)}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400">
                <option value="">All statuses</option>
                <option value="submitted">Submitted</option>
                <option value="under_review">Under review</option>
                <option value="verified">Verified</option>
                <option value="partially_verified">Partially verified</option>
                <option value="rejected">Rejected</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          {loading ? <Skeleton type="table" rows={6} /> : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4 border-b border-slate-100">Employee</th>
                    <th className="px-6 py-4 border-b border-slate-100">FY</th>
                    <th className="px-6 py-4 border-b border-slate-100">Declared</th>
                    <th className="px-6 py-4 border-b border-slate-100">Proof Deadline</th>
                    <th className="px-6 py-4 border-b border-slate-100">Status</th>
                    <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">{r.employee?.name || r.user?.name || r.user_id}</td>
                      <td className="px-6 py-4 text-slate-600">{r.financial_year}</td>
                      <td className="px-6 py-4 font-semibold text-slate-800">{money(r.declared_total ?? r.total_declared)}</td>
                      <td className="px-6 py-4 text-slate-600">{r.proof_deadline ? new Date(r.proof_deadline).toLocaleDateString() : "—"}</td>
                      <td className="px-6 py-4"><Pill s={r.status} /></td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => open(r)} className="px-2.5 py-1.5 text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition">Review</button>
                          {["submitted", "verified", "partially_verified"].includes(r.status) && (
                            <button onClick={() => reopen(r)} className="p-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition" title="Reopen to draft"><HiRefresh className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">No declarations match this filter.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {detail && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{detail.employee?.name || detail.user?.name || "Declaration"}</h2>
                <p className="text-xs text-slate-500">FY {detail.financial_year} · <Pill s={detail.status} /> {detail.regime_code && <>· Regime: <span className="font-bold uppercase">{detail.regime_code}</span></>}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>

            {detailLoading ? <div className="p-10"><Skeleton type="table" rows={4} /></div> : (
              <>
                <div className="overflow-y-auto flex-1">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 sticky top-0">
                        <th className="px-5 py-3">Section</th>
                        <th className="px-5 py-3 text-right">Declared</th>
                        <th className="px-5 py-3 text-right">Verify Amount</th>
                        <th className="px-5 py-3">Proof</th>
                        <th className="px-5 py-3">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(detail.items || []).map((it) => {
                        const id = it.item_id || it.id;
                        const v = verifyItems[id] || {};
                        const locked = it.sub_category === "EPF_AUTO";
                        return (
                          <tr key={id}>
                            <td className="px-5 py-2.5">
                              <p className="font-semibold text-slate-800">{it.section}</p>
                              {it.sub_category && <p className="text-[11px] text-slate-400">{it.sub_category}</p>}
                            </td>
                            <td className="px-5 py-2.5 text-right text-slate-600">{money(it.declared_amount)}</td>
                            <td className="px-5 py-2.5 text-right">
                              <input
                                type="number" min="0" max={it.declared_amount}
                                disabled={locked || v.proof_status === "rejected"}
                                value={v.verified_amount ?? ""}
                                onChange={(e) => setItem(id, { verified_amount: e.target.value })}
                                className="w-24 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm text-right outline-none focus:border-purple-400 disabled:opacity-40"
                              />
                            </td>
                            <td className="px-5 py-2.5">
                              <select disabled={locked} value={v.proof_status || "verified"} onChange={(e) => setItem(id, { proof_status: e.target.value })} className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400 disabled:opacity-40">
                                <option value="verified">Verified</option>
                                <option value="pending">Pending</option>
                                <option value="rejected">Rejected</option>
                              </select>
                              {it.proof_reference && <a href={/^https?:/.test(it.proof_reference) ? it.proof_reference : undefined} target="_blank" rel="noreferrer" className="block text-[11px] text-purple-600 truncate max-w-[10rem] mt-0.5">{it.proof_reference}</a>}
                            </td>
                            <td className="px-5 py-2.5">
                              <input value={v.verifier_remarks || ""} onChange={(e) => setItem(id, { verifier_remarks: e.target.value })} disabled={locked} placeholder="—" className="w-32 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400 disabled:opacity-40" />
                            </td>
                          </tr>
                        );
                      })}
                      {(detail.items || []).length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-500">No declared items.</td></tr>}
                    </tbody>
                  </table>
                </div>

                <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-between text-sm">
                  <span className="text-slate-500">Declared total <span className="font-bold text-slate-800">{money(declaredTotal)}</span></span>
                  <span className="text-slate-500">Verifying <span className="font-bold text-purple-700">{money(verifiedTotal)}</span></span>
                </div>

                {rejecting ? (
                  <div className="p-4 border-t border-slate-100 space-y-3">
                    <textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} rows={2} placeholder="Reason for rejecting the whole declaration…" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-red-400 outline-none resize-none" />
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setRejecting(false)} className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition">Back</button>
                      <button disabled={busy} onClick={submitReject} className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition shadow-md shadow-red-200 disabled:opacity-50">Reject Declaration</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 border-t border-slate-100 flex items-center gap-3">
                    <input value={hrRemarks} onChange={(e) => setHrRemarks(e.target.value)} placeholder="Overall HR remarks (optional)" className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-400" />
                    <button onClick={() => setRejecting(true)} className="px-3 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition flex items-center gap-1.5"><HiBan className="w-4 h-4" /> Reject All</button>
                    <button disabled={busy || !["submitted", "under_review"].includes(detail.status)} onClick={submitVerify} className="px-4 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200 disabled:opacity-50 flex items-center gap-1.5">
                      <HiCheck className="w-4 h-4" /> {busy ? "Saving…" : "Apply Verification"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
