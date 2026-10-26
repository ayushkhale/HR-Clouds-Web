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
// ── FOUR TABS, NOT FOUR BANDS (rebuilt 22 Oct 2026, user decision) ──────────
// It was four full-width bands stacked down one page: the week board, team
// cover, a deadline list beside a setup card, then every rule. Everything was
// true and the page was a wall — the user's words were "too much clutteredness,
// i want clean minimal". So the four questions are now four TABS, the same
// underline bar My Claims & Benefits uses, and each one is one screenful:
//
//   Next 7 days          the four figures, the week table, what falls due
//   Working week         your hours on a clock, the cycle, your days off
//   How days are counted the grading ladder and every published rule
//   Who’s in             team cover — manager and HR only
//
// The tab lives in `?tab=`, so a refresh or a shared link reopens the same one.
//
// ── WHAT IS DRAWN, AND WHAT IS A TABLE (same rebuild) ───────────────────────
// THE WEEK IS A TABLE, not a picture. A card grid and then a colour ribbon were
// both built and both rejected by the user — a schedule is read for Thursday,
// not for its shape — so `AgendaWeek` is Date · Day · Hours · Falling due, the
// attendance history's own shape, in a panel that folds.
//
// Two figures on this page ARE shapes, and only those two are drawn:
//  · YOUR HOURS are a block on a 24-hour track (`ShiftClockTrack`), with the
//    grace window drawn on the front of it — "9:00 AM – 6:00 PM" is a fact,
//    where your day sits inside a day is a picture.
//  · THE GRADING is a ladder (`GradingLadder`): the bands your hours fall into
//    and the two thresholds between them, which is the one rule on this page
//    people get wrong, and the hardest to read as two numbers in a row.
// Every fill carries a text label beside it, so none of them is read by colour
// alone, and the palette is the product's own purple (§5).
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
// BOTH READS START AT ONCE, whichever tab is open. They are what the tab bar's
// own counts and the page's error states are made of, and a tab must not pause
// to fetch when the reader presses it — the tabs are a layout, not a router.
//
// WHY NOT ONE READ. Neither answers the whole page, and they fail differently:
// a failed agenda must not take the rules tab down with it, so each half
// renders its own error state and the page never blanks on one of them. Since
// v2 the POLICY arrives on both, which is a redundancy worth keeping — the
// rules survive either read failing. `policyOf(data) || agenda.policy` prefers
// the shift read only because it is the older, more widely exercised path.
//
// THE TEAM TAB is coverage over their direct reports. It is a tab on the same
// page, never a different page: a manager promoted to HR must find the same
// screen (§2). Scope is direct reports for HR too — the endpoint is
// deliberately not org-wide, so this is not the place to build an
// organisation-wide roster view.
//
// CONTRACT TRAPS (md_attendance/3_user_attendance_api.md §12)
//  · `GET /attendance/shift` answers a WRAPPER: `{ assignment, shift, policy,
//    rotation, weekly_offs }`. `shift` is null for an unassigned employee — a
//    valid state, not an error.
//  · `policy` IS OPTIONAL on both reads. Absent on both → the rules tab says
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
import { useSearchParams } from "react-router-dom";
import {
  HiCalendar, HiClock, HiExclamationCircle, HiIdentification, HiOutlineCalendar,
  HiRefresh, HiScale, HiSwitchHorizontal, HiUsers,
} from "react-icons/hi";
import DashboardTopBar from "../components/DashboardTopBar";
import FieldHelp, { HelpLabel } from "../fieldHelp/FieldHelp";
import { attendanceAPI } from "../api";
import { DICTIONARY } from "../config/dictionary";
import { clockMinutes, fmtClockMinutes, fmtClockTime, fmtDate, fmtMinutes } from "../attendance/dates";
import { unwrap } from "../attendance/normalize";
import { SHIFT_TYPES, TONE_CLASSES, humanize } from "../attendance/enums";
import {
  WEEKDAY_NAMES, fullDayMinutes, graceMinutes, halfDayMinutes, policyOf, ruleLines,
  shiftOf, weeklyOffNames,
} from "../attendance/policyRules";
import { employeeTargeting, weeklyOffRule } from "../attendance/agendaMeta";
import { attendanceErrorMessage } from "../utils/attendanceErrors";
import { useMyAgenda, useTeamAgenda } from "../attendance/useAgenda";
import { AgendaDeadlines, AgendaTiles, AgendaWeek } from "../attendance/ScheduleAgenda";
import TeamCoverageStrip from "../attendance/TeamCoverageStrip";
import { useCurrentWorkspace } from "../attendance/paths";
import { EmptyState, ErrorState, InlineAlert, LoadingRows } from "../attendance/ui";
import { SECONDARY_BTN } from "../documents/ui";

const SURFACE = "attendance.my_schedule";
const COMP_OFF = DICTIONARY.TERMS.COMP_OFF;

const PANEL = "bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden";
const PANEL_HEAD = "px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-2.5";

/**
 * The four questions, in the order people ask them. `team` is only mounted for
 * a workspace whose endpoint accepts the caller — a tab a role lacks is absent,
 * not disabled (§2).
 */
const TABS = [
  { key: "week", label: "Next 7 days", icon: HiCalendar },
  { key: "shift", label: "Working week", icon: HiClock },
  { key: "rules", label: "How days are counted", icon: HiScale },
  { key: "team", label: "Who’s in", icon: HiUsers, teamOnly: true },
];

/** Shift length in minutes, carrying overnight shifts past midnight. */
function shiftLength(shift) {
  const start = clockMinutes(shift?.start_time);
  let end = clockMinutes(shift?.end_time);
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

const DAY_TICKS = [
  { at: 0, label: "12am" },
  { at: 360, label: "6am" },
  { at: 720, label: "12pm" },
  { at: 1080, label: "6pm" },
  { at: 1440, label: "12am" },
];

/**
 * YOUR HOURS ON A 24-HOUR TRACK. A start and an end time are two facts; where
 * they sit inside a day is a shape, and the shape is what tells somebody on an
 * evening or overnight shift at a glance that their day crosses midnight.
 *
 * An overnight shift is drawn as the TWO blocks it really is — tonight's tail
 * and tomorrow's head — rather than one block running off the end, because a
 * bar that stops at the edge says the shift stops there too.
 *
 * The grace window is drawn on the front of the block in fuchsia (§5 — the
 * pending/warning hue), with the cutoff named in words beside it. It is the one
 * rule people meet before they have read any rules.
 */
function ShiftClockTrack({ shift, policy }) {
  const start = clockMinutes(shift?.start_time);
  const end = clockMinutes(shift?.end_time);
  if (start === null || end === null) return null;

  const overnight = !!shift?.is_overnight || end <= start;
  const blocks = overnight ? [[start, 1440], [0, end]] : [[start, end]];
  const grace = graceMinutes(policy);
  const graceEnd = grace !== null && grace > 0 ? Math.min(start + grace, 1440) : null;
  const pct = (minutes) => `${(minutes / 1440) * 100}%`;

  return (
    <div>
      <div className="relative h-11 rounded-xl bg-slate-100 overflow-hidden">
        {/* Gridlines at the quarter days, so a block's position is readable
            against something rather than guessed at. */}
        {DAY_TICKS.slice(1, -1).map((tick) => (
          <span key={tick.at} className="absolute top-0 bottom-0 w-px bg-white" style={{ left: pct(tick.at) }} aria-hidden="true" />
        ))}

        {blocks.map(([from, to], i) => (
          <span
            key={`${from}-${to}-${i}`}
            className="absolute top-0 bottom-0 bg-purple-600 rounded-[4px]"
            style={{ left: pct(from), width: pct(Math.max(to - from, 8)) }}
            aria-hidden="true"
          />
        ))}

        {graceEnd !== null && (
          <span
            className="absolute top-0 bottom-0 bg-fuchsia-400 rounded-l-[4px]"
            style={{ left: pct(start), width: pct(Math.max(graceEnd - start, 4)) }}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="relative h-4 mt-1">
        {DAY_TICKS.map((tick, i) => (
          <span
            key={tick.at}
            className={`absolute text-[9px] font-semibold text-slate-400 ${i === DAY_TICKS.length - 1 ? "-translate-x-full" : i === 0 ? "" : "-translate-x-1/2"}`}
            style={{ left: pct(tick.at) }}
          >
            {tick.label}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-purple-600 shrink-0" aria-hidden="true" />
          Your hours{overnight ? " — they cross midnight" : ""}
        </span>
        {graceEnd !== null && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-fuchsia-400 shrink-0" aria-hidden="true" />
            Arrive by {fmtClockMinutes(graceEnd)} and you’re not late
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * THE GRADING LADDER: how many hours make how much of a day.
 *
 * Two thresholds in a row of text ("4h half · 8h full") is the line people
 * misread on this page — it doesn't say what happens BELOW the first one. As
 * bands it does: the width of each band is the hours it covers, so "stop at
 * three hours and the day counts for nothing" is something you can see.
 *
 * Hidden entirely when the policy publishes neither threshold — a missing
 * backend figure degrades to a hidden control, never a guess (§7).
 */
function GradingLadder({ policy }) {
  const half = halfDayMinutes(policy);
  const full = fullDayMinutes(policy);
  if (half === null && full === null) return null;

  // The axis runs two hours past the top threshold, so the last band has room
  // to be a band rather than a sliver at the end.
  const top = (full ?? half * 2) + 120;
  const bands = [];
  if (half !== null) {
    bands.push({ key: "none", from: 0, to: half, label: "Doesn’t count", cls: "bg-slate-200 text-slate-600" });
    if (full !== null) {
      bands.push({ key: "half", from: half, to: full, label: "Half day", cls: "bg-fuchsia-200 text-fuchsia-900" });
    } else {
      bands.push({ key: "half", from: half, to: top, label: "Half day or more", cls: "bg-purple-600 text-white" });
    }
  } else {
    // Only the full-day figure is published. What happens below it is NOT ours
    // to guess — the band says what we know and no more (§7).
    bands.push({ key: "none", from: 0, to: full, label: "Not a full day", cls: "bg-slate-200 text-slate-600" });
  }
  if (full !== null) {
    bands.push({ key: "full", from: full, to: top, label: "Full day", cls: "bg-purple-600 text-white" });
  }

  return (
    <div className="px-5 sm:px-6 py-5 border-b border-slate-100">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        <HelpLabel
          text="Hours that make a day"
          help={{ surface: SURFACE, field: "full_day_min_hours", label: "hours that make a day", size: "sm" }}
        />
      </p>

      {/* 2px gaps between the bands, so two abutting fills never read as one. */}
      <div className="flex gap-0.5 mt-2.5">
        {bands.map((band) => (
          <span
            key={band.key}
            className={`h-10 rounded-[4px] flex items-center justify-center px-1 text-[10px] font-bold uppercase tracking-wider overflow-hidden whitespace-nowrap ${band.cls}`}
            style={{ width: `${((band.to - band.from) / top) * 100}%` }}
          >
            {band.label}
          </span>
        ))}
      </div>

      {/* The boundary figures sit under the edge they belong to, which is what
          makes the band widths mean anything. */}
      <div className="flex gap-0.5 mt-1.5">
        {bands.map((band) => (
          <span
            key={band.key}
            className="text-[10px] font-bold text-slate-500 text-right tabular-nums"
            style={{ width: `${((band.to - band.from) / top) * 100}%` }}
          >
            {/* The last band is open-ended — "and up" has no figure. */}
            {band.to === top ? "" : fmtMinutes(band.to)}
          </span>
        ))}
      </div>

      <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
        Hours you actually worked, with breaks taken off.
        {half !== null
          ? ` Under ${fmtMinutes(half)} the day isn’t counted as attendance at all.`
          : ` Under ${fmtMinutes(full)} the day doesn’t count as a full one.`}
        {half !== null && full !== null && ` Between ${fmtMinutes(half)} and ${fmtMinutes(full)} it counts as half a day.`}
      </p>
    </div>
  );
}

/**
 * One rule, as a card: what it is, the figure, and what it means for the
 * person. The note carries the whole value of this page, so it is never
 * truncated — which is why these are cards in a two-column grid rather than a
 * long single column of rows (§5 — grid, don't narrow).
 *
 * NO ⓘ ON A RULE CARD (22 Oct 2026). Each card already prints the rule in
 * plain words underneath the figure — the note IS the hint — and six of them
 * put this one screen state nine hints over §10's cap of four. The help that
 * stayed is the help the cards can't give: which rule set is yours (`policy`)
 * and the thresholds nobody reads right as two numbers (the ladder above).
 */
function RuleCard({ rule }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3.5 min-w-0">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{rule.label}</p>
      <p className="text-sm font-bold text-slate-800 mt-1">{rule.value}</p>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{rule.note}</p>
    </div>
  );
}

export default function MySchedulePage() {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [params, setParams] = useSearchParams();

  const agenda = useMyAgenda();

  // Coverage is only read where the endpoint accepts the caller. An employee
  // never asks — a 403 would tell us only what the workspace already says
  // (§2: a capability a role lacks is absent, not broken).
  const workspace = useCurrentWorkspace();
  const canSeeTeam = workspace === "manager" || workspace === "hr";
  const team = useTeamAgenda({ enabled: canSeeTeam });

  const tabs = TABS.filter((entry) => !entry.teamOnly || canSeeTeam);
  const asked = params.get("tab");
  // An unknown tab — or `?tab=team` in the employee workspace — opens the week
  // rather than an empty page.
  const tab = tabs.some((entry) => entry.key === asked) ? asked : "week";
  const openTab = tabs.find((entry) => entry.key === tab);

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
  // The ladder draws the half/full thresholds, so the rule card that printed
  // the same two figures as "4h half · 8h full" drops out — one concept, drawn
  // once, with one ⓘ on it (§10).
  const ladderShown = halfDayMinutes(policy) !== null || fullDayMinutes(policy) !== null;
  const ruleCards = ladderShown ? rules.filter((rule) => rule.key !== "full_day_min_hours") : rules;
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
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">
              <HelpLabel text="My Schedule & Rules" help={{ surface: SURFACE, field: "page", label: "this page" }} />
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl leading-relaxed">
              Your week, your hours, and how a day of yours gets counted. HR sets all of it — you can’t change it here, but this is where you check it.
            </p>
          </div>
          <button type="button" onClick={refreshAll} disabled={busy} className={`${SECONDARY_BTN} shrink-0`}>
            <HiRefresh className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* The Claims & Benefits underline bar, which is what every tabbed
            screen here uses. The ⓘ sits BESIDE it, never inside: a help button
            in a tablist is one more tab as far as the keyboard is concerned
            (§10). */}
        <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 -mb-px" role="tablist" aria-label="My schedule and rules">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setParams(key === "week" ? {} : { tab: key }, { replace: true })}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition whitespace-nowrap ${
                  tab === key ? "border-purple-600 text-purple-700" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" /> {label}
              </button>
            ))}
          </div>
          <FieldHelp
            surface={SURFACE}
            field={`tab.${tab}`}
            label={`the ${openTab?.label || "open"} tab`}
            className="mb-0 shrink-0"
          />
        </div>

        {/* ── 1. What does my week look like? ─────────────────────────────── */}
        {tab === "week" && (
          agenda.error ? (
            <ErrorState error={agenda.error} onRetry={reloadAgenda} fallback="Couldn’t load your week." />
          ) : (
            <>
              <AgendaTiles summary={agenda.summary} loading={agenda.loading} />
              <AgendaWeek
                days={agenda.days}
                summary={agenda.summary}
                timezone={agenda.timezone}
                loading={agenda.loading}
              />
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
            </>
          )
        )}

        {/* ── 2. What am I set up with? ───────────────────────────────────── */}
        {tab === "shift" && (
          error ? (
            <ErrorState error={error} onRetry={load} fallback="Couldn’t load your shift and days off." />
          ) : firstLoad ? (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
              <div className={`${PANEL} p-6 xl:col-span-2`}><LoadingRows rows={4} /></div>
              <div className={`${PANEL} p-6`}><LoadingRows rows={3} /></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
              <div className={`${PANEL} xl:col-span-2 min-w-0`}>
                <div className={PANEL_HEAD}>
                  <HiClock className="w-4 h-4 text-purple-600 shrink-0" />
                  <h2 className="text-base font-bold text-slate-800">Your hours</h2>
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

                    <ShiftClockTrack shift={shift} policy={policy} />

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-4 pt-1">
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
                    message="You don’t have set hours, so nothing is measured against a start or end time. The rules on the next tab still apply to your attendance. Ask HR if you expected a shift."
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
                      Your shift changes on a cycle, so the hours above are today’s. The week table shows what the cycle actually lands on for each day.
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
              </div>

              {/* ── Your days off, and which rule gives them ─────────────── */}
              <div className={`${PANEL} min-w-0`}>
                <div className={PANEL_HEAD}>
                  <HiOutlineCalendar className="w-4 h-4 text-purple-600 shrink-0" />
                  <h2 className="text-base font-bold text-slate-800">
                    <HelpLabel text="Your days off" help={{ surface: SURFACE, field: "weekly_offs", label: "your days off", size: "sm" }} />
                  </h2>
                </div>

                <div className="px-5 sm:px-6 py-5">
                  {offs.length > 0 ? (
                    <>
                      <div className="grid grid-cols-7 gap-1">
                        {WEEKDAY_NAMES.map((day) => {
                          const off = offs.includes(day);
                          return (
                            <span
                              key={day}
                              className={`rounded-lg border px-1 py-1.5 text-[11px] font-bold text-center ${off ? TONE_CLASSES.purple : "bg-slate-50 text-slate-400 border-slate-200"}`}
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
                        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-3">
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
                    <p className="text-xs text-slate-500 leading-relaxed">
                      No weekly day off is set for you. That doesn’t mean you work every day — ask HR which days you’re expected in.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {/* ── 3. How is a day of mine counted? ───────────────────────────── */}
        {tab === "rules" && (
          error && !policy ? (
            <ErrorState error={error} onRetry={load} fallback="Couldn’t load the rules your days are counted by." />
          ) : firstLoad ? (
            <div className={`${PANEL} p-6`}><LoadingRows rows={5} /></div>
          ) : (
            <div className={PANEL}>
              <div className={PANEL_HEAD}>
                <HiScale className="w-4 h-4 text-purple-600 shrink-0" />
                <h2 className="text-base font-bold text-slate-800">How your attendance is counted</h2>
                {policy?.name && (
                  <span className="min-w-0 text-[11px] font-semibold text-slate-400 truncate">{policy.name}</span>
                )}
                <FieldHelp surface={SURFACE} field="policy" label="how your attendance is counted" size="sm" className="shrink-0" />
              </div>

              <GradingLadder policy={policy} />

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

              {ruleCards.length > 0 ? (
                <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  {ruleCards.map((rule) => <RuleCard key={rule.key} rule={rule} />)}
                </div>
              ) : ladderShown ? null : (
                <EmptyState
                  icon={HiExclamationCircle}
                  title="No rules published for you yet"
                  message="Your organisation hasn’t published the rules your attendance is measured against, so we can’t show them here. Your clock-ins are still recorded as normal — ask HR how your days are counted."
                />
              )}
            </div>
          )
        )}

        {/* ── 4. Who else is in? (manager and HR) ────────────────────────── */}
        {tab === "team" && canSeeTeam && (
          <TeamCoverageStrip
            days={team.days}
            teamSize={team.teamSize}
            lanes={team.lanes}
            loading={team.loading}
            errorNote={teamNote}
          />
        )}
      </main>
    </>
  );
}
