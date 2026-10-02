// ─────────────────────────────────────────────────────────────────────────────
// AssignmentInspector.jsx — the record inspector behind a Leave Assignment row:
// which policy this person is on, what it gives them, what they have left, which
// of their rules were changed by hand, and the history of policies they've had.
//
// It is a DetailDialog composition, never a hand-rolled modal (CLAUDE.md §3).
// The row is the only way in — there is no View button in the list.
//
// THREE READS, EACH ALLOWED TO FAIL ON ITS OWN:
//   GET …/leave-config   the rules (and the policy_default each one came from)
//   GET …/balances       what's left this year
//   GET …/assignments    the history
// They are settled in parallel and tracked separately, because a failed read and
// an empty one must never look the same (§7): "Couldn't load" invites a retry,
// "Nothing on file" invites assigning a policy, and showing the second when the
// first is true is how somebody ends up assigning over rules that were there all
// along.
//
// WHY THE CUSTOMISE BUTTON IS IN THE TABLE, NOT THE FOOTER: customising applies
// to one leave type, and the footer has no way to say which. The line item is
// where the choice already is. The policy-level actions — Change policy, End —
// are in the footer where §3 wants them.
//
// Balances arrive as Postgres decimals, i.e. strings: parseFloat before any
// arithmetic, and every day count goes through formatDayCount so a half day
// reads "1 Half Day" and never 0.5 (§6).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiCalendar, HiClipboardCheck, HiClock, HiPencil, HiSparkles, HiUser } from "react-icons/hi";
import DetailDialog, {
  DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable,
} from "../../../../shared/components/DetailDialog";
import { leaveAPI } from "../../../../shared/api";
import { leaveErrorMessage } from "../../../../shared/utils/leaveErrors";
import { formatDayCount } from "../../../../shared/utils/formatUtils";
import { fmtDate, todayYMD, ymdOnly } from "../../../../shared/attendance/dates";
import { listFrom } from "../../../../shared/attendance/normalize";
import { noticeModeOf } from "../../../../shared/utils/leaveConfig";
import {
  ACCRUAL_LABEL, ASSIGNMENT_STATE, COVERAGE, assignmentState, canEnd,
} from "../../../../shared/leaves/leaveAssignmentMeta";

const SECONDARY_BTN = "px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition";
const PRIMARY_BTN = "px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200";

const LOADING = { status: "loading", rows: [], data: null, error: null };
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** A value that could not be read reads "Couldn't load", never "Not set". */
const readValue = (state, value) => (state.status === "error" ? "Couldn’t load" : state.status === "loading" ? "Loading…" : value);

/** Which rule a server field name refers to, in the words the forms use. */
const FIELD_LABEL = {
  assigned_annual_quota: "days per year",
  accrual_type: "how it’s given",
  max_carry_forward: "kept for next year",
  probation_restriction_days: "wait after joining",
  max_negative_balance: "extra days below zero",
  notice_period_max_days: "leave during notice",
};

const noticeText = (v) => {
  const mode = noticeModeOf(v);
  if (mode === "unrestricted") return "No limit";
  if (mode === "blocked") return "Not allowed";
  return formatDayCount(v, { fallback: "N/A" });
};

export default function AssignmentInspector({ row, onClose, onChangePolicy, onEnd, onCustomise }) {
  const userId = row?.userId;
  const [config, setConfig] = useState(LOADING);
  const [balances, setBalances] = useState(LOADING);
  const [history, setHistory] = useState(LOADING);
  const token = useRef(0);

  const load = useCallback(() => {
    if (!userId) return;
    const mine = ++token.current;
    setConfig(LOADING);
    setBalances(LOADING);
    setHistory(LOADING);
    const settle = (promise, setter, pick) =>
      promise.then(
        (res) => { if (mine === token.current) setter({ status: "ok", ...pick(res), error: null }); },
        (err) => { if (mine === token.current) setter({ status: "error", rows: [], data: null, error: err }); },
      );
    settle(leaveAPI.getUserLeaveConfig(userId), setConfig, (res) => {
      const data = res?.data ?? res ?? {};
      return { data, rows: Array.isArray(data.types) ? data.types : [] };
    });
    settle(leaveAPI.getUserBalances(userId, new Date().getFullYear()), setBalances, (res) => ({ rows: listFrom(res, ["balances"]), data: null }));
    settle(leaveAPI.getUserAssignments(userId), setHistory, (res) => ({ rows: listFrom(res, ["assignments", "rows"]), data: null }));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const today = todayYMD();
  // The list row's assignment is enough to open on; leave-config refreshes it.
  const assignment = (config.status === "ok" && config.data?.assignment) || row?.assignment || null;
  const state = assignmentState(assignment, today);
  const coverage = COVERAGE[row?.coverage] || COVERAGE.none;
  const legacy = row?.coverage === "legacy" || assignment?.legacy === true;

  const types = config.rows;
  const overridden = useMemo(() => types.filter((t) => t.is_overridden), [types]);
  const totalLeft = useMemo(() => balances.rows.reduce((sum, b) => sum + num(b.current_balance), 0), [balances.rows]);
  const totalTaken = useMemo(() => balances.rows.reduce((sum, b) => sum + num(b.total_used), 0), [balances.rows]);

  const policyName = legacy
    ? "Set up before policies were tracked"
    : assignment?.template?.name || (row?.coverage === "none" ? "No policy" : null);

  return (
    <DetailDialog
      eyebrow="Leave policy"
      icon={HiClipboardCheck}
      title={row?.name}
      subtitle={row?.email && row.email !== row?.name ? row.email : row?.designation || undefined}
      badge={<DetailPill tone="onDark">{state ? ASSIGNMENT_STATE[state].label : coverage.label}</DetailPill>}
      onClose={onClose}
      footer={
        <>
          {row?.coverage === "none" && (
            <DetailFooterNote>
              They have no leave rules at all, so there is nothing to show here and they cannot apply for leave.
            </DetailFooterNote>
          )}
          {canEnd(assignment, today) && (
            <button type="button" onClick={() => onEnd?.(row, assignment)} className={SECONDARY_BTN}>End this policy</button>
          )}
          <button type="button" onClick={() => onChangePolicy?.(row)} className={PRIMARY_BTN}>
            {row?.coverage === "none" ? "Assign a policy" : "Change policy"}
          </button>
        </>
      }
    >
      <DetailStats
        items={[
          {
            label: "Leave left this year",
            value: balances.status === "error" ? "Couldn’t load" : balances.status === "loading" ? "Loading…" : formatDayCount(totalLeft, { fallback: "0 Days" }),
            icon: HiCalendar,
            hint: balances.status === "ok" ? `${formatDayCount(totalTaken, { lower: true, fallback: "0 days" })} taken` : undefined,
          },
          {
            label: "Kinds of leave",
            value: readValue(config, types.length),
            icon: HiSparkles,
          },
          {
            label: "Rules set just for them",
            value: readValue(config, overridden.length),
            icon: HiPencil,
            hint: config.status === "ok" && overridden.length === 0 ? "All straight from the policy" : undefined,
          },
        ]}
      />

      <DetailSection title="The policy they’re on" icon={HiClipboardCheck} collapsible={false}>
        <DetailGrid
          cols={4}
          items={[
            ["Policy", policyName],
            ["Started", assignment?.effective_from ? fmtDate(ymdOnly(assignment.effective_from)) : null],
            ["Last day", assignment?.effective_to ? fmtDate(ymdOnly(assignment.effective_to)) : assignment ? "No end date" : null],
            ["Who set it up", assignment?.assigned_by?.name || null],
          ]}
        />
        <p className="mt-3 text-xs text-slate-500 leading-relaxed">{coverage.note}</p>
      </DetailSection>

      <DetailSection
        title={config.status === "ok" && types.length ? `What this gives them (${types.length})` : "What this gives them"}
        icon={HiSparkles}
        collapsible={false}
      >
        {config.status === "error" ? (
          <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3">
            {leaveErrorMessage(config.error, "Couldn’t load their leave rules.")}
          </p>
        ) : (
          <DetailTable
            columns={[
              { header: "Kind of leave", render: (t) => t.leave_type?.name },
              { header: "Days per year", render: (t) => formatDayCount(t.effective?.assigned_annual_quota, { fallback: "N/A" }) },
              { header: "How it’s given", render: (t) => ACCRUAL_LABEL[t.effective?.accrual_type] },
              { header: "Kept for next year", render: (t) => formatDayCount(t.effective?.max_carry_forward, { fallback: "N/A" }) },
              { header: "During notice", render: (t) => noticeText(t.effective?.notice_period_max_days) },
              {
                header: "",
                align: "right",
                render: (t) => (
                  <button
                    type="button"
                    data-row-action
                    onClick={() => onCustomise?.(row, t)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:bg-purple-50 px-2.5 py-1.5 rounded-lg transition"
                  >
                    <HiPencil className="w-3.5 h-3.5" />
                    {t.is_overridden ? "Edit theirs" : "Customise"}
                  </button>
                ),
              },
            ]}
            rows={types}
            rowKey={(t) => t.leave_type_id}
            empty={config.status === "loading" ? "Loading…" : "No leave rules on file. Assign a policy to give them their days."}
          />
        )}
      </DetailSection>

      {overridden.length > 0 && (
        <DetailSection
          title={`Rules set just for them (${overridden.length})`}
          icon={HiPencil}
          defaultOpen={false}
        >
          <DetailTable
            columns={[
              { header: "Kind of leave", render: (t) => t.leave_type?.name },
              { header: "Changed", render: (t) => (t.overridden_fields || []).map((f) => FIELD_LABEL[f] || f).join(", ") },
              { header: "They get", render: (t) => formatDayCount(t.effective?.assigned_annual_quota, { fallback: "N/A" }) },
              { header: "The policy says", render: (t) => formatDayCount(t.policy_default?.annual_quota, { fallback: "N/A" }) },
            ]}
            rows={overridden}
            rowKey={(t) => t.leave_type_id}
          />
          <p className="mt-3 text-xs text-slate-500 leading-relaxed">
            These were changed for this person on their own. Editing the policy won’t move them; use Customise on the
            line above to change or undo it.
          </p>
        </DetailSection>
      )}

      <DetailSection
        title={balances.status === "ok" ? `Leave left this year — ${formatDayCount(totalLeft, { lower: true, fallback: "0 days" })}` : "Leave left this year"}
        icon={HiCalendar}
        defaultOpen={false}
      >
        {balances.status === "error" ? (
          <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3">
            {leaveErrorMessage(balances.error, "Couldn’t load their balances.")}
          </p>
        ) : (
          <DetailTable
            columns={[
              { header: "Kind of leave", render: (b) => b.leave_type?.name },
              { header: "Left", align: "right", render: (b) => formatDayCount(num(b.current_balance), { fallback: "0 Days" }) },
              { header: "Given so far", align: "right", render: (b) => formatDayCount(num(b.total_accrued), { lower: true, fallback: "0 days" }) },
              { header: "Taken", align: "right", render: (b) => formatDayCount(num(b.total_used), { lower: true, fallback: "0 days" }) },
            ]}
            rows={balances.rows}
            rowKey={(b) => b.id || b.leave_type_id}
            empty={balances.status === "loading" ? "Loading…" : "Nothing on file for this year."}
          />
        )}
      </DetailSection>

      {history.status === "ok" && history.rows.length > 0 && (
        <DetailSection title={`Policies they’ve been on (${history.rows.length})`} icon={HiClock} defaultOpen={false}>
          <DetailTable
            columns={[
              { header: "Policy", render: (h) => (h.legacy ? "Set up before policies were tracked" : h.template?.name) },
              { header: "From", render: (h) => fmtDate(ymdOnly(h.effective_from)) },
              { header: "Until", render: (h) => (h.effective_to ? fmtDate(ymdOnly(h.effective_to)) : "No end date") },
              { header: "Set up by", render: (h) => h.assigned_by?.name },
              { header: "Ended by", render: (h) => h.ended_by?.name },
            ]}
            rows={history.rows}
            rowKey={(h) => h.id}
          />
        </DetailSection>
      )}

      <DetailSection title="Who this is" icon={HiUser} defaultOpen={false}>
        <DetailGrid
          cols={4}
          items={[
            ["Name", row?.name],
            { label: "Employee code", value: row?.employeeCode, mono: true },
            ["Department", row?.department],
            ["Job title", row?.designation],
          ]}
        />
      </DetailSection>
    </DetailDialog>
  );
}
