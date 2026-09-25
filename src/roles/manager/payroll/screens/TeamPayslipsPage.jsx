import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, payrollFiles, organizationAPI } from "../../../../shared/api";
import { downloadFile } from "../../../../shared/utils/download";
import { HiCheckCircle, HiExclamationCircle, HiX, HiDocumentReport, HiUserGroup, HiDocumentDownload, HiCurrencyRupee, HiCalendar, HiReceiptTax, HiGift } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import DetailDialog, { DetailPill, DetailSection, DetailStats, DetailTable, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatPeriod } from "../../../../shared/utils/formatUtils";
import { PersonSelect } from "../../../../shared/components/PersonPicker";

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

// The org roster keys people by `user_id`; there is no `id` on those rows, so
// reading `id` sent the option's text (the name) to the server as the userId.
const memberId = (m) => m.user_id || m.id || m._id;
const slipRunId = (s) => s.run_id || s.payroll_run?.id || s.runId;
const slipPeriod = (s) => s.period_month || s.payroll_run?.period_month;

// ── One report's payslip for one run (#54) ─────────────────────────────────
// Laid out exactly like the payslip an employee opens on My Payslips, so the
// same document doesn't change shape depending on who is reading it.
function PayslipDetailModal({ userId, runId, period, memberName, onClose, showToast }) {
  const [data, setData] = useState(undefined);
  useEffect(() => {
    let cancelled = false;
    payrollAPI.getReportPayslip(userId, runId)
      .then((res) => { if (!cancelled) setData(res.data || res); })
      .catch((err) => { if (!cancelled) { showToast(payrollErrorMessage(err, "Failed to load payslip"), "error"); setData(null); } });
    return () => { cancelled = true; };
  }, [userId, runId, showToast]);

  const item = data?.item || data || {};
  const lines = data?.components || item.components || data?.snapshot?.lines || [];
  const lineAmt = (l) => l.amount ?? l.calculated_amount ?? l.annual_amount;
  const lineName = (l) => l.component_name || l.name || l.component_code;
  const earnings = lines.filter((l) => l.component_type === "earning");
  const deductions = lines.filter((l) => l.component_type === "deduction");
  const reimbursements = data?.reimbursements ?? item.reimbursements ?? lines.filter((l) => l.component_type === "reimbursement");
  const benefits = data?.benefits ?? item.benefits ?? [];
  const reimbTotal = reimbursements.reduce((s, r) => s + (parseFloat(r.amount ?? r.calculated_amount) || 0), 0);

  const moneyColumns = (tone) => [
    { header: "Item", render: (l) => lineName(l) },
    { header: "Amount", align: "right", render: (l) => <span className={`font-semibold tabular-nums ${tone}`}>{formatMoney(lineAmt(l))}</span> },
  ];

  return (
    <DetailDialog
      eyebrow="Payslip"
      icon={HiDocumentReport}
      title={memberName || formatPeriod(period)}
      subtitle={memberName ? formatPeriod(period) : undefined}
      badge={item.net_pay != null ? <DetailPill tone="onDark">{formatMoney(item.net_pay)} net</DetailPill> : undefined}
      loading={data === undefined}
      onClose={onClose}
    >
      {data !== undefined && (
        <>
          <DetailStats
            items={[
              { label: "Gross pay", value: formatMoney(item.gross_earnings ?? item.gross_pay), icon: HiCurrencyRupee },
              { label: "Deductions", value: formatMoney(item.total_deductions), icon: HiCurrencyRupee },
              { label: "Net pay", value: formatMoney(item.net_pay), hint: "what reaches the bank", icon: HiCurrencyRupee },
              { label: "Paid days", value: item.payable_days != null ? String(item.payable_days) : null, hint: item.lop_days != null ? `${item.lop_days} unpaid` : undefined, icon: HiCalendar },
            ]}
          />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <DetailSection title="What they earned" icon={HiCurrencyRupee}>
              <DetailTable
                columns={moneyColumns("text-slate-800")}
                rows={earnings}
                empty="No earning lines on this payslip."
                rowKey={(l, i) => l.component_code || i}
              />
            </DetailSection>
            <DetailSection title="What was deducted" icon={HiCurrencyRupee}>
              <DetailTable
                columns={moneyColumns("text-rose-600")}
                rows={deductions}
                empty="Nothing was deducted this month."
                rowKey={(l, i) => l.component_code || i}
              />
            </DetailSection>
          </div>

          {reimbursements.length > 0 && (
            <DetailSection title="Reimbursements" icon={HiReceiptTax} defaultOpen={false}>
              <DetailTable
                columns={[
                  { header: "Claim", render: (r) => `${r.category || lineName(r) || "Reimbursement"}${r.claim_number ? ` · ${r.claim_number}` : ""}` },
                  { header: "Amount", align: "right", render: (r) => <span className="font-semibold text-purple-700 tabular-nums">{formatMoney(r.amount ?? r.calculated_amount)}</span> },
                ]}
                rows={reimbursements}
                rowKey={(r, i) => r.id || r.claim_number || i}
                empty="No reimbursements this month."
              />
              {reimbTotal > 0 && (
                <p className="text-[11px] text-slate-500 mt-3">
                  Net pay includes {formatMoney(reimbTotal)} of reimbursements, which are paid on top of gross pay rather than being part of it.
                </p>
              )}
            </DetailSection>
          )}

          {benefits.length > 0 && (
            <DetailSection title="Benefits" icon={HiGift} defaultOpen={false}>
              <DetailTable
                columns={[
                  { header: "Plan", render: (b) => b.plan || b.plan_name || "Benefit" },
                  { header: "Employee pays", align: "right", render: (b) => <span className="tabular-nums">{formatMoney(b.employee ?? b.employee_contribution)}</span> },
                  { header: "Company pays", align: "right", render: (b) => <span className="tabular-nums">{formatMoney(b.employer ?? b.employer_contribution)}</span> },
                ]}
                rows={benefits}
                rowKey={(b, i) => b.id || b.plan || i}
                empty="No benefits on this payslip."
              />
            </DetailSection>
          )}
        </>
      )}
    </DetailDialog>
  );
}

// ── Whole team's numbers for one run (#51 summary + #52 items) ─────────────
function TeamRunModal({ runId, period, onClose, showToast }) {
  const [summary, setSummary] = useState(undefined);
  const [items, setItems] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    payrollAPI.getTeamRunSummary(runId)
      .then((res) => { if (!cancelled) setSummary(res.data || res); })
      .catch((err) => { if (!cancelled) { showToast(payrollErrorMessage(err, "Failed to load team summary"), "error"); setSummary(null); } });
    payrollAPI.getTeamRunItems(runId)
      .then((res) => { if (!cancelled) setItems(res.data?.records || res.data?.items || res.data || []); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [runId, showToast]);

  const list = Array.isArray(items) ? items : [];
  // Comp-view OFF strips per-head money — detect whether any item carries a figure.
  const moneyHidden = list.length > 0 && list.every((it) => it.net_pay == null && it.gross_earnings == null);

  return (
    <DetailDialog
      eyebrow="Team cost"
      icon={HiUserGroup}
      title={formatPeriod(period)}
      subtitle="What this pay run costs for the people reporting to you"
      badge={summary?.total_net != null ? <DetailPill tone="onDark">{formatMoney(summary.total_net)} net</DetailPill> : undefined}
      loading={summary === undefined || items === undefined}
      onClose={onClose}
    >
      {summary && (
        <DetailStats
          items={[
            { label: "People", value: String(summary.headcount ?? list.length), icon: HiUserGroup },
            { label: "Gross", value: formatMoney(summary.total_gross), icon: HiCurrencyRupee },
            { label: "Net", value: formatMoney(summary.total_net), hint: "after deductions", icon: HiCurrencyRupee },
            { label: "Unpaid days", value: summary.total_lop_days != null ? String(summary.total_lop_days) : null, hint: "across the team", icon: HiCalendar },
          ]}
        />
      )}

      {moneyHidden && (
        <p className="text-xs text-slate-600 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
          Your organisation keeps individual pay private, so the totals above are shown without a per-person breakdown.
        </p>
      )}

      {items !== undefined && (
        <DetailSection title={`Team members (${list.length})`} icon={HiUserGroup}>
          <DetailTable
            rows={list}
            rowKey={(it, i) => it.id || i}
            empty="Nobody on your team is in this pay run."
            columns={[
              { header: "Team member", render: (it) => <span className="font-semibold text-slate-800">{it.employee_name || it.user?.profile?.display_name || it.user?.identifier}</span> },
              ...(moneyHidden ? [] : [
                { header: "Gross", align: "right", render: (it) => <span className="tabular-nums text-slate-700">{formatMoney(it.gross_earnings)}</span> },
                { header: "Net", align: "right", render: (it) => <span className="tabular-nums font-bold text-violet-600">{formatMoney(it.net_pay)}</span> },
              ]),
              { header: "Status", align: "center", render: (it) => (it.status ? <DetailPill tone="soft">{it.status}</DetailPill> : null) },
            ]}
          />
        </DetailSection>
      )}
    </DetailDialog>
  );
}

export default function TeamPayslipsPage() {
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadingPayslips, setLoadingPayslips] = useState(false);
  const [toast, setToast] = useState(null);

  const [detailSlip, setDetailSlip] = useState(null); // { userId, runId, period }
  const [teamRun, setTeamRun] = useState(null);        // { runId, period }
  const [downloading, setDownloading] = useState("");

  // The dialog is titled with the person, so a downloaded payslip and the
  // preview of it agree on whose it is.
  const selectedMemberName = teamMembers.find((m) => memberId(m) === selectedUserId)?.name || "";

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // #186 — a report's payslip PDF. Only released payslips are reachable; a held
  // one is refused exactly like a payslip that doesn't exist.
  const downloadPayslip = useCallback(async (userId, runId, period) => {
    setDownloading(runId);
    try {
      await downloadFile(payrollFiles.managerPayslipPdf(userId, runId), {
        filename: `payslip-${period || runId}.pdf`,
      });
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't download this payslip"), "error");
    } finally {
      setDownloading("");
    }
  }, [showToast]);

  useEffect(() => {
    organizationAPI.getEmployees({ purpose: "shift_assignment" })
      .then((res) => {
        const members = res.data?.records || (Array.isArray(res.data) ? res.data : res.data?.employees) || [];
        setTeamMembers(members);
        if (members.length > 0) setSelectedUserId(memberId(members[0]));
      })
      .catch((err) => showToast(payrollErrorMessage(err, "Failed to load your team"), "error"))
      .finally(() => setLoadingTeam(false));
  }, [showToast]);

  useEffect(() => {
    if (!selectedUserId) return;
    setLoadingPayslips(true);
    payrollAPI.getReportPayslips(selectedUserId)
      .then((res) => {
        const raw = res.data?.records ?? res.data?.data ?? res.data ?? [];
        setPayslips(Array.isArray(raw) ? raw : []);
      })
      .catch((err) => showToast(payrollErrorMessage(err, "Failed to load payslips"), "error"))
      .finally(() => setLoadingPayslips(false));
  }, [selectedUserId, showToast]);

  return (
    <>
      <DashboardTopBar title="Payslips" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Payslips</h1>
            <p className="text-sm text-slate-500 mt-1">Finalized payslips for your direct reports. Open a run to see the whole team’s cost.</p>
          </div>
          {!loadingTeam && teamMembers.length > 0 && (
            <PersonSelect className="sm:w-72" people={teamMembers} value={selectedUserId || ""} onChange={(id) => id && setSelectedUserId(id)} aria-label="Team member" />
          )}
        </div>

        {loadingTeam || loadingPayslips ? <Skeleton type="table" rows={4} /> : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4">Period</th>
                    <th className="px-6 py-4 text-right">Payable / LOP</th>
                    <th className="px-6 py-4 text-right">Gross</th>
                    <th className="px-6 py-4 text-right">Deductions</th>
                    <th className="px-6 py-4 text-right">Net Pay</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {payslips.map((slip) => {
                    const rid = slipRunId(slip);
                    const period = slipPeriod(slip);
                    // Without a run id there is no payslip to fetch, so the row
                    // must not look clickable — nothing would open.
                    const preview = rid ? rowPreviewProps(() => setDetailSlip({ userId: selectedUserId, runId: rid, period }), "Payslip") : { className: "hover:bg-slate-50/50 transition-colors" };
                    return (
                      <tr key={slip.id} {...preview}>
                        <td className="px-6 py-4 font-bold text-slate-800">{formatPeriod(period)}</td>
                        <td className="px-6 py-4 text-right tabular-nums text-slate-600">{slip.payable_days ?? "N/A"} / {slip.lop_days ?? "N/A"}</td>
                        <td className="px-6 py-4 text-right tabular-nums font-semibold text-slate-700">{formatMoney(slip.gross_earnings ?? slip.gross_pay)}</td>
                        <td className="px-6 py-4 text-right tabular-nums font-semibold text-rose-600">{formatMoney(slip.total_deductions)}</td>
                        <td className="px-6 py-4 text-right tabular-nums font-black text-violet-600">{formatMoney(slip.net_pay)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {rid && (
                              <button onClick={() => downloadPayslip(selectedUserId, rid, period)} disabled={downloading === rid} title="Download the payslip PDF"
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-lg transition disabled:opacity-50">
                                <HiDocumentDownload className="w-3.5 h-3.5" /> {downloading === rid ? "…" : "PDF"}
                              </button>
                            )}
                            {rid && (
                              <button onClick={() => setTeamRun({ runId: rid, period })} title="Whole team for this run"
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition">
                                <HiUserGroup className="w-3.5 h-3.5" /> Team
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {payslips.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No finalized payslips for this employee yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {detailSlip && detailSlip.runId && (
        <PayslipDetailModal userId={detailSlip.userId} runId={detailSlip.runId} period={detailSlip.period} memberName={selectedMemberName} onClose={() => setDetailSlip(null)} showToast={showToast} />
      )}
      {teamRun && (
        <TeamRunModal runId={teamRun.runId} period={teamRun.period} onClose={() => setTeamRun(null)} showToast={showToast} />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
