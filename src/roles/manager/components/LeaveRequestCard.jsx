import React, { useState } from "react";
import { leaveAPI } from "../../../shared/api";
import { leaveErrorMessage } from "../../../shared/utils/leaveErrors";
import { fmtDate, fmtDateTime, parseYMDLocal, todayYMD } from "../../../shared/attendance/dates";
import { humanize } from "../../../shared/attendance/enums";
import { personName } from "../../../shared/attendance/normalize";
import GenderAvatar from "../../../shared/components/GenderAvatar";
import {
  HiCalendar, HiDocumentText, HiExclamationCircle, HiGift, HiInformationCircle,
  HiMail, HiThumbDown, HiThumbUp, HiTrendingUp,
} from "react-icons/hi";

// Leave endpoints nest the applicant as `applicant: { id, identifier, profile: { first_name, last_name } }`.
export function leaveApplicantName(request) {
  return personName(request?.applicant || request?.user, "Employee");
}

const fmtDays = (value) => {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return "N/A";
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? "day" : "days"}`;
};

/** "Starts tomorrow" / "Starts in 3 days" / "Started 2 days ago" relative to today. */
function startsLabel(startYmd, endYmd) {
  const start = parseYMDLocal(startYmd);
  const today = parseYMDLocal(todayYMD());
  if (!start || !today) return null;
  const days = Math.round((start - today) / 86_400_000);
  if (days === 0) return { text: "Starts today", tone: "text-fuchsia-600" };
  if (days === 1) return { text: "Starts tomorrow", tone: "text-fuchsia-600" };
  if (days > 1) return { text: `Starts in ${days} days`, tone: "text-slate-400" };
  const end = parseYMDLocal(endYmd) || start;
  return end >= today
    ? { text: "In progress", tone: "text-rose-600" }
    : { text: `Started ${-days} day${days === -1 ? "" : "s"} ago`, tone: "text-rose-600" };
}

const Tile = ({ label, children, hint }) => (
  <div className="bg-slate-50 rounded-xl px-3 py-2.5 min-w-0">
    <p className="text-[10px] text-slate-400 font-semibold mb-0.5">{label}</p>
    <div className="text-xs font-bold text-slate-700">{children}</div>
    {hint}
  </div>
);

export default function LeaveRequestCard({ request, onApprove, onReject, busy = false, showToast }) {
  const name = leaveApplicantName(request);
  const applicant = request.applicant || request.user || {};
  const email = applicant.identifier || applicant.email || "";
  const isCancellation = request.status === "cancellation_pending";
  const applicantId = applicant.id ?? request.user_id ?? null;
  const leaveTypeId = request.leave_type_id || request.leave_type?.id;
  const totalDays = parseFloat(request.total_days ?? 0);
  const paidDays = parseFloat(request.paid_days ?? request.total_days ?? 0);
  const unpaidDays = parseFloat(request.unpaid_days || 0);
  const start = request.start_date || request.date;
  const end = request.end_date || start;
  const starts = startsLabel(start, end);
  const [bal, setBal] = useState(null); // { loading, row, error } | null

  async function checkBalance() {
    if (bal && !bal.error) { setBal(null); return; }
    if (!applicantId) { showToast?.("Applicant id unavailable for balance lookup.", "error"); return; }
    setBal({ loading: true });
    try {
      const res = await leaveAPI.getTeamMemberBalances(applicantId);
      const row = (res.data || []).find((b) => b.leave_type_id === leaveTypeId) || null;
      setBal({ loading: false, row });
    } catch (err) {
      setBal({ loading: false, error: leaveErrorMessage(err, "Couldn't load balance.") });
    }
  }

  const dateOpts = { weekday: "short", day: "numeric", month: "short", year: "numeric" };
  const startLabel = fmtDate(start, dateOpts);
  const endLabel = fmtDate(end, dateOpts);

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isCancellation ? "border-fuchsia-200" : "border-slate-100"}`}>
      {isCancellation && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-fuchsia-50 border-b border-fuchsia-200 text-xs font-semibold text-fuchsia-700">
          <HiInformationCircle className="w-4 h-4" />
          This employee is requesting to cancel an approved leave. Approving will refund their balance.
        </div>
      )}
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 text-sm">
            <GenderAvatar person={applicant} name={name} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-bold text-slate-800">{name}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isCancellation ? "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300" : "bg-purple-50 text-purple-700 border-purple-200"}`}>
                {isCancellation ? "Cancellation Pending" : "Pending Approval"}
              </span>
              {(request.requested_at || request.created_at) && (
                <span className="text-[10px] font-semibold text-slate-400 sm:ml-auto">Applied {fmtDateTime(request.requested_at || request.created_at)}</span>
              )}
            </div>
            {email && (
              <p className="text-xs text-slate-400 mt-0.5 inline-flex items-center gap-1 max-w-full"><HiMail className="w-3 h-3 shrink-0" /><span className="truncate">{email}</span></p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <Tile label="Leave Type">{request.leave_type?.name || "Leave"}</Tile>
              <Tile label="Dates" hint={starts && <p className={`text-[10px] font-semibold mt-0.5 ${starts.tone}`}>{starts.text}</p>}>
                {startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`}
              </Tile>
              <Tile
                label="Duration"
                hint={request.is_half_day && (
                  <p className="text-[10px] font-semibold text-violet-600 mt-0.5">Half day · {request.half_day_type ? humanize(request.half_day_type) : "N/A"}</p>
                )}
              >
                {fmtDays(totalDays)}
              </Tile>
              <Tile label="Pay">
                <span className="text-violet-600">{fmtDays(paidDays)} paid</span>
                {unpaidDays > 0 && <span className="block text-rose-500">{fmtDays(unpaidDays)} unpaid (LWP)</span>}
              </Tile>
            </div>

            {(request.source_comp_off_id || request.escalated_to_role) && (
              <div className="flex flex-wrap gap-2 mt-3">
                {request.source_comp_off_id && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                    <HiGift className="w-3 h-3" /> Uses an earned leave credit
                  </span>
                )}
                {request.escalated_to_role && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                    <HiTrendingUp className="w-3 h-3" /> Escalated to {humanize(request.escalated_to_role)}
                  </span>
                )}
              </div>
            )}

            <div className="mt-3 flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">
              <HiInformationCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
              {request.reason ? <span className="italic break-words">&ldquo;{request.reason}&rdquo;</span> : <span className="text-slate-400">No reason given.</span>}
            </div>

            {request.document_url && (
              <div className="mt-2">
                <a href={request.document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-3 py-1.5 rounded-lg transition">
                  <HiDocumentText className="w-3.5 h-3.5" /> View Supporting Document
                </a>
              </div>
            )}
          </div>
        </div>

        {bal && (
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
            {bal.loading ? (
              <span className="text-slate-400">Loading balance…</span>
            ) : bal.error ? (
              <span className="text-rose-500">{bal.error}</span>
            ) : bal.row ? (
              (() => {
                const current = parseFloat(bal.row.current_balance);
                const projected = current - paidDays;
                return (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-slate-500">Current <strong className="text-slate-800">{Number.isInteger(current) ? current : current.toFixed(1)}</strong></span>
                    <span className="text-slate-400">− {paidDays.toFixed(1)} paid</span>
                    <span className="text-slate-500">→ after approval <strong className={projected < 0 ? "text-rose-600" : "text-violet-700"}>{Number.isInteger(projected) ? projected : projected.toFixed(1)}</strong></span>
                    {projected < 0 && (
                      <span className="flex items-center gap-1 text-rose-600 font-semibold"><HiExclamationCircle className="w-3.5 h-3.5" /> Goes negative — approval may hit the overdraft limit.</span>
                    )}
                  </div>
                );
              })()
            ) : (
              <span className="text-slate-400">No balance record for this leave type.</span>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3 justify-end">
          <button onClick={checkBalance} className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:bg-slate-100 border border-slate-200 px-4 py-2.5 rounded-xl transition mr-auto">
            <HiCalendar className="w-4 h-4" />{bal && !bal.error ? "Hide balance" : "Balance impact"}
          </button>
          <button onClick={() => onReject(request)} disabled={busy} className="flex items-center gap-2 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 px-4 py-2.5 rounded-xl transition disabled:opacity-50">
            <HiThumbDown className="w-4 h-4" />{isCancellation ? "Deny" : "Reject"}
          </button>
          <button onClick={() => onApprove(request)} disabled={busy} className="flex items-center gap-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 px-5 py-2.5 rounded-xl transition disabled:opacity-50 shadow-sm shadow-violet-200">
            {busy ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiThumbUp className="w-4 h-4" />}
            {busy ? "Approving…" : isCancellation ? "Approve Cancellation" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}
