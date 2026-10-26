// ─────────────────────────────────────────────────────────────────────────────
// attendance/ScheduleAgenda.jsx — The forward half of My Schedule: the week as
// seven cards, and the things falling due inside it.
//
// Two components, one payload. They are separate because the page lays them out
// in different bands, but they read the ONE `/attendance/schedule/agenda`
// response — nothing here fetches, and nothing here decides what a day is. See
// `agendaMeta.js` for why `day_kind` must stay the server's answer.
//
// ── THE WEEK IS A TABLE. DON'T MAKE IT CLEVER AGAIN ─────────────────────────
// Four shapes have been tried for the same seven days, and the last one is the
// user's decision (22 Oct 2026) after seeing the other three:
//
//  1. A dense ROW PER DAY, when the window could still be 90 days long.
//  2. Seven CARDS side by side — five lines of reading each, ~140px of page,
//     and a deadline list under it repeating every date. Rejected as clutter.
//  3. ONE COLOUR RIBBON, seven labelled segments. Compact, and rejected on
//     sight: "the ribbon is looking awful as hell". A week is not a chart —
//     nobody reads a schedule for its shape, they read it for Thursday.
//  4. A PLAIN TABLE, which is what ships: Date · Day · Hours · Falling due,
//     the same shape as the attendance history on the next screen over. People
//     already know how to read it, and the row opens the day.
//
// So: no fills carrying meaning, no legend, no colour that isn't also a word.
// An ordinary working day gets no badge (`DAY_KINDS.working` has no tone) —
// badging all five would hide the two that matter.
//
// THE PANEL FOLDS, because somebody who came for their days off or the rules
// shouldn't have to scroll the week first. It starts open.
//
// THE ROW OPENS THE DAY, as a `DetailDialog` record inspector — the house
// pattern for every popup showing data (§3) — through `rowPreviewProps`, which
// is what gives a `<tr>` its click, Enter/Space and focus ring (§3 again: never
// hand-roll onClick on a row). A day that holds nothing beyond its own label
// doesn't open, and says so by not offering: no hover, no focus ring, no
// cursor, and no View button in the row either.
//
// ── THE DEADLINE LIST IS GROUPED BY DAY (same rebuild) ──────────────────────
// It was one flat list of up to a week's items, each row restating its own
// date, under a week board that had just shown those dates. Now it is one
// collapsible section per day — the shape of a schedule — so the date is said
// once, in the section header, with the count beside it. Today and any day
// holding something overdue start open; the rest start folded, which is what
// makes a busy week short enough to read.
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
  HiChevronDown, HiExclamationCircle, HiExternalLink, HiGift, HiOutlineCalendar,
  HiSwitchHorizontal,
} from "react-icons/hi";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailText, displayValue, rowPreviewProps } from "../components/DetailDialog";
import { HelpLabel } from "../fieldHelp/FieldHelp";
import TaskDetailDialog, { TaskFooterNote } from "../tasks/TaskDetailDialog";
import { taskCategoryLabel, taskPriorityLabel, wasTaskExtended } from "../tasks/taskMeta";
import { fmtDate, fmtDateShort, parseYMDLocal } from "./dates";
import { TONE_CLASSES } from "./enums";
import { useTaskPaths } from "./paths";
import { EmptyState, InlineAlert, LoadingRows, PersonCell } from "./ui";
import {
  DAY_KINDS, ITEM_LANES, LANE_TRUNCATED_NOTE, LEAVE_PORTIONS, SHIFT_SOURCES,
  dayHeadline, dayReason, failedLaneNames, flattenAgendaItems, itemDetail,
  itemDueLabel, itemDueTime, itemHeadline, itemKey, itemTone, leaveSpan,
  mergeAgendaItems, shiftWindowLabel, summaryTiles, taskRowFromItem, weeklyOffRule,
  worstLaneState,
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
 * The four figures the week comes to, as the headline tiles of the page.
 *
 * Counts are server-computed throughout. A count we derived from `days[]` would
 * under-report the moment a lane was capped, and under-reporting a deadline is
 * the one failure that matters on this page. Day counts print through
 * `formatDayCount` inside `summaryTiles` — never "4.5" (§6) — so no tile adds
 * a "days" caption of its own.
 */
export function AgendaTiles({ summary, loading }) {
  const tiles = summaryTiles(summary);

  if (tiles.length === 0) {
    if (!loading) return null;
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-2xl px-5 py-4">
            <div className="h-2.5 w-16 rounded bg-slate-100 animate-pulse" />
            <div className="h-6 w-14 rounded bg-slate-100 animate-pulse mt-2.5" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {tiles.map((tile) => (
        <div key={tile.key} className="bg-white border border-slate-100 rounded-2xl px-5 py-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <HelpLabel text={tile.label} help={{ surface: SURFACE, field: tile.key, label: tile.label, size: "sm" }} />
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">{tile.value}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * What else the row has to say once the Day column has named the kind. A
 * weekly off has nothing to add — the column already said it — so the cell is
 * left empty rather than repeating itself or printing a dash (§5).
 */
function dayDetailLine(day) {
  switch (day.day_kind) {
    case "working":
    case "half_day_leave":
      return shiftWindowLabel(day.shift) || "";
    case "holiday":
      return day.holiday?.name || "";
    case "leave":
      return day.leave?.leave_type_name || "";
    default:
      return "";
  }
}

/** One day, as a row of the week table. */
function DayRow({ day, index, onOpen }) {
  const kind = DAY_KINDS[day.day_kind] || DAY_KINDS.unassigned;
  const today = index === 0;
  const items = Array.isArray(day.items) ? day.items : [];
  const overdue = items.some((item) => itemTone(item) === "rose");
  const detail = dayDetailLine(day);
  const openable = dayOpens(day);
  const preview = openable ? rowPreviewProps(onOpen, `${fmtDate(day.date)} in full`) : null;

  return (
    <tr
      {...(preview || { className: "" })}
      className={`${preview?.className || ""} ${today ? "bg-purple-50/50" : ""}`}
    >
      <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
        <span className="font-bold text-slate-800">
          {fmtDate(day.date, { weekday: "short", day: "numeric", month: "short" })}
        </span>
        {index < 2 && (
          <span className={`ml-2 text-[10px] font-bold uppercase tracking-wider ${today ? "text-purple-600" : "text-slate-400"}`}>
            {dayEyebrow(day, index)}
          </span>
        )}
      </td>

      <td className="px-4 sm:px-6 py-3 whitespace-nowrap">
        {/* An ordinary working day gets no badge: badging all five would hide
            the two that matter, which is why `DAY_KINDS.working` has no tone. */}
        {kind.tone ? (
          <span className={`inline-block text-[10px] font-bold uppercase tracking-wider rounded-full border px-2 py-0.5 ${TONE_CLASSES[kind.tone]}`}>
            {kind.label}
          </span>
        ) : (
          <span className="text-xs font-bold text-slate-600">{kind.label}</span>
        )}
      </td>

      <td className="px-4 sm:px-6 py-3 text-slate-600">
        <span className="block truncate max-w-[18rem]">{detail}</span>
        {day.shift?.name && (day.day_kind === "working" || day.day_kind === "half_day_leave") && (
          <span className="block text-[11px] text-slate-400 truncate max-w-[18rem]">{day.shift.name}</span>
        )}
      </td>

      <td className="px-4 sm:px-6 py-3 text-right whitespace-nowrap">
        {items.length > 0 && (
          <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold ${
            overdue ? "bg-rose-100 text-rose-700" : "bg-purple-100 text-purple-700"
          }`}>
            {items.length}
          </span>
        )}
      </td>
    </tr>
  );
}

/**
 * The week as a plain table of seven days — the same shape as the attendance
 * history people already read (user decision, 22 Oct 2026, after a card grid
 * and then a colour ribbon were both rejected): a row per day, Date first, the
 * kind beside it, and the row opens the day. Nothing is encoded in a colour
 * that isn't also a word.
 *
 * THE PANEL FOLDS. Somebody who came for the rules or their days off doesn't
 * need the week in their way; it starts open, and shutting it leaves the header
 * line, which still says what it holds.
 */
export function AgendaWeek({ days, summary, timezone, loading }) {
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(true);
  const nextOff = summary?.next_day_off;
  const nextHoliday = summary?.next_holiday;
  const span = days.length > 0
    ? `${fmtDate(days[0].date, { day: "numeric", month: "short" })} – ${fmtDate(days[days.length - 1].date, { day: "numeric", month: "short" })}`
    : "";

  return (
    <>
      <div className={PANEL}>
        <div className={PANEL_HEAD}>
          <HiCalendar className="w-4 h-4 text-purple-600 shrink-0" />
          <h2 className="text-base font-bold text-slate-800">
            <HelpLabel text="Your next 7 days" help={{ surface: SURFACE, field: "days", label: "your next 7 days", size: "sm" }} />
          </h2>
          {span && <span className="text-[11px] font-semibold text-slate-400">{span}</span>}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-auto shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            {open ? "Hide" : "Show"}
            <HiChevronDown className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
          </button>
        </div>

        {open && (
          loading && days.length === 0 ? (
            <div className="p-6"><LoadingRows rows={4} /></div>
          ) : days.length === 0 ? (
            <EmptyState
              icon={HiOutlineCalendar}
              title="We couldn’t work out your week"
              message="No days came back for the next seven. Try refreshing, and ask HR whether your shift is set up if it stays empty."
            />
          ) : (
            <div className={`overflow-x-auto ${loading ? "opacity-60 transition-opacity" : ""}`}>
              <table className="w-full text-left text-sm min-w-[560px]">
                <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 font-semibold text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="px-4 sm:px-6 py-3">Date</th>
                    <th className="px-4 sm:px-6 py-3">Day</th>
                    {/* Hours carries the slack so Date and Day stay tight to the left;
                        without it a four-column table spreads Date over a third of a
                        1366 screen and the row reads as four islands. */}
                    <th className="px-4 sm:px-6 py-3 w-full">Hours</th>
                    <th className="px-4 sm:px-6 py-3 text-right whitespace-nowrap">Falling due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {days.map((day, i) => (
                    <DayRow key={day.date} day={day} index={i} onOpen={() => setSelected(day)} />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {open && (nextOff || nextHoliday?.date) && (
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
 * Everything due in the week, grouped into one collapsible section per day.
 *
 * WHY GROUPED. It was a flat list where every row restated its own date, under
 * a week board that had just shown those dates. A schedule is read day by day,
 * so the date is said once — in the section header, with the count beside it —
 * and a week with eleven things in it is four headers instead of eleven rows
 * (rebuilt 22 Oct 2026; see the file header).
 *
 * WHICH DAYS START OPEN. Today, and any day holding something already overdue.
 * Nothing else: a week whose every section is open is the flat list again. If
 * neither applies, the soonest day opens, so the panel never reads as empty
 * when it holds things.
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
  const [folded, setFolded] = useState({});
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

  // Grouped in the order the items already arrive in (soonest first), so the
  // sections need no second sort and a day can never appear twice.
  const groups = [];
  const byDate = new Map();
  items.forEach((item) => {
    let group = byDate.get(item.date);
    if (!group) {
      group = { date: item.date, items: [], index: days.findIndex((day) => day.date === item.date) };
      byDate.set(item.date, group);
      groups.push(group);
    }
    group.items.push(item);
  });
  groups.forEach((group) => {
    group.overdue = group.items.some((item) => itemTone(item) === "rose");
  });

  // Open by default, then `folded` records only what the reader has shut. A
  // state keyed the other way round would re-fold today's section every time
  // the agenda refreshed under it.
  const openByDefault = (group, i) => group.index === 0 || group.overdue || (i === 0 && !groups.some((g) => g.index === 0 || g.overdue));
  const isOpen = (group, i) => (folded[group.date] === undefined ? openByDefault(group, i) : !folded[group.date]);

  // Everything we asked for was switched off — nothing to say, so say nothing.
  // Unless we hold rows anyway: a recovered lane beside three excluded ones
  // reads `excluded`, and hiding real deadlines would be the worse mistake.
  if (state === "excluded" && items.length === 0) return null;

  return (
    <>
      <div className={PANEL}>
        <div className={PANEL_HEAD}>
          <HiClipboardCheck className="w-4 h-4 text-purple-600 shrink-0" />
          {/* No ⓘ here: `items_due` is the same concept as the "Falling due"
              tile above, which carries it. Once per concept per screen (§10). */}
          <h2 className="text-base font-bold text-slate-800">Falling due this week</h2>
          {items.length > 0 && (
            <span className="text-[11px] font-bold text-purple-600">
              {items.length === 1 ? "1 thing" : `${items.length} things`} over {groups.length === 1 ? "1 day" : `${groups.length} days`}
            </span>
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
          <div className="divide-y divide-slate-100">
            {groups.map((group, gi) => {
              const open = isOpen(group, gi);
              const eyebrow = group.index >= 0 ? dayEyebrow(group, group.index) : weekdayOf(group.date);
              return (
                <section key={group.date}>
                  <h3>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setFolded((f) => ({ ...f, [group.date]: open }))}
                      className="w-full px-5 sm:px-6 py-3 flex items-center gap-3 text-left hover:bg-slate-50/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-400"
                    >
                      <HiChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
                      <span className={`text-sm font-bold ${group.index === 0 ? "text-purple-700" : "text-slate-800"}`}>
                        {eyebrow}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">
                        {fmtDate(group.date, { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                      <span className="ml-auto flex items-center gap-2 shrink-0">
                        {group.overdue && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Past due</span>
                        )}
                        <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                          {group.items.length === 1 ? "1 thing" : `${group.items.length} things`}
                        </span>
                      </span>
                    </button>
                  </h3>

                  {open && (
                    <ul className="divide-y divide-slate-50 border-t border-slate-100 bg-slate-50/30">
                      {group.items.map((item, i) => {
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
                                  className: "w-full text-left px-5 sm:px-6 py-3.5 flex items-start gap-3 hover:bg-purple-50/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-400",
                                }
                                : { className: "px-5 sm:px-6 py-3.5 flex items-start gap-3" })}
                            >
                              <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${overdue ? "bg-rose-50 text-rose-600" : "bg-white border border-slate-100 text-purple-600"}`}>
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
                </section>
              );
            })}
          </div>
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
