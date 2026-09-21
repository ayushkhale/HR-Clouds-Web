// ─────────────────────────────────────────────────────────────────────────────
// TeamEncashmentsPage.jsx — a manager's view of comp-off cash-outs for their
// reports (API #216 propose, #217 list).
//
// Managers propose; HR decides (Tier B → Tier C). A manager can therefore raise
// a request and watch it, but never approve one — the approve controls live on
// the HR page and are deliberately absent here.
//
// Amounts are masked unless the organisation lets managers see team
// compensation (EC-25). When they are masked the backend simply omits them, so
// the column is dropped entirely rather than showing a row of dashes that looks
// like missing data.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiPlus, HiCash, HiX, HiInformationCircle, HiExclamationCircle, HiCalendar, HiUser } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailStats, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import PayrollToast from "../../../hr/payroll/PayrollToast";
import useToast from "../../../hr/payroll/useToast";
import PeriodPicker from "../../../hr/payroll/PeriodPicker";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatPeriod, formatDate } from "../../../../shared/utils/formatUtils";
import { normalizePaginated } from "../../../../shared/attendance/normalize";
import CompOffPicker from "../../../../shared/components/CompOffPicker";
import { useTeamNames } from "../../../../shared/attendance/useTeamNames";
import { ENCASHMENT_STATUS, encashmentStatusMeta, sourceKindLabel, toneClass, amount } from "../../../hr/payroll/phase7Meta";
import { PersonSelect } from "../../../../shared/components/PersonPicker";

const PAGE_SIZE = 20;
const currentPeriod = () => new Date().toISOString().slice(0, 7);
const STATUS_FILTERS = [["", "All requests"], ...Object.entries(ENCASHMENT_STATUS).map(([k, v]) => [k, v.label])];

const fmtDays = (v) => {
  const n = amount(v);
  if (n === null) return "N/A";
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? "day" : "days"}`;
};

function StatusPill({ status }) {
  const meta = encashmentStatusMeta(status);
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${toneClass(meta.tone)}`}>{meta.label}</span>;
}

/* ── Propose ──────────────────────────────────────────────────────────────── */

function ProposeDialog({ onClose, onDone, showToast, team }) {
  const [form, setForm] = useState({ user_id: "", period_month: currentPeriod() });
  const [compOffIds, setCompOffIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const ids = compOffIds;
  const problem = !form.user_id ? "Choose who this is for."
    : ids.length === 0 ? "HR needs to cash this out for now (see above)." : "";

  const submit = async (e) => {
    e.preventDefault();
    if (problem || saving) return;
    setSaving(true);
    setError("");
    try {
      // Managers may only propose comp-off cash-outs; leave-balance payouts are
      // HR-only, so `source_kind` is fixed rather than offered as a choice.
      await payrollAPI.proposeEncashment(form.user_id, {
        source_kind: "comp_off", comp_off_ids: ids, period_month: form.period_month,
      });
      showToast("Sent to HR for approval");
      onDone();
    } catch (err) {
      setError(payrollErrorMessage(err, "Couldn't send this request."));
      setSaving(false);
    }
  };

  const fieldCls = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none";
  const labelCls = "block text-[11px] font-bold text-slate-500 uppercase mb-2";

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Cash out a comp-off</h2>
            <p className="text-xs text-slate-500 mt-0.5">Pay someone for a day they worked instead of them taking it off. HR approves it.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls}>Who it is for</label>
            <PersonSelect
              people={team.map(([id, person]) => ({ id, name: person.name, code: person.code || "" }))}
              value={form.user_id}
              onChange={(id) => setForm({ ...form, user_id: id })}
              placeholder="Choose someone"
              loading={team.length === 0}
            />
            <p className="text-[11px] text-slate-400 mt-1.5">Only people who report to you.</p>
          </div>
          <div>
            <span className={labelCls}>Which days to cash out</span>
            {/* The API needs the comp-off ids, and no manager endpoint lists a
                report's approved comp-offs (only /manager/comp-offs/pending,
                which are not approved yet). Until the backend adds one, the
                picker explains instead of asking for ids nobody can see. */}
            <CompOffPicker
              userId={form.user_id}
              value={compOffIds}
              onChange={setCompOffIds}
              unavailable="Picking comp-off days isn't available to managers yet: the system doesn't give managers a list of their team's approved comp-offs. Ask HR to cash this out from Payroll › Encashments, where they can tick the days."
            />
          </div>
          <div>
            <label className={labelCls}>Pay it in</label>
            <PeriodPicker value={form.period_month} onChange={(v) => setForm({ ...form, period_month: v })} idPrefix="prop-period" selectClassName={fieldCls} yearsBack={1} yearsAhead={1} />
          </div>
          {error && (
            <p className="flex items-start gap-2 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
              <HiExclamationCircle className="w-4 h-4 shrink-0" /> <span>{error}</span>
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          {problem && <p className="text-[11px] font-semibold text-slate-500 mb-2.5">{problem}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
            <button type="submit" disabled={!!problem || saving} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50">
              {saving ? "Sending…" : "Send to HR"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function TeamEncashmentsPage() {
  const { toast, showToast, hideToast } = useToast();
  // useTeamNames returns a map of user_id -> { name, code }, not a lookup fn.
  const teamNames = useTeamNames();
  const nameOf = (id) => teamNames[id]?.name || "";
  const teamList = useMemo(
    () => Object.entries(teamNames).sort((a, b) => a[1].name.localeCompare(b[1].name)),
    [teamNames]
  );

  const [list, setList] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [proposing, setProposing] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (status) params.status = status;
      const res = await payrollAPI.getTeamEncashments(params);
      const norm = normalizePaginated(res, ["encashments", "records", "items"], params);
      setList({ items: norm.items, total: norm.total, totalPages: norm.totalPages });
      setError("");
    } catch (err) {
      setError(payrollErrorMessage(err, "Couldn't load your team's requests."));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  // EC-25: when amounts are masked the backend omits them from every row.
  // One row carrying a figure is enough to know the column is meaningful.
  const showMoney = useMemo(
    () => list.items.some((r) => amount(r.amount) !== null),
    [list.items]
  );

  return (
    <>
      <DashboardTopBar title="Encashments" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Encashments</h1>
            <p className="text-sm text-slate-500 mt-1">Comp-off cash-outs: pay your team for days they worked instead of them taking the time off.</p>
          </div>
          <button onClick={() => setProposing(true)} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 flex items-center gap-2">
            <HiPlus className="w-4 h-4" /> Cash out a comp-off
          </button>
        </div>

        <p className="flex items-start gap-2 mb-5 text-[11px] leading-relaxed text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
          <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500 mt-px" />
          <span>You send these to HR, who approve them. The amount is added to the employee&apos;s payslip for the month you choose.</span>
        </p>

        <div className="flex items-center gap-2 mb-5">
          <select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="h-10 px-3 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400">
            {STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          {loading ? <div className="p-6"><Skeleton type="table" rows={4} /></div>
            : error ? (
              <div className="p-10 text-center">
                <p className="text-sm text-rose-700 mb-3">{error}</p>
                <button onClick={load} className="text-xs font-bold text-purple-600 hover:underline">Try again</button>
              </div>
            ) : list.items.length === 0 ? (
              <div className="p-12 text-center">
                <HiCash className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600">Nothing here yet</p>
                <p className="text-xs text-slate-400 mt-1">Cash-outs you send to HR will appear here with their progress.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                      <tr>
                        <th className="px-6 py-3.5">Employee</th>
                        <th className="px-6 py-3.5">What</th>
                        <th className="px-6 py-3.5">Days</th>
                        {showMoney && <th className="px-6 py-3.5 text-right">Amount</th>}
                        <th className="px-6 py-3.5">Paid in</th>
                        <th className="px-6 py-3.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {list.items.map((row) => (
                        <tr key={row.id} {...rowPreviewProps(() => setDetail(row))} className="hover:bg-purple-50/30 transition-colors cursor-pointer">
                          <td className="px-6 py-3.5 font-semibold text-slate-800">{nameOf(row.user_id) || row.employee_code || "Team member"}</td>
                          <td className="px-6 py-3.5 text-slate-600">{sourceKindLabel(row.source_kind)}{row.leave_type_code ? ` · ${row.leave_type_code}` : ""}</td>
                          <td className="px-6 py-3.5 text-slate-600">{fmtDays(row.days)}</td>
                          {showMoney && <td className="px-6 py-3.5 text-right font-bold tabular-nums text-slate-800">{amount(row.amount) === null ? <span className="text-slate-400 font-semibold">N/A</span> : formatMoney(row.amount)}</td>}
                          <td className="px-6 py-3.5 text-slate-600">{formatPeriod(row.period_month)}</td>
                          <td className="px-6 py-3.5"><StatusPill status={row.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {list.totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500 font-medium">Page {page} of {list.totalPages}</span>
                    <div className="flex gap-2">
                      <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 disabled:opacity-40">Previous</button>
                      <button disabled={page >= list.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
                    </div>
                  </div>
                )}
              </>
            )}
        </div>
      </main>

      {proposing && <ProposeDialog onClose={() => setProposing(false)} onDone={() => { setProposing(false); load(); }} showToast={showToast} team={teamList} />}

      {detail && (
        <DetailDialog open onClose={() => setDetail(null)} title={nameOf(detail.user_id) || "Cash-out"}
          subtitle={`${sourceKindLabel(detail.source_kind)} · ${formatPeriod(detail.period_month)}`}
          badge={<DetailPill tone="onDark">{encashmentStatusMeta(detail.status).label}</DetailPill>}>
          <DetailStats items={[
            { label: "Days", value: fmtDays(detail.days), icon: HiCalendar },
            ...(amount(detail.amount) !== null ? [{ label: "Amount", value: formatMoney(detail.amount), icon: HiCash }] : []),
            { label: "Paid in", value: formatPeriod(detail.period_month), icon: HiCalendar },
          ]} />
          <DetailSection title="Request" icon={HiUser}>
            <DetailGrid rows={[
              ["Sent on", formatDate(detail.created_at)],
              ["Decided on", formatDate(detail.approved_at || detail.rejected_at)],
              ["Leave type", detail.leave_type_code || null],
            ]} />
          </DetailSection>
        </DetailDialog>
      )}

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}
