import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiClipboardList, HiCheck, HiRefresh, HiBan, HiEye, HiDocumentText } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import AttachmentViewerDialog from "../../../../shared/components/AttachmentViewerDialog";
import DetailDialog, { DetailPill, DetailSection, DetailStats, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { normalizeAttachment } from "../../../../shared/utils/reimbursementMeta";
import { formatDate } from "../../../../shared/utils/formatUtils";
import { personName } from "../../../../shared/attendance/normalize";
import { currentFY, fyOptions } from "../fyUtils";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-red-50 text-red-700 border border-red-200" : "bg-violet-50 text-violet-700 border border-violet-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-violet-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

const money = (v) => `₹${parseFloat(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const FY_OPTIONS = fyOptions();
const declarantName = (r) => r?.employee?.name || r?.user?.name || personName(r, "Employee");

const STATUS_PILL = {
  draft: "bg-slate-100 text-slate-600",
  submitted: "bg-fuchsia-100 text-fuchsia-700",
  under_review: "bg-fuchsia-100 text-fuchsia-700",
  verified: "bg-violet-100 text-violet-700",
  partially_verified: "bg-purple-100 text-purple-700",
  rejected: "bg-red-100 text-red-700",
};
const statusLabel = (s) => (s || "").replace(/_/g, " ") || "N/A";
const Pill = ({ s }) => <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL[s] || "bg-slate-100 text-slate-600"}`}>{statusLabel(s)}</span>;

// Same label / input look as the Invite Team Member form.
const labelCls = "block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5";
const inputCls = "h-9 bg-slate-50/70 border border-slate-200 rounded-xl px-3 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all disabled:opacity-50";

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
  const [viewAttachment, setViewAttachment] = useState(null);
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
    const reason = window.prompt("Reason for reopening this declaration to draft:")?.trim();
    if (!reason) return;
    try {
      await payrollAPI.reopenDeclaration(row.id, { reason });
      showToast("Declaration reopened");
      load();
    } catch (err) {
      showToast(err.message || "Reopen failed", "error");
    }
  };

  const closeDetail = () => { if (!busy) setDetail(null); };
  const canVerify = !!detail && ["submitted", "under_review"].includes(detail.status);

  const declaredTotal = (detail?.items || []).reduce((s, i) => s + (parseFloat(i.declared_amount) || 0), 0);
  const verifiedTotal = (detail?.items || []).reduce((s, i) => {
    const v = verifyItems[i.item_id || i.id] || {};
    return s + (v.proof_status === "rejected" ? 0 : parseFloat(v.verified_amount) || 0);
  }, 0);

  return (
    <>
        <DashboardTopBar title="Tax Declarations" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Investment Declarations
              </h1>
              <p className="text-sm text-slate-500 mt-1">Review and verify employee tax-saving claims item by item. Open a row to review it.</p>
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
                    <th className="px-6 py-4 border-b border-slate-100 w-px"><span className="sr-only">Reopen</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {rows.map((r) => (
                    <tr key={r.id} {...rowPreviewProps(() => open(r), `Review declaration for ${declarantName(r)}`)}>
                      <td className="px-6 py-4 font-bold text-slate-800">{declarantName(r)}</td>
                      <td className="px-6 py-4 text-slate-600">{r.financial_year || "N/A"}</td>
                      <td className="px-6 py-4 font-semibold text-slate-800">{money(r.declared_total ?? r.total_declared)}</td>
                      <td className="px-6 py-4 text-slate-600">{formatDate(r.proof_deadline)}</td>
                      <td className="px-6 py-4"><Pill s={r.status} /></td>
                      <td className="px-6 py-4 text-right">
                        {["submitted", "verified", "partially_verified"].includes(r.status) && (
                          <button onClick={() => reopen(r)} className="p-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition" title="Reopen to draft" aria-label={`Reopen declaration for ${declarantName(r)}`}><HiRefresh className="w-4 h-4" /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">No declarations match this filter.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </main>

      {detail && (
        <DetailDialog
          eyebrow="Investment declaration"
          icon={HiClipboardList}
          title={declarantName(detail)}
          subtitle={[detail.financial_year && `FY ${detail.financial_year}`, detail.regime_code && `Regime: ${String(detail.regime_code).toUpperCase()}`].filter(Boolean).join(" · ")}
          badge={<DetailPill>{statusLabel(detail.status)}</DetailPill>}
          loading={detailLoading}
          onClose={closeDetail}
          footer={detailLoading ? null : rejecting ? (
            <>
              <button type="button" onClick={() => setRejecting(false)} disabled={busy} className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-50">Back</button>
              <button type="button" disabled={busy || !reasonText.trim()} onClick={submitReject} className="px-6 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-xs flex items-center gap-2 disabled:opacity-50">
                <HiBan className="w-3.5 h-3.5" /> {busy ? "Rejecting…" : "Reject Declaration"}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setRejecting(true)} disabled={busy} className="sm:mr-auto px-5 py-2.5 text-xs font-bold text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"><HiBan className="w-3.5 h-3.5" /> Reject All</button>
              <button type="button" onClick={closeDetail} disabled={busy} className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-50">Cancel</button>
              <button type="button" disabled={busy || !canVerify} onClick={submitVerify} title={canVerify ? undefined : "Only submitted or under-review declarations can be verified."} className="px-6 py-2.5 text-xs font-bold text-white bg-[#6D28D9] hover:bg-purple-700 rounded-xl transition-all shadow-xs flex items-center gap-2 disabled:opacity-50">
                <HiCheck className="w-3.5 h-3.5" /> {busy ? "Saving…" : "Apply Verification"}
              </button>
            </>
          )}
        >
          {detailLoading ? <Skeleton type="table" rows={4} /> : (
            <>
              <DetailStats
                items={[
                  { label: "Declared total", value: money(declaredTotal) },
                  { label: "Verifying", value: money(verifiedTotal) },
                  { label: "Items", value: (detail.items || []).length },
                  { label: "Proof deadline", value: formatDate(detail.proof_deadline) },
                ]}
              />

              <DetailSection title="Declared items" icon={HiDocumentText}>
                <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                  <table className="w-full text-left text-xs min-w-[760px]">
                    <thead className="bg-slate-50/80 text-[11px] uppercase font-bold tracking-wider text-slate-600 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-3">Section</th>
                        <th className="px-4 py-3 text-right">Declared</th>
                        <th className="px-4 py-3 text-right">Verify amount</th>
                        <th className="px-4 py-3">Proof</th>
                        <th className="px-4 py-3">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(detail.items || []).map((it) => {
                        const id = it.item_id || it.id;
                        const v = verifyItems[id] || {};
                        const locked = it.sub_category === "EPF_AUTO";
                        const attachments = (Array.isArray(it.attachments) ? it.attachments : []).map(normalizeAttachment).filter((a) => a && a.id);
                        return (
                          <tr key={id} className="align-top">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-800">{it.section || "N/A"}</p>
                              {it.sub_category && <p className="text-[11px] text-slate-400">{it.sub_category}</p>}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">{money(it.declared_amount)}</td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number" min="0" max={it.declared_amount}
                                disabled={locked || v.proof_status === "rejected"}
                                value={v.verified_amount ?? ""}
                                onChange={(e) => setItem(id, { verified_amount: e.target.value })}
                                aria-label={`Verified amount for ${it.section || "item"}`}
                                className={`${inputCls} w-28 text-right`}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select disabled={locked} value={v.proof_status || "verified"} onChange={(e) => setItem(id, { proof_status: e.target.value })} aria-label={`Proof status for ${it.section || "item"}`} className={`${inputCls} w-32`}>
                                <option value="verified">Verified</option>
                                <option value="pending">Pending</option>
                                <option value="rejected">Rejected</option>
                              </select>
                              {it.proof_reference && <a href={/^https?:/.test(it.proof_reference) ? it.proof_reference : undefined} target="_blank" rel="noreferrer" className="block text-[11px] text-purple-600 truncate max-w-[10rem] mt-1">{it.proof_reference}</a>}
                              {attachments.map((att) => (
                                <button key={att.id} type="button" onClick={() => setViewAttachment(att)} className="mt-1 flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:underline"><HiEye className="w-3.5 h-3.5" /> {att.file_name}</button>
                              ))}
                            </td>
                            <td className="px-4 py-3">
                              <input value={v.verifier_remarks || ""} onChange={(e) => setItem(id, { verifier_remarks: e.target.value })} disabled={locked} placeholder="Optional" aria-label={`Remarks for ${it.section || "item"}`} className={`${inputCls} w-40`} />
                            </td>
                          </tr>
                        );
                      })}
                      {(detail.items || []).length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No declared items.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </DetailSection>

              {rejecting ? (
                <DetailSection title="Reject the whole declaration" icon={HiBan}>
                  <label htmlFor="decl-reject-reason" className={labelCls}>Reason <span className="text-red-400">*</span></label>
                  <textarea id="decl-reject-reason" value={reasonText} onChange={(e) => setReasonText(e.target.value)} rows={3} autoFocus placeholder="Tell the employee why the declaration is rejected…" className="w-full bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:border-red-400 focus:bg-white transition-all resize-none" />
                </DetailSection>
              ) : (
                <DetailSection title="Your remarks" icon={HiClipboardList}>
                  <label htmlFor="decl-hr-remarks" className={labelCls}>Overall HR remarks</label>
                  <input id="decl-hr-remarks" value={hrRemarks} onChange={(e) => setHrRemarks(e.target.value)} placeholder="Optional" className={`${inputCls} w-full h-10 px-3.5`} />
                </DetailSection>
              )}
            </>
          )}
        </DetailDialog>
      )}

      {viewAttachment && <AttachmentViewerDialog attachment={viewAttachment} getViewUrl={payrollAPI.getAttachmentViewUrl} onClose={() => setViewAttachment(null)} />}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
