// ─────────────────────────────────────────────────────────────────────────────
// TaskTable.jsx — The one scannable table behind all three task screens: My
// Tasks, Tasks I Assigned and All Tasks. Who, what, when, how urgent, where it
// stands — everything else is in the record inspector the row opens
// (CLAUDE.md §3).
//
// It takes `columns`-ish booleans rather than a column config because the three
// screens differ by exactly two columns: whose name to show, and whether the
// assigner cares that the assignee has opened it yet. One table with two flags
// beat three near-identical tables, which is how the column order drifted
// between the manager's and HR's documents lists once.
//
// Traps:
//
// • NO VIEW BUTTON, AND NO ACTIONS COLUMN. Approving happens in the dialog
//   footer, never from the row (§3). Nothing in this table is clickable except
//   the row itself, which is why `rowPreviewProps` can own the whole <tr>.
//
// • THE OVERDUE CHIP IS THE ONLY ROSE THING HERE. A missed deadline is this
//   module's one genuine error state (§5); priority, however urgent, stays
//   purple, because "urgent" is a plan and "overdue" is a fact.
//
// • "Opened" IS NOT A STATUS. `is_viewed` says the assignee has read the brief,
//   which is the thing an assigner actually chases before the deadline, so it
//   reads as a date or as "Not opened yet" — never as a tick that could be
//   mistaken for progress.
// ─────────────────────────────────────────────────────────────────────────────

import { HiClock, HiExclamationCircle } from "react-icons/hi";
import { rowPreviewProps } from "../components/DetailDialog";
import HoverBlob from "./HoverBlob";
import { PersonCell } from "../attendance/ui";
import { TONE_CLASSES, TONE_DOT } from "../attendance/enums";
import { fmtDate, fmtDateTime } from "../attendance/dates";
import { HelpLabel } from "../fieldHelp/FieldHelp";
import { isTaskOverdue, taskCategoryLabel, taskPriorityLabel, taskStatusMeta } from "./taskMeta";

/**
 * The lifecycle chip. Purple family throughout; `statusMeta`'s tone keys map it.
 *
 * Two states are shortened to fit a column — "Being worked on" prints as "In
 * progress", "Waiting for review" as "In review" — and only those two get a
 * bubble. A bubble that repeats the word already on screen is noise, so the
 * other four render as a plain chip with no hover at all.
 */
export function TaskStatusBadge({ status, className = "" }) {
  const meta = taskStatusMeta(status);
  const shortened = meta.longLabel !== meta.label ? meta.longLabel : "";
  return (
    <HoverBlob text={shortened}>
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone]} ${className}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone]}`} aria-hidden="true" />
        {meta.label}
      </span>
    </HoverBlob>
  );
}

/** Past the deadline and unfinished — the one red thing on a task screen. */
export function OverdueBadge({ className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-rose-200 bg-rose-50 text-rose-700 text-[10px] font-bold whitespace-nowrap ${className}`}>
      <HiExclamationCircle className="w-3 h-3" aria-hidden="true" /> Past deadline
    </span>
  );
}

/** Priority, as a word rather than a colour (§5). "Urgent" gets the only emphasis. */
function PriorityCell({ priority }) {
  const urgent = String(priority || "").toLowerCase() === "urgent";
  return (
    <span className={urgent ? "font-bold text-purple-700" : "font-semibold text-slate-600"}>
      {taskPriorityLabel(priority)}
    </span>
  );
}

/**
 * @param {object} props
 * @param {Array}  props.rows
 * @param {Function} props.onOpen        row → opens the record inspector
 * @param {"assignee"|"assigner"} props.person  whose name the table shows
 * @param {boolean} [props.showOpened]   add the read-receipt column (assigner views)
 * @param {object} [props.help]          { status, deadline, opened } → ⓘ on those headers
 */
export default function TaskTable({ rows, onOpen, person = "assignee", showOpened = false, help = {} }) {
  const personHeader = person === "assigner" ? "Given by" : "Who it’s for";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm min-w-[860px]">
        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
          <tr>
            <th className="px-6 py-3.5">Task</th>
            <th className="px-6 py-3.5">{personHeader}</th>
            <th className="px-6 py-3.5">Priority</th>
            <th className="px-6 py-3.5"><HelpLabel text="Deadline" help={help.deadline} /></th>
            {showOpened && <th className="px-6 py-3.5"><HelpLabel text="Opened" help={help.opened} /></th>}
            <th className="px-6 py-3.5"><HelpLabel text="Where it stands" help={help.status} /></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {rows.map((task) => {
            const overdue = isTaskOverdue(task);
            const who = person === "assigner" ? task.assigner : task.assignee;
            return (
              <tr key={task.id} {...rowPreviewProps(() => onOpen(task), "Task details")}>
                <td className="px-6 py-3.5 max-w-[22rem]">
                  {/* A title is up to 200 characters and this cell is 22rem, so
                      the bubble is the only way to read a long one without
                      opening the row. `srOnlyText` is off: the <p> already
                      carries the whole title in the DOM — `truncate` is a
                      visual clip, not a content one — so repeating it would
                      make a screen reader say it twice. */}
                  <HoverBlob text={task.title} srOnlyText={false} className="block w-full">
                    <p className="font-semibold text-slate-800 truncate">{task.title}</p>
                  </HoverBlob>
                  <p className="text-[11px] text-slate-400">{taskCategoryLabel(task.category)}</p>
                </td>
                <td className="px-6 py-3.5">
                  {/* An unresolvable id reads as a person, never as the id (§4) —
                      PersonCell falls back to "Unknown employee" on its own. */}
                  <PersonCell entity={who} secondary={who?.email} />
                </td>
                <td className="px-6 py-3.5 whitespace-nowrap"><PriorityCell priority={task.priority} /></td>
                <td className="px-6 py-3.5 whitespace-nowrap">
                  <span className={`font-semibold ${overdue ? "text-rose-600" : "text-slate-700"}`}>
                    {fmtDate(task.due_date)}
                  </span>
                  {overdue && <OverdueBadge className="ml-2" />}
                </td>
                {showOpened && (
                  <td className="px-6 py-3.5 text-xs whitespace-nowrap">
                    {task.is_viewed
                      ? <span className="text-slate-500">{fmtDateTime(task.first_viewed_at)}</span>
                      : <span className="inline-flex items-center gap-1 font-semibold text-fuchsia-700"><HiClock className="w-3.5 h-3.5" /> Not opened yet</span>}
                  </td>
                )}
                <td className="px-6 py-3.5"><TaskStatusBadge status={task.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
