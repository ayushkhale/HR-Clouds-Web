// ─────────────────────────────────────────────────────────────────────────────
// MySchedulePage — the week ahead, what the person owes inside it, and the
// rules their attendance is graded by. Mounted in all three workspaces under
// each one's own prefix (SELF_SERVICE_PAGES.schedule) for the same reason the
// rest of self-service is: everybody punches and everybody is graded, HR and
// managers included, so nobody is sent into the employee workspace to read
// their own schedule (CLAUDE.md §2).
//
// WHY THIS PAGE EXISTS. HR could always set a grace period, half/full-day
// thresholds, break caps and a correction window — and the people those rules
// land on could see none of it. An employee learned the grace period by being
// marked late, and the correction window by a 400 on a form they had already
// filled in. This is the one screen that answers "what am I measured against?"
// in full, which the punch card can only hint at in a line
// (md_updates/2026-10-21_shift_and_attendance_policy_visibility_frontend_guide.md).
//
// READ-ONLY, ON PURPOSE. Shift assignment and policy editing are HR-only
// (`/attendance/hr/shifts/assign`, `/attendance/hr/policies`). An employee
// cannot change any of this, so the page states it and says who can, rather
// than offering controls that would 403 (§2).
//
// ── THE PAGE IN FOUR BANDS (rebuilt 2026-10-22) ─────────────────────────────
// The first build stacked six full-width panels and opened with a window
// picker, which put the least useful thing — a 90-day agenda nobody scrolled —
// at the top. The window is now fixed at SEVEN DAYS (user decision), and the
// page reads top to bottom as four questions in the order people ask them:
//
//   1. WHAT DOES MY WEEK LOOK LIKE?   the week board, seven cards
//   2. WHO ELSE IS IN?                team cover (manager/HR only)
//   3. WHAT DO I OWE, AND WHAT AM I SET UP WITH?   falling due | your setup
//   4. HOW IS A DAY OF MINE COUNTED?  the rules, with who they apply to
//
// Band 3 is one grid rather than three stacked panels: the deadline list is
// long and the setup facts are short, so they belong side by side (§5 — grid,
// don't narrow). Shift, rotation and days off used to be three panels and are
// now one card, because they are one answer.
//
// ── TWO READS, DELIBERATELY ─────────────────────────────────────────────────
//  1. `/attendance/schedule/agenda` — the week, the things falling due, and
//     since v2 the employee context, the weekly-off rule and the resolved
//     attendance policy. The server resolves `day_kind` per day with the same
//     code unit the roster and the auto-absent cron use, so a day here cannot
//     contradict the payslip. Nothing in this subtree re-derives a day from
//     shift/holiday/leave presence; see `agendaMeta.js` for the traps that rule
//     exists to prevent.
//  2. `/attendance/shift` — the shift assignment itself: `assignment`
//     (effective dates), `rotation` (the cycle) and `weekly_offs` (every rule,
//     not just the matched one). The agenda carries none of those three.
//
// WHY NOT ONE READ. Neither answers the whole page, and they fail differently:
// a failed agenda must not take the rules panel down with it, so each half
// renders its own error state and the page never blanks on one of them. Since
// v2 the POLICY arrives on both, which is a redundancy worth keeping — the
// rules survive either read failing. `policyOf(data) || agenda.policy` prefers
// the shift read only because it is the older, more widely exercised path.
//
// THE MANAGER'S EXTRA PANEL is coverage over their direct reports. It is an
// addition to the same page, never a different page: a manager promoted to HR
// must find the same screen (§2). Scope is direct reports for HR too — the
// endpoint is deliberately not org-wide, so this is not the place to build an
// organisation-wide roster view.
//
// CONTRACT TRAPS (md_attendance/3_user_attendance_api.md §12)
//  · `GET /attendance/shift` answers a WRAPPER: `{ assignment, shift, policy,
//    rotation, weekly_offs }`. `shift` is null for an unassigned employee — a
//    valid state, not an error.
//  · `policy` IS OPTIONAL on both reads. Absent on both → the rules panel says
//    so instead of printing a column of N/A (§7). It is a SIBLING of `shift`,
//    so it can be present with no shift at all: that is the organisation's
//    default policy, which is exactly what then applies.
//  · `weekly_offs[].days_of_week` is 0 = Sunday. An EMPTY list means no rest
//    day is configured, which is not the same as "works every day" — we don't
//    know that, so it is never said.
//  · The agenda's `weekly_off_policy` is the ONE matched rule with its
//    provenance; `/attendance/shift`'s `weekly_offs` is every rule that
//    touches this person. The weekday grid is drawn from the union of both, so
//    it stays right when either read is thin.
//  · `employee.location_id` arrives with NO location name, so the location is
//    not shown anywhere on this page — an id never reaches the screen (§4).
//  · A 404/401 is a genuine failure, but "no shift assigned" is not, and the
//    two must not read alike: a failed read says "couldn't load", never
//    "nothing set" (§7).
//  · Thresholds are decimal HOURS, as strings. Every one of them goes through
//    `policyRules.js`; nothing on this page multiplies by 60 itself.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  HiClock, HiExclamationCircle, HiIdentification, HiOutlineCalendar,
  HiRefresh, HiScale, HiSwitchHorizontal,
} from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import FieldHelp, { HelpLabel } from "../fieldHelp/FieldHelp";
import { attendanceAPI } from "../api";
import { DICTIONARY } from "../config/dictionary";
import { fmtClockTime, fmtDate, fmtMinutes } from "../attendance/dates";
import { unwrap } from "../attendance/normalize";
import { SHIFT_TYPES, TONE_CLASSES, humanize } from "../attendance/enums";
import { WEEKDAY_NAMES, policyOf, ruleLines, shiftOf, weeklyOffNames } from "../attendance/policyRules";
import { employeeTargeting, weeklyOffRule } from "../attendance/agendaMeta";
import { attendanceErrorMessage } from "../utils/attendanceErrors";
import { useMyAgenda, useTeamAgenda } from "../attendance/useAgenda";
import { AgendaDeadlines, AgendaWeek } from "../attendance/ScheduleAgenda";
import TeamCoverageStrip from "../attendance/TeamCoverageStrip";
import { useCurrentWorkspace } from "../attendance/paths";
import { EmptyState, ErrorState, InlineAlert, LoadingRows } from "../attendance/ui";
import { SECONDARY_BTN } from "../documents/ui";

const SURFACE = "attendance.my_schedule";
const COMP_OFF = DICTIONARY.TERMS.COMP_OFF;

const PANEL = "bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden";
const PANEL_HEAD = "px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-2.5";

/** Shift length in minutes, carrying overnight shifts past midnight. */
function shiftLength(shift) {
  const parse = (v) => {
    const m = String(v || "").match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const start = parse(shift?.start_time);
  let end = parse(shift?.end_time);
  if (start === null || end === null) return null;
  if (shift.is_overnight || end <= start) end += 1440;
  return end - start;
}

/** One label-above-value cell, the same shape DetailGrid uses in dialogs. */
function Fact({ label, value, help }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        {help ? <HelpLabel text={label} help={help} /> : label}
      </p>
      <p className="text-sm font-bold text-slate-800 mt-1 break-words">{value}</p>
    </div>
  );
}

/**
 * One rule, as a row: what it is, the figure, and what it means for the person.
 * The note carries the whole value of this page, so it is never truncated.
 */
function RuleRow({ rule }) {
  return (
    <li className="px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-5">
      <p className="sm:w-56 shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wider pt-0.5">
        <HelpLabel text={rule.label} help={{ surface: SURFACE, field: rule.key, label: rule.label, size: "sm" }} />
      </p>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800">{rule.value}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{rule.note}</p>
      </div>
    </li>
  );
}

export default function MySchedulePage() {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  const agenda = useMyAgenda();

  // Coverage is only read where the endpoint accepts the caller. An employee
  // never asks — a 403 would tell us only what the workspace already says
  // (§2: a capability a role lacks is absent, not broken).
  const workspace = useCurrentWorkspace();
  const canSeeTeam = workspace === "manager" || workspace === "hr";
  const team = useTeamAgenda({ enabled: canSeeTeam });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await attendanceAPI.getMyShift();
      setState({ data: unwrap(res) || null, loading: false, error: null });
    } catch (error) {
      // NOT swallowed to null the way the punch card does it. There, a failed
      // read degrades to "no shift assigned" because the card has a day to get
      // on with; here the whole page is the answer, so a failure must say so
      // rather than quietly claim nothing is set up (§7).
      setState({ data: null, loading: false, error });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { data, loading, error } = state;
  const shift = shiftOf(data);
  // Two sources for one policy since v2 — see the header. Either read failing
  // leaves the rules standing.
  const policy = policyOf(data) || agenda.policy;
  const assignment = data?.assignment || null;
  const rotation = data?.rotation || null;
  const offRule = weeklyOffRule(agenda.weeklyOffPolicy);
  // The matched rule's days and every rule's days, merged: the agenda knows
  // which rule won, the shift read knows about all of them, and a person can be
  // covered by two overlapping rules.
  const offs = weeklyOffNames([...(data?.weekly_offs || []), ...(offRule?.days ? [{ days_of_week: offRule.days }] : [])]);
  const targeting = employeeTargeting(agenda.employee);
  const joined = agenda.employee?.joining_date || "";
  const rules = ruleLines(shift, policy);
  const length = shiftLength(shift);
  const shiftTypeKey = shift?.shift_type || shift?.type;
  const firstLoad = loading && !data;

  const busy = loading || agenda.loading || team.loading;
  // Depends on the two `reload` callbacks, not on the hook results — those are
  // fresh objects every render, which would rebuild this on every keystroke.
  const { reload: reloadAgenda } = agenda;
  const { reload: reloadTeam } = team;
  const refreshAll = useCallback(() => {
    load();
    reloadAgenda();
    if (canSeeTeam) reloadTeam();
  }, [load, reloadAgenda, reloadTeam, canSeeTeam]);

  // Coverage failures are shown inline inside the panel rather than as a page
  // error state, so the message is resolved here through the attendance error
  // map — the same words `ErrorState` would have used (§6).
  const teamNote = team.error
    ? attendanceErrorMessage(team.error, "Couldn’t load your team’s cover just now.")
    : "";

  return (
    <>
      <DashboardTopBar title="My Schedule & Rules" />
      <main className="p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto flex-1">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              <HelpLabel text="My Schedule & Rules" help={{ surface: SURFACE, field: "page", label: "this page" }} />
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Your next seven days, what you owe inside them, and the rules your attendance is measured against. HR sets your hours and days off — you can’t change them here, but this is where you check how a day of yours gets counted.
            </p>
          </div>
          <button type="button" onClick={refreshAll} disabled={busy} className={SECONDARY_BTN}>
            <HiRefresh className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* ── 1. The week ─────────────────────────────────────────────────────
            The agenda failing must not take the rules panel with it, so this
            is an inline error rather than an early return. */}
        {agenda.error ? (
          <ErrorState
            error={agenda.error}
            onRetry={reloadAgenda}
            fallback="Couldn’t load your week."
          />
        ) : (
          <>
            <AgendaWeek
              days={agenda.days}
              summary={agenda.summary}
              timezone={agenda.timezone}
              loading={agenda.loading}
            />

            {/* ── 2. Who else is in (manager and HR) ───────────────────────── */}
            {canSeeTeam && (
              <TeamCoverageStrip
                days={team.days}
                teamSize={team.teamSize}
                lanes={team.lanes}
                loading={team.loading}
                errorNote={teamNote}
              />
            )}
          </>
        )}

        {error && <ErrorState error={error} onRetry={load} fallback="Couldn’t load your shift and rules." />}

        {firstLoad && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
            <div className={`${PANEL} p-6 xl:col-span-2`}><LoadingRows rows={3} /></div>
            <div className={`${PANEL} p-6`}><LoadingRows rows={4} /></div>
          </div>
        )}

        {!firstLoad && !error && (
          <>
            {/* ── 3. What I owe, and what I'm set up with ──────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
              {/* The deadline list is gone when the agenda failed — its own
                  error is already at the top of the page — so the setup card
                  takes the whole row rather than leaving two empty columns. */}
              {!agenda.error && (
                <div className="xl:col-span-2 min-w-0">
                  <AgendaDeadlines
                    days={agenda.days}
                    lanes={agenda.lanes}
                    timezone={agenda.timezone}
                    loading={agenda.loading}
                    onRetry={reloadAgenda}
                    onTaskChanged={reloadAgenda}
                    recoveredTasks={agenda.recoveredTasks}
                    tasksRecovering={agenda.tasksRecovering}
                    tasksUnrecoverable={agenda.tasksUnrecoverable}
                    tasksAbsent={agenda.tasksAbsent}
                  />
                </div>
              )}

              {/* One card for the three things that are one answer: the hours,
                  the cycle they move on, and the days they don't apply to. */}
              <div className={`${PANEL} min-w-0 ${agenda.error ? "xl:col-span-3" : ""}`}>
                <div className={PANEL_HEAD}>
                  <HiClock className="w-4 h-4 text-purple-600 shrink-0" />
                  <h2 className="text-base font-bold text-slate-800">Your working week</h2>
                  {shiftTypeKey && (
                    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider rounded-full border px-2 py-0.5 ${TONE_CLASSES.purple}`}>
                      {SHIFT_TYPES[shiftTypeKey]?.label || humanize(shiftTypeKey)}
                    </span>
                  )}
                </div>

                {shift ? (
                  <div className="px-5 sm:px-6 py-5 space-y-5">
                    <div>
                      <p className="text-lg font-bold text-slate-900">{shift.name || "Your shift"}</p>
                      <p className="text-sm font-semibold text-purple-700 mt-1">
                        {fmtClockTime(shift.start_time)} – {fmtClockTime(shift.end_time)}
                        {shift.is_overnight && <span className="ml-1.5 text-[11px] font-bold text-indigo-600">ends next day</span>}
                      </p>
                      {SHIFT_TYPES[shiftTypeKey]?.description && (
                        <p className="text-xs text-slate-500 mt-1">{SHIFT_TYPES[shiftTypeKey].description}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                      <Fact label="Shift length" value={length !== null ? fmtMinutes(length) : "N/A"} />
                      <Fact label="In force since" value={fmtDate(assignment?.effective_from)} />
                      <Fact label="In force until" value={assignment?.effective_to ? fmtDate(assignment.effective_to) : "No end date"} />
                      {/* Only worth saying when the agenda knows it: it is what
                          makes "Before you joined" days in the week make sense. */}
                      {joined && <Fact label="You joined" value={fmtDate(joined)} />}
                    </div>

                    {/* The clock on the wall this schedule is read against. Only
                        worth saying when it isn't the one in the browser —
                        otherwise it is noise on every screen in the country. */}
                    {shift.timezone && shift.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone && (
                      <InlineAlert tone="sky">
                        These times are in {shift.timezone}, which isn’t your device’s time zone — your clock may read differently from your shift.
                      </InlineAlert>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    icon={HiOutlineCalendar}
                    title="No shift assigned to you"
                    message="You don’t have set hours, so nothing is measured against a start or end time. The rules below still apply to your attendance. Ask HR if you expected a shift."
                  />
                )}

                {/* ── Your rotation, when the shift cycles ───────────────── */}
                {rotation && (
                  <div className="px-5 sm:px-6 py-4 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <HiSwitchHorizontal className="w-3.5 h-3.5 text-purple-500" /> Your rotation
                    </p>
                    <p className="text-sm font-bold text-slate-800 mt-1.5">{rotation.name || "Rotating shifts"}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      Your shift changes on a cycle, so the hours above are today’s. The week board shows what the cycle actually lands on for each day.
                    </p>
                    {Array.isArray(rotation.sequence) && rotation.sequence.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {rotation.sequence.map((entry, i) => (
                          <span key={entry?.id || i} className="inline-flex items-center gap-1.5 rounded-full border border-purple-100 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
                            <span className="font-bold">{i + 1}</span>
                            {entry?.shift?.name || entry?.name || (entry?.is_off ? "Off" : "Shift")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Your days off, and which rule gives them ───────────── */}
                <div className="px-5 sm:px-6 py-4 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <HiOutlineCalendar className="w-3.5 h-3.5 text-purple-500" />
                    <HelpLabel text="Your days off" help={{ surface: SURFACE, field: "weekly_offs", label: "your days off", size: "sm" }} />
                  </p>

                  {offs.length > 0 ? (
                    <>
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {WEEKDAY_NAMES.map((day) => {
                          const off = offs.includes(day);
                          return (
                            <span
                              key={day}
                              className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold text-center ${off ? TONE_CLASSES.purple : "bg-slate-50 text-slate-400 border-slate-200"}`}
                            >
                              {day.slice(0, 3)}
                              <span className="block text-[8px] font-semibold uppercase tracking-wider mt-0.5">{off ? "Off" : "In"}</span>
                            </span>
                          );
                        })}
                      </div>

                      {/* The "nameless weekend" v2 fixed: the rule's own name,
                          and who else it covers. `matched_by` itself never
                          reaches the screen (§4) — `weeklyOffAudience` says it
                          as the group instead. */}
                      {offRule && (
                        <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-3">
                          <p className="text-xs font-bold text-slate-700">
                            <HelpLabel text={offRule.name} help={{ surface: SURFACE, field: "matched_by", label: "why these are your days off", size: "sm" }} />
                          </p>
                          {offRule.audience && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{offRule.audience}</p>}
                          {offRule.from && (
                            <p className="text-[11px] text-slate-400 mt-1.5">
                              In force since {fmtDate(offRule.from)}
                              {offRule.to ? ` until ${fmtDate(offRule.to)}` : ""}
                            </p>
                          )}
                        </div>
                      )}

                      <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                        You can still clock in on a day off — people do work weekends, and that’s how {COMP_OFF.toLowerCase()} is earned. The day is recorded separately rather than counted as a normal working day.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      No weekly day off is set for you. That doesn’t mean you work every day — ask HR which days you’re expected in.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── 4. How a day of mine is counted ─────────────────────────── */}
            <div className={PANEL}>
              <div className={PANEL_HEAD}>
                <HiScale className="w-4 h-4 text-purple-600 shrink-0" />
                <h2 className="text-base font-bold text-slate-800">How your attendance is counted</h2>
                {policy?.name && (
                  <span className="min-w-0 text-[11px] font-semibold text-slate-400 truncate">{policy.name}</span>
                )}
                <FieldHelp surface={SURFACE} field="policy" label="how your attendance is counted" size="sm" className="shrink-0" />
              </div>

              {/* Why THIS rule set is yours. Targeting is by department,
                  location, shift and employment type, so the person's own setup
                  is the answer — and it is the v2 `employee` block's whole
                  purpose on this page. */}
              {targeting && (
                <p className="px-5 sm:px-6 pt-4 text-xs text-slate-500 leading-relaxed flex items-start gap-2">
                  <HiIdentification className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
                  <span>
                    {targeting}
                    {policy?.is_default && " This is your organisation’s standard rule set, as nothing more specific is set for you."}
                  </span>
                </p>
              )}

              {rules.length > 0 ? (
                <ul className="divide-y divide-slate-100 mt-2">
                  {rules.map((rule) => <RuleRow key={rule.key} rule={rule} />)}
                </ul>
              ) : (
                <EmptyState
                  icon={HiExclamationCircle}
                  title="No rules published for you yet"
                  message="Your organisation hasn’t published the rules your attendance is measured against, so we can’t show them here. Your clock-ins are still recorded as normal — ask HR how your days are counted."
                />
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
