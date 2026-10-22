// ─────────────────────────────────────────────────────────────────────────────
// attendance/ScheduleAgenda.jsx — The forward half of My Schedule: the week as
// seven cards, and the things falling due inside it.
//
// Two components, one payload. They are separate because the page lays them out
// in different bands, but they read the ONE `/attendance/schedule/agenda`
// response — nothing here fetches, and nothing here decides what a day is. See
// `agendaMeta.js` for why `day_kind` must stay the server's answer.
//
// ── WHY A WEEK BOARD AND NOT A LIST (rebuilt 2026-10-22) ────────────────────
// The first build was a dense row per day, because the window could be 90 days
// long and a row is the only thing that survives 90 of itself. With the window
// now fixed at seven days (user decision — `AGENDA_WINDOW_DAYS`), the row was
// the wrong shape: a week is read ACROSS, the way a calendar week is, and seven
// cards side by side fit the whole window above the fold with room for the
// hours, the day's name and what falls due on it. No horizontal scroll, no
// truncation, no "see more".
//
// It degrades by re-wrapping, not by changing: 7 columns at lg, 4 at sm, 2 on a
// phone (measured at 1366 and 390 — §10's placement rule). Each card holds the
// same four lines at every width, so nothing is hidden on a small screen.
//
// THE CARD OPENS THE DAY, as a `DetailDialog` record inspector — the house
// pattern for every popup showing data (§3). A day that holds nothing beyond
// its own label doesn't open, and says so by not offering: no hover, no focus
// ring, no cursor. Cards are real `<button>`s rather than `rowPreviewProps`,
// which is the `<tr>` mechanism; a button already carries click, Enter/Space
// and a focus ring.
//
// A TASK OPENS THE REAL TASK INSPECTOR. The v2 payload carries the brief, the
// assigner, the category and the extension history, which is enough to draw a
// card — but not enough to justify a second task detail view. So a task row
// opens `TaskDetailDialog` on the `me` plane, the same component My Tasks
// opens, reshaped by `taskRowFromItem()`. Two consequences, both deliberate:
//  · OPENING IT STAMPS `first_viewed_at` (#250) — the detail read IS a write on
//    the `me` plane. That is correct here: the person really did open their
//    task. It is the reason this page never prefetches a task detail.
//  · THE ACTIONS COME WITH IT. Handing work in needs the upload dialog, which
//    belongs to My Tasks; the footer note says who acts next and links there,
//    rather than this page growing a second copy of that flow.
//
// NO ⓘ HELP ON THE DAY CARDS OR THE DAY INSPECTOR, DELIBERATELY. Attendance
// status, hours and day inspectors are the everyday data the 2026-10-01
// decision took hints off: read daily, understood after the first look. The
// help on this page sits on the week's figures, the provenance and the rules.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  HiBriefcase, HiCalendar, HiClipboardCheck, HiClock, HiDocumentText,
  HiExclamationCircle, HiExternalLink, HiGift, HiOutlineCalendar, HiSwitchHorizontal,
} from "react-icons/hi";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailText, displayValue } from "../components/DetailDialog";
import { HelpLabel } from "../fieldHelp/FieldHelp";
import TaskDetailDialog, { TaskFooterNote } from "../tasks/TaskDetailDialog";
import { taskCategoryLabel, taskPriorityLabel, wasTaskExtended } from "../tasks/taskMeta";
import { fmtDate, fmtDateShort, parseYMDLocal } from "./dates";
import { TONE_CLASSES } from "./enums";
import { useTaskPaths } from "./paths";
import { EmptyState, InlineAlert, LoadingRows, PersonCell } from "./ui";
import {
  DAY_KINDS, ITEM_LANES, LANE_TRUNCATED_NOTE, LEAVE_PORTIONS, SHIFT_SOURCES,
  dayCardLabel, dayHeadline, dayReason, failedLaneNames, flattenAgendaItems, isDayOff,
  itemDetail, itemDueLabel, itemDueTime, itemHeadline, itemKey, itemTone, leaveSpan,
  mergeAgendaItems, shiftHoursLabel, shiftWindowLabel, summaryTiles, taskRowFromItem,
  weeklyOffRule, worstLaneState,
} from "./agendaMeta";

const SURFACE = "attendance.my_schedule";

const PANEL = "bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden";
const PANEL_HEAD = "px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-2.5";

/** One icon per item kind, so the deadline list is scannable without reading it. */
const ITEM_ICONS = {
  task_due: HiClipboardCheck,
  document_request_due: HiDocumentText,
  document_expiry: HiDocumentText,
  comp_off_expiry: HiGift,
  shift_change: HiSwitchHorizontal,
};

/** "Mon" — the weekday is what people navigate a schedule by, so it leads. */
const weekdayOf = (ymd) => {
  const d = parseYMDLocal(ymd);
  return d ? d.toLocaleDateString("en-IN", { weekday: "short" }) : "";
};

/**
 * The window always starts today (`agendaRange`), so position names the first
 * two days — which is how people refer to them. Everything after is a weekday.
 */
const dayEyebrow = (day, index) =>
  index === 0 ? "Today" : index === 1 ? "Tomorrow" : weekdayOf(day.date);

/** True when the day holds more than its own card already says. */
const dayOpens = (day) =>
  !!(day?.shift || day?.holiday || day?.leave || day?.weekly_off
    || (Array.isArray(day?.items) && day.items.length > 0));

// ── The week ────────────────────────────────────────────────────────────────

/**
 * One day of the week, as a card. Four lines at every width: what day it is,
 * the date, what the day is, and the hours or what falls due.
 */
function DayCard({ day, index, onOpen }) {
  const kind = DAY_KINDS[day.day_kind] || DAY_KINDS.unassigned;
  const muted = isDayOff(day);
  const today = index === 0;
  const items = Array.isArray(day.items) ? day.items : [];
  const openable = dayOpens(day);
  const hours = day.day_kind === "working" || day.day_kind === "half_day_leave"
    ? shiftHoursLabel(day.shift)
    : "";
  const overdue = items.some((item) => itemTone(item) === "rose");

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-1.5">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${today ? "text-purple-600" : "text-slate-400"}`}>
          {dayEyebrow(day, index)}
        </span>
        {items.length > 0 && (
          <span
            className={`shrink-0 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
              overdue ? "bg-rose-100 text-rose-700" : "bg-purple-100 text-purple-700"
            }`}
            title={`${items.length} ${items.length === 1 ? "thing" : "things"} due`}
          >
            {items.length}
          </span>
        )}
      </div>

      <p className={`text-base font-bold mt-0.5 ${muted ? "text-slate-500" : "text-slate-900"}`}>
        {fmtDate(day.date, { day: "numeric", month: "short" })}
      </p>

      {/* The kind badge is the exception marker, so an ordinary working day
          carries none — badging all five working days would hide the two that
          matter (DAY_KINDS gives `working` no tone for the same reason). */}
      <div className="mt-2 min-h-[22px]">
        {kind.tone ? (
          <span className={`inline-block text-[9px] font-bold uppercase tracking-wider rounded-full border px-2 py-0.5 ${TONE_CLASSES[kind.tone]}`}>
            {kind.label}
          </span>
        ) : (
          <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-slate-300">Working</span>
        )}
      </div>

      <p className={`text-xs font-semibold mt-1.5 leading-snug ${muted ? "text-slate-400" : "text-slate-600"}`}>
        {hours || dayCardLabel(day)}
      </p>
      {/* On a working day the shift NAME is the second line; on every other kind
          the label above already said what the day is, so nothing follows. */}
      {hours && day.shift?.name && (
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{day.shift.name}</p>
      )}
    </>
  );

  const shell = `text-left rounded-2xl border p-3 min-w-0 transition-colors ${
    today ? "border-purple-300 bg-purple-50/40 ring-1 ring-purple-100" : muted ? "border-slate-100 bg-slate-50/60" : "border-slate-200 bg-white"
  }`;

  if (!openable) return <div className={shell}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${fmtDate(day.date)}: ${dayHeadline(day)}`}
      className={`${shell} hover:border-purple-300 hover:bg-purple-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400`}
    >
      {body}
    </button>
  );
}

/**
 * The week: the counts, seven cards, and the two "next" facts.
 *
 * Counts are server-computed throughout. A count we derived from `days[]` would
 * under-report the moment a lane was capped, and under-reporting a deadline is
 * the one failure that matters on this page.
 */
export function AgendaWeek({ days, summary, timezone, loading }) {
  const [selected, setSelected] = useState(null);
  const tiles = summaryTiles(summary);
  const nextOff = summary?.next_day_off;
  const nextHoliday = summary?.next_holiday;

  return (
    <>
      <div className={PANEL}>
        <div className={PANEL_HEAD}>
          <HiCalendar className="w-4 h-4 text-purple-600 shrink-0" />
          <h2 className="text-base font-bold text-slate-800">
            <HelpLabel text="Your next 7 days" help={{ surface: SURFACE, field: "days", label: "your next 7 days", size: "sm" }} />
          </h2>

          {/* The figures live in the header rather than in four big tiles: over
              one week they are a caption on the cards below, not a dashboard. */}
          {tiles.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
              {tiles.map((tile) => (
                <p key={tile.key} className="text-[11px] text-slate-500 whitespace-nowrap">
                  <HelpLabel
                    text={tile.label}
                    help={{ surface: SURFACE, field: tile.key, label: tile.label, size: "sm" }}
                  />
                  <span className="ml-1.5 text-xs font-bold text-slate-800">{tile.value}</span>
                </p>
              ))}
            </div>
          )}
        </div>

        {loading && days.length === 0 ? (
          <div className="p-6"><LoadingRows rows={3} /></div>
        ) : days.length === 0 ? (
          <EmptyState
            icon={HiOutlineCalendar}
            title="We couldn’t work out your week"
            message="No days came back for the next seven. Try refreshing, and ask HR whether your shift is set up if it stays empty."
          />
        ) : (
          <div className={`p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 ${loading ? "opacity-60 transition-opacity" : ""}`}>
            {days.map((day, i) => (
              <DayCard key={day.date} day={day} index={i} onOpen={() => setSelected(day)} />
            ))}
          </div>
        )}

        {(nextOff || nextHoliday?.date) && (
          <div className="px-5 sm:px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-x-6 gap-y-1.5">
            {nextOff && (
              <p className="text-xs text-slate-600">
                <span className="font-semibold text-slate-500">Next day off</span>{" "}
                <span className="font-bold text-slate-800">{fmtDateShort(nextOff)}</span>
              </p>
            )}
            {nextHoliday?.date && (
              <p className="text-xs text-slate-600">
                <span className="font-semibold text-slate-500">Next holiday</span>{" "}
                <span className="font-bold text-slate-800">{nextHoliday.name || "Holiday"}</span>
                <span className="text-slate-500">, {fmtDateShort(nextHoliday.date)}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {selected && (
        <DayDetailDialog day={selected} timezone={timezone} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

// ── The day inspector ───────────────────────────────────────────────────────

/**
 * One day, in full: what it is, the hours, why it is yours, the leave span it
 * sits inside, and anything falling due on it. No actions — this page is
 * read-only, so the footer says why rather than leaving an empty bar (§3).
 */
function DayDetailDialog({ day, timezone, onClose }) {
  if (!day) return null;

  const kind = DAY_KINDS[day.day_kind];
  const span = leaveSpan(day);
  const reason = dayReason(day);
  const sourceNote = SHIFT_SOURCES[day.shift?.source] || "";
  // The day's own rule, which carries no `matched_entity_name` — so the
  // audience reads in general terms here ("everyone in your department") and
  // names the group on the setup card, where the top-level rule is.
  const offRule = day.day_kind === "weekly_off" ? weeklyOffRule(day.weekly_off) : null;

  const facts = [];
  if (day.shift) {
    facts.push({ label: "Hours", value: shiftWindowLabel(day.shift) || "N/A" });
    facts.push({ label: "Shift", value: displayValue(day.shift.name) });
  }
  if (day.holiday) {
    facts.push({ label: "Holiday", value: displayValue(day.holiday.name) });
    // `is_optional` is derived from `type` server-side; `type` is the truth, so
    // it is the one shown — and an optional holiday is the one people must act
    // on, so it says so in words rather than as a flag.
    facts.push({ label: "You must take it", value: day.holiday.type === "optional" ? "Optional — you choose" : "Yes" });
  }
  if (day.leave) {
    facts.push({ label: "Leave", value: day.leave.leave_type_name || "On leave" });
    facts.push({ label: "How much of the day", value: LEAVE_PORTIONS[day.leave.portion] || "N/A" });
  }

  return (
    <DetailDialog
      eyebrow={weekdayOf(day.date)}
      title={fmtDate(day.date)}
      subtitle={dayHeadline(day)}
      icon={HiCalendar}
      badge={kind ? <DetailPill tone="onDark">{kind.label}</DetailPill> : null}
      onClose={onClose}
      width="compact"
      footer={<p className="text-xs text-slate-500">HR sets your hours and days off — nothing on this day can be changed from here.</p>}
    >
      {facts.length > 0 && (
        <DetailSection title="This day" icon={HiClock} collapsible={false}>
          <DetailGrid items={facts} cols={2} />
        </DetailSection>
      )}

      {sourceNote && <InlineAlert tone="sky">{sourceNote}</InlineAlert>}

      {/* The "nameless weekend" the v2 upgrade was built for: a day off that
          can now say which rule gave it and who else has it. */}
      {offRule && (
        <DetailSection title="Why you have this day off" icon={HiOutlineCalendar} collapsible={false}>
          <p className="text-sm font-semibold text-slate-800">{offRule.name}</p>
          {offRule.audience && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{offRule.audience}</p>}
        </DetailSection>
      )}

      {span && (
        <DetailSection title="Part of a longer leave" icon={HiBriefcase}>
          <DetailText>
            This day is one of {span.total || "several"} booked from {span.label}. Weekends and holidays
            inside that stretch aren’t taken off your balance, so they show as themselves rather than as leave.
          </DetailText>
        </DetailSection>
      )}

      {Array.isArray(day.items) && day.items.length > 0 && (
        <DetailSection title={`Falling due (${day.items.length})`} icon={HiClipboardCheck} collapsible={false}>
          <ul className="space-y-2.5">
            {day.items.map((item, i) => (
              <li key={itemKey(item, i)} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{itemHeadline(item)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {itemDueLabel(item, timezone)}
                    {itemDetail(item) ? ` · ${itemDetail(item)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      {reason && <DetailText label="Why it reads this way">{reason}</DetailText>}
    </DetailDialog>
  );
}

// ── Falling due ──────────────────────────────────────────────────────────────

/**
 * Priority, in the purple family. `rose` is NOT available to it: an urgent task
 * is not an error, and rose on this page means a deadline already missed (§5).
 * The words come from `taskMeta` so the schedule and the task screens cannot
 * disagree about what "urgent" is called.
 */
const PRIORITY_TONE = { urgent: "orange", high: "amber", medium: "blue", low: "slate" };

const CHIP = "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider rounded-full border px-2 py-0.5";

/**
 * A task falling due, with everything v2 added: how urgent, what kind of work,
 * the brief, who asked for it, the links they attached and whether the deadline
 * has already been moved once.
 *
 * The brief is clamped to two lines. The whole of it, the files and the
 * discussion are in the task inspector this card opens — a deadline list that
 * printed full briefs would stop being a deadline list.
 */
function TaskDueBody({ item, timezone }) {
  const time = itemDueTime(item, timezone);
  const links = Array.isArray(item.external_links) ? item.external_links.filter((l) => l?.url) : [];
  const extended = wasTaskExtended({
    extension_count: item.extension_count,
    original_due_date: item.original_due_date,
    due_date: item.due_at,
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {item.priority && (
          <span className={`${CHIP} ${TONE_CLASSES[PRIORITY_TONE[item.priority] || "slate"]}`}>
            {taskPriorityLabel(item.priority)}
          </span>
        )}
        {item.category && (
          <span className={`${CHIP} ${TONE_CLASSES.slate}`}>{taskCategoryLabel(item.category)}</span>
        )}
        {item.is_viewed === false && (
          <span className={`${CHIP} ${TONE_CLASSES.purple}`}>Not opened yet</span>
        )}
        {extended && (
          <span className={`${CHIP} ${TONE_CLASSES.amber}`}>Deadline moved</span>
        )}
      </div>

      <p className="text-sm font-semibold text-slate-800 break-words mt-1.5">{itemHeadline(item)}</p>

      <p className={`text-xs mt-0.5 ${item.is_overdue ? "text-rose-600 font-semibold" : "text-slate-500"}`}>
        {item.is_overdue ? "Past its deadline · " : ""}
        {fmtDate(item.date)}{time ? `, ${time}` : ""}
      </p>

      {item.description && (
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-2">{item.description}</p>
      )}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          {links.map((link, i) => (
            <a
              key={`${link.url}:${i}`}
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              // The label is the person's own words; a link without one shows
              // its address rather than the word "link", which says nothing.
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 hover:underline underline-offset-2 max-w-[14rem] truncate"
            >
              <HiExternalLink className="w-3 h-3 shrink-0" />
              <span className="truncate">{link.label || link.url}</span>
            </a>
          ))}
        </div>
      )}

      {/* The avatar comes from the directory when it has one (§7 — presigned
          photo links expire, and GenderAvatar re-reads them), and never an id
          either way (§4). */}
      {item.assigner && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Asked by</span>
          <PersonCell entity={item.assigner} secondary={item.assigner.designation || ""} />
        </div>
      )}
    </>
  );
}

/** The plain row for the four kinds that carry no enrichment. */
function PlainItemBody({ item, timezone }) {
  const detail = itemDetail(item);
  return (
    <>
      <p className="text-sm font-semibold text-slate-800 break-words">{itemHeadline(item)}</p>
      <p className="text-xs mt-0.5 text-slate-500">{itemDueLabel(item, timezone)}</p>
      {detail && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{detail}</p>}
    </>
  );
}

/**
 * Everything due in the week, soonest first, across all four item lanes.
 *
 * `lanes` is read BEFORE the empty state, which is the whole point of the
 * field: a documents query that failed comes back with an empty item list, and
 * rendering that as "nothing due" is how somebody misses a document renewal
 * because of a transient blip. A failed lane degrades this panel only — the
 * week beside it is still correct.
 *
 * ONE EXCEPTION, THE TASKS LANE (2026-10-22). `useMyAgenda` re-reads it from
 * `/tasks/me` when the agenda reports it `unavailable`, and hands the rows in
 * as `recoveredTasks`. A lane we have in hand is not missing, so it drops out
 * of the state this panel reports — the rose note is for what is still gone.
 */
export function AgendaDeadlines({
  days, lanes, timezone, loading, onRetry, onTaskChanged,
  recoveredTasks = [], tasksRecovering = false, tasksUnrecoverable = false,
  tasksAbsent = false,
}) {
  const [openTask, setOpenTask] = useState(null);
  const taskPaths = useTaskPaths();

  // When the agenda's tasks lane failed, the hook has already re-read it from
  // `/tasks/me`; those rows come in here and merge by date. Empty whenever the
  // lane is healthy, so this costs nothing in the ordinary case.
  const items = mergeAgendaItems(flattenAgendaItems(days), recoveredTasks);

  // A lane we read ourselves is no longer missing, so it must not count towards
  // what this panel reports — otherwise the reader is warned about deadlines
  // that are on the screen in front of them. Narrowly: ONLY the `unavailable`
  // tasks lane, and only while the second read hasn't failed too. A `truncated`
  // tasks lane still has its own thing to say, and nothing else was retried.
  const tasksHandled = lanes?.tasks === "unavailable" && !tasksUnrecoverable;
  const reckoned = tasksHandled ? ITEM_LANES.filter((key) => key !== "tasks") : ITEM_LANES;
  const state = worstLaneState(lanes, reckoned);
  const failed = failedLaneNames(lanes, reckoned);
  const busy = loading || tasksRecovering;

  // Everything we asked for was switched off — nothing to say, so say nothing.
  // Unless we hold rows anyway: a recovered lane beside three excluded ones
  // reads `excluded`, and hiding real deadlines would be the worse mistake.
  if (state === "excluded" && items.length === 0) return null;

  return (
    <>
      <div className={PANEL}>
        <div className={PANEL_HEAD}>
          <HiClipboardCheck className="w-4 h-4 text-purple-600 shrink-0" />
          <h2 className="text-base font-bold text-slate-800">
            <HelpLabel text="Falling due this week" help={{ surface: SURFACE, field: "items_due", label: "falling due this week", size: "sm" }} />
          </h2>
          {items.length > 0 && (
            <span className="text-[11px] font-bold text-purple-600">{items.length}</span>
          )}
        </div>

        {state === "truncated" && (
          <div className="px-5 sm:px-6 pt-4">
            <InlineAlert tone="amber">{LANE_TRUNCATED_NOTE}</InlineAlert>
          </div>
        )}

        {/* A lane that failed is named, so the reader knows WHAT is missing
            rather than being told the page is broken. The rest still renders.
            By the time this shows, a recoverable lane has already been retried
            once on its own — so "try again" is the reader's second chance, not
            their first, and the wording promises nothing more. */}
        {state === "unavailable" && (
          <div className="px-5 sm:px-6 pt-4">
            <InlineAlert tone="rose">
              We couldn’t load your {failed.join(" or ") || "deadlines"} just now, so this list may be missing things.
              {onRetry && (
                <button type="button" onClick={onRetry} className="ml-1.5 font-bold underline underline-offset-2">
                  Try again
                </button>
              )}
            </InlineAlert>
          </div>
        )}

        {busy && items.length === 0 ? (
          <div className="p-6"><LoadingRows rows={3} /></div>
        ) : items.length === 0 ? (
          // Only honest once `lanes` says `ok` — hence the guard above.
          state === "unavailable" ? null : (
            <EmptyState
              icon={HiClipboardCheck}
              title="Nothing due in the next 7 days"
              message={tasksAbsent
                // Tasks aren't part of this organisation's plan, so promising
                // the reader we looked for deadlines they can never be given
                // would be the one sentence here that isn't true.
                ? "No document dates or expiring days off are coming up this week."
                : "No task deadlines, document dates or expiring days off are coming up this week."}
            />
          )
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item, i) => {
              const Icon = ITEM_ICONS[item.kind] || HiExclamationCircle;
              const overdue = itemTone(item) === "rose";
              const task = taskRowFromItem(item);
              const Row = task ? "button" : "div";

              return (
                <li key={`${itemKey(item, i)}:${item.date}`}>
                  <Row
                    {...(task
                      ? {
                        type: "button",
                        onClick: () => setOpenTask(task),
                        "aria-label": `${itemHeadline(item)} — open task`,
                        className: "w-full text-left px-5 sm:px-6 py-3.5 flex items-start gap-3 hover:bg-purple-50/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-400",
                      }
                      : { className: "px-5 sm:px-6 py-3.5 flex items-start gap-3" })}
                  >
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${overdue ? "bg-rose-50 text-rose-600" : "bg-purple-50 text-purple-600"}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      {task
                        ? <TaskDueBody item={item} timezone={timezone} />
                        : <PlainItemBody item={item} timezone={timezone} />}
                    </div>
                  </Row>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* The footer's two notes are stacked: it is a flex row and both of them
          carry `mr-auto`, so side by side they would fight for the left. */}
      {openTask && (
        <TaskDetailDialog
          task={openTask}
          plane="me"
          onClose={() => setOpenTask(null)}
          onChanged={onTaskChanged}
          footer={({ task }) => (
            <div className="mr-auto flex flex-col gap-1.5">
              <TaskFooterNote task={task} plane="me" />
              {/* Handing work in needs the upload dialog, which lives on My
                  Tasks — so this points there instead of this page growing a
                  second copy of that flow. */}
              {taskPaths?.mine && (
                <DetailFooterNote>
                  <Link to={taskPaths.mine} className="font-bold text-purple-700 hover:underline underline-offset-2">
                    Open My Tasks
                  </Link>{" "}
                  to start work on this or hand it in.
                </DetailFooterNote>
              )}
            </div>
          )}
        />
      )}
    </>
  );
}
