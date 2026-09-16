import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import {
  HiRefresh, HiChevronLeft, HiChevronRight, HiExclamationCircle, HiReceiptRefund, HiX, HiCheck, HiHeart,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import ReasonDialog from "../../../../shared/components/ReasonDialog";
import DetailDialog, { DetailFooterNote, DetailPill, DetailStats, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import ClaimDetailSections from "../../../../shared/components/ClaimDetailSections";
import ClaimDecisionDialog from "../../../../shared/components/ClaimDecisionDialog";
import AttachmentViewerDialog from "../../../../shared/components/AttachmentViewerDialog";
import { payrollErrorMessage, payrollErrorCode } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatDate } from "../../../../shared/utils/formatUtils";
import { usePagedList } from "../../../../shared/attendance/usePagedList";
import { useTeamNames, resolvePerson } from "../../../../shared/attendance/useTeamNames";
import { useAuth } from "../../../../shared/contexts/AuthContext";
import useToast from "../../../hr/payroll/useToast";
import PayrollToast from "../../../hr/payroll/PayrollToast";
import { periodOptions } from "../../../hr/payroll/variablePayMeta";
import { plural } from "../../../hr/payroll/runMeta";
import {
  claimStatusMeta, claimStage, claimActions, normalizeClaimDetail, limitViolations, CLAIM_STATUS_FILTERS,
} from "../../../../shared/utils/reimbursementMeta";
import { benefitTypeLabel, enrollmentStatusMeta, effectiveContribution, normalizeTeamBenefits, ENROLLMENT_STATUS_FILTERS } from "../../../../shared/utils/benefitMeta";

const PAGE_SIZE = 20;
const selectCls = "h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400";

// ── Claims to review ─────────────────────────────────────────────────────────
function ClaimsTab({ showToast }) {
  const { user } = useAuth();
  const viewerId = user?.id;
  const names = useTeamNames();
  const [filters, setFilters] = useState({ status: "submitted", payout_period_month: "" });
  const months = useMemo(() => periodOptions({ back: 18, ahead: 6 }), []);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailReq = useRef(0);
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
    return payrollAPI.getTeamReimbursementClaims(params);
  }, [filters]);
  const list = usePagedList(fetchPage, { limit: PAGE_SIZE, keys: ["claims", "rows", "records"], filterKey });

  const nameOf = useCallback((claim) => resolvePerson(claim, names).name, [names]);
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const reloadDetail = async (id, { notifyOnError = false } = {}) => {
    const reqId = ++detailReq.current;
    setDetailLoading(true);
    try {
      const res = await payrollAPI.getTeamReimbursementClaim(id);
      const full = normalizeClaimDetail(res?.data ?? res);
      if (reqId !== detailReq.current) return;
      setDetail((d) => (d && d.id === id ? { ...d, ...full } : d));
    } catch (err) {
      if (reqId === detailReq.current && notifyOnError) showToast(payrollErrorMessage(err, "You can't open this claim. It may belong to someone outside your team."), "error");
      if (["FORBIDDEN", "CLAIM_NOT_FOUND"].includes(payrollErrorCode(err))) { closeDetail(); list.reload(); }
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
      const res = await payrollAPI.approveTeamReimbursementClaim(detail.id, payload);
      const claim = res?.data ?? res;
      setDecisionOpen(false);
      closeDetail();
      showToast(claim?.status === "rejected" ? "All items were rejected, so the claim is rejected." : "Approved. It now goes to HR for the final check.");
      list.reload();
    } catch (err) {
      const code = payrollErrorCode(err);
      if (code === "CATEGORY_LIMIT_EXCEEDED") { setDecisionViolations(limitViolations(err)); setDecisionError(payrollErrorMessage(err)); }
      else if (["APPROVED_EXCEEDS_CLAIMED"].includes(code)) setDecisionError(payrollErrorMessage(err));
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
      await payrollAPI.rejectTeamReimbursementClaim(rejectTarget.id, reason);
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

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select aria-label="Status" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={selectCls}>
          {CLAIM_STATUS_FILTERS.manager.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Pay month" value={filters.payout_period_month} onChange={(e) => setFilter("payout_period_month", e.target.value)} className={selectCls}>
          <option value="">Any pay month</option>
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <button type="button" onClick={() => list.reload()} aria-label="Refresh" title="Refresh" className="h-10 px-3 text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition"><HiRefresh className="w-4 h-4" /></button>
      </div>

      {list.loading ? <Skeleton type="table" rows={6} /> : list.error ? (
        <div className="py-12 px-6 text-center bg-white rounded-2xl border border-rose-200">
          <HiExclamationCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-rose-700">{payrollErrorMessage(list.error, "Couldn't load your team's claims.")}</p>
          <button type="button" onClick={() => list.reload()} className="mt-4 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">Try again</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <th className="px-5 py-4 border-b border-slate-100">Employee</th>
                  <th className="px-5 py-4 border-b border-slate-100">Claim</th>
                  <th className="px-5 py-4 border-b border-slate-100">Submitted</th>
                  <th className="px-5 py-4 border-b border-slate-100 text-right">Amount</th>
                  <th className="px-5 py-4 border-b border-slate-100">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {list.items.map((claim) => {
                  const acts = claimActions(claim, { audience: "manager", viewerId });
                  const status = claimStatusMeta(claim.status);
                  const stage = claimStage(claim);
                  const name = nameOf(claim);
                  const openLabel = `${acts.canDecide ? "Review" : "View"} claim for ${name}`;
                  return (
                    <tr key={claim.id} {...rowPreviewProps(() => openDetail(claim), openLabel)}>
                      <td className="px-5 py-4 font-bold text-slate-800">{name}</td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800">{claim.claim_number || "N/A"}</p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[220px]">{claim.title || "N/A"}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{claim.submitted_at ? formatDate(claim.submitted_at) : "N/A"}</td>
                      <td className="px-5 py-4 text-right tabular-nums font-bold text-slate-800">{formatMoney(claim.total_amount)}</td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${status.pill}`}>{status.label}</span>
                        <p className="text-[11px] text-slate-400 mt-1">{stage.label}</p>
                      </td>
                    </tr>
                  );
                })}
                {list.items.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    {list.total === 0 && filters.status === "submitted" ? "No claims from your team are waiting for you." : "No claims from your team match these filters."}
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
        const acts = claimActions(detail, { audience: "manager", viewerId });
        const busy = detailLoading || decisionBusy || rejectBusy;
        return (
          <DetailDialog
            eyebrow="Team claim"
            icon={HiReceiptRefund}
            title={nameOf(detail)}
            subtitle={[detail.claim_number, detail.title].filter(Boolean).join(" · ")}
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
            <ClaimDetailSections claim={detail} audience="manager" nameOf={(id) => (names[id]?.name || "")} showLimits onViewAttachment={setViewAttachment} />
          </DetailDialog>
        );
      })()}

      {decisionOpen && detail && (
        <ClaimDecisionDialog claim={detail} levelLabel="Your approval (step 1 of 2)" busy={decisionBusy} error={decisionError} violations={decisionViolations} onSubmit={submitDecision} onClose={() => { if (!decisionBusy) setDecisionOpen(false); }} />
      )}

      {rejectTarget && (
        <ReasonDialog title="Reject this claim?" description={`${rejectTarget.claim_number || "Claim"} · ${formatMoney(rejectTarget.total_amount)} · ${nameOf(rejectTarget)}. The employee will see your reason.`} label="Why are you rejecting it?" confirmLabel="Reject claim" tone="danger" minLength={5} busy={rejectBusy} error={rejectError} onSubmit={submitReject} onClose={() => { if (!rejectBusy) setRejectTarget(null); }} />
      )}

      {viewAttachment && <AttachmentViewerDialog attachment={viewAttachment} getViewUrl={payrollAPI.getTeamAttachmentViewUrl} onClose={() => setViewAttachment(null)} />}
    </>
  );
}

// ── Team benefits ────────────────────────────────────────────────────────────
function TeamBenefitsTab() {
  const names = useTeamNames();
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ data: null, total: 0, totalPages: 1, status: "loading" });
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqRef.current;
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const params = { page, limit: PAGE_SIZE };
      if (status) params.status = status;
      const res = await payrollAPI.getTeamBenefitEnrollments(params);
      if (reqId !== reqRef.current) return;
      const data = normalizeTeamBenefits(res);
      const totalPages = data.aggregatesOnly ? 1 : Math.max(1, Math.ceil((data.count || data.rows.length) / PAGE_SIZE));
      setState({ data, total: data.count, totalPages, status: "ready" });
    } catch {
      if (reqId === reqRef.current) setState((s) => ({ ...s, status: "error" }));
    }
  }, [page, status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status]);

  if (state.status === "loading") return <Skeleton type="table" rows={5} />;
  if (state.status === "error") return (
    <div className="py-12 px-6 text-center bg-white rounded-2xl border border-rose-200">
      <HiExclamationCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
      <p className="text-sm font-semibold text-rose-700">Couldn&apos;t load team benefits.</p>
      <button type="button" onClick={load} className="mt-4 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">Try again</button>
    </div>
  );

  const { data } = state;

  if (data.aggregatesOnly) {
    return (
      <>
        <p className="text-xs text-slate-500 mb-3">Your organisation hides team pay details, so only totals are shown.</p>
        <DetailStats items={[{ label: "Employees covered", value: String(data.headcount), icon: HiHeart }]} />
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mt-4">
          <table className="w-full text-left border-collapse min-w-[560px]">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                <th className="px-5 py-4 border-b border-slate-100">Plan</th>
                <th className="px-5 py-4 border-b border-slate-100">Type</th>
                <th className="px-5 py-4 border-b border-slate-100 text-right">Enrollments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {data.planMix.map((p, i) => (
                <tr key={p.plan_code || p.plan_id || i}>
                  <td className="px-5 py-4 font-bold text-slate-800">{p.plan_name || p.name || "Plan"}</td>
                  <td className="px-5 py-4 text-slate-600">{benefitTypeLabel(p.benefit_type)}</td>
                  <td className="px-5 py-4 text-right tabular-nums text-slate-700">{p.enrollment_count ?? p.count ?? "N/A"}</td>
                </tr>
              ))}
              {data.planMix.length === 0 && <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-500">No team benefit enrollments.</td></tr>}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-sm font-bold text-slate-700">Benefit cover</p>
        <div className="flex items-center gap-2">
          <select aria-label="Coverage status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            {ENROLLMENT_STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button type="button" onClick={load} aria-label="Refresh" title="Refresh" className="h-10 px-3 text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition"><HiRefresh className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                <th className="px-5 py-4 border-b border-slate-100">Employee</th>
                <th className="px-5 py-4 border-b border-slate-100">Plan</th>
                <th className="px-5 py-4 border-b border-slate-100">From</th>
                <th className="px-5 py-4 border-b border-slate-100">Status</th>
                <th className="px-5 py-4 border-b border-slate-100">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {data.rows.map((row, i) => {
                const contrib = effectiveContribution(row, row.plan);
                const st = enrollmentStatusMeta(row.status);
                return (
                  <tr key={row.id || i}>
                    <td className="px-5 py-4 font-bold text-slate-800">{resolvePerson(row, names).name}</td>
                    <td className="px-5 py-4 text-slate-600">{row.plan_name || row.plan?.name || row.plan_code || "N/A"}</td>
                    <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{row.enrolled_from ? formatDate(row.enrolled_from) : "N/A"}</td>
                    <td className="px-5 py-4"><span className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase ${st.pill}`}>{st.label}</span></td>
                    <td className="px-5 py-4 text-slate-600">{contrib.employeeOverridden || contrib.employerOverridden ? "Custom rate" : "Plan rate"}</td>
                  </tr>
                );
              })}
              {data.rows.length === 0 && <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">No team benefit enrollments.</td></tr>}
            </tbody>
          </table>
        </div>
        {state.totalPages > 1 && (
          <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Page {page} of {state.totalPages} · {plural(state.total, "enrollment")}</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronLeft className="w-4 h-4" /></button>
              <button type="button" onClick={() => setPage((p) => Math.min(state.totalPages, p + 1))} disabled={page >= state.totalPages} aria-label="Next page" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const TABS = [["claims", "Claims to review"], ["benefits", "Team benefits"]];

export default function TeamReimbursementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast, showToast, hideToast } = useToast();

  const rawTab = searchParams.get("tab");
  const tab = TABS.some(([v]) => v === rawTab) ? rawTab : "claims";
  useEffect(() => {
    if (rawTab && !TABS.some(([v]) => v === rawTab)) setSearchParams((p) => { const n = new URLSearchParams(p); n.set("tab", "claims"); return n; }, { replace: true });
  }, [rawTab, setSearchParams]);
  const setTab = (value) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("tab", value); return n; }, { replace: true });

  return (
    <>
      <DashboardTopBar title="Team Claims & Benefits" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Team Claims & Benefits</h1>
          <p className="text-sm text-slate-500 mt-1">Approve or reject your team&apos;s reimbursement claims, and look up their benefit cover.</p>
        </div>

        <div className="flex items-center gap-1 border-b border-slate-200 mb-6">
          {TABS.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTab(value)} className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${tab === value ? "border-purple-600 text-purple-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{label}</button>
          ))}
        </div>

        {tab === "benefits" ? <TeamBenefitsTab /> : <ClaimsTab showToast={showToast} />}
      </main>

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}
