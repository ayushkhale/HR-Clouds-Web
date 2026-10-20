// ─────────────────────────────────────────────────────────────────────────────
// TaskReviewActions.jsx — The record inspector's footer for a reviewer: the
// buttons this viewer may press on somebody else's task, plus whichever reason
// prompt is open behind them.
//
// It lived inside TaskReviewScreen until a second host needed it (the Tasks tab
// on an employee's record, which reviews one person's work rather than a
// queue). Two copies of six buttons and five prompts would have drifted the
// first time a rule changed, and "approve" behaving differently depending on
// which screen you opened it from is exactly what §2 is about.
//
// Traps it owns, so no host has to remember them:
//
// • EVERY DECISION EMITS `TASK` (§7). The review queue is counted in the
//   sidebar badge and the inbox, and there is no query cache, so a decision
//   that doesn't emit leaves a stale number until F5.
//
// • A 412 MEANS SOMEBODY ELSE GOT THERE FIRST. Two reviewers can be looking at
//   the same submission. `onActionError` comes from the inspector, which
//   reloads the record and stays open; the prompt keeps what was typed.
//
// • THE PROMPTS RENDER AS SIBLINGS of the footer, not children of the
//   inspector's body, so their z-170 layer sits above the z-140 inspector
//   (§3 stacking).
//
// The host supplies `onDone`, which is only the housekeeping it alone can do:
// say so, close the inspector, reload its own list.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { HiBan, HiCalendar, HiCheckCircle, HiRefresh, HiSwitchHorizontal } from "react-icons/hi";
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from "../attendance/events";
import { TaskFooterNote } from "./TaskDetailDialog";
import {
  ApproveTaskDialog, CancelTaskDialog, ExtendDueDateDialog, ReassignTaskDialog, ReopenTaskDialog,
} from "./TaskReviewDialogs";
import { taskPlaneFor } from "./taskPlanes";
import { isAwaitingReview, isTaskTerminal, reopenRule } from "./taskMeta";

/** Which prompt is open over the record inspector. */
const NO_ACTION = { kind: "", busy: false, error: "" };

const BUTTON = "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50";
const QUIET = `${BUTTON} bg-white border border-slate-200 text-slate-700 hover:bg-slate-50`;
const OUTLINE = `${BUTTON} bg-white border border-purple-200 text-purple-700 hover:bg-purple-50`;
const PRIMARY = `${BUTTON} text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200`;
const DANGER = `${BUTTON} bg-white border border-rose-200 text-rose-700 hover:bg-rose-50`;

/**
 * @param {object} props
 * @param {object} props.task                  the record the inspector is showing
 * @param {"manager"|"hr"} props.viewer
 * @param {(err: unknown, fallback: string) => string} props.onActionError
 *   the inspector's own error handler — it reloads the record on a 412
 * @param {(message: string) => void} props.onDone  toast, close, reload
 */
export default function TaskReviewActions({ task, viewer = "manager", onActionError, onDone }) {
  const adapter = taskPlaneFor(viewer);
  const [action, setAction] = useState(NO_ACTION);

  const terminal = isTaskTerminal(task);
  const awaiting = isAwaitingReview(task);
  const canReopen = reopenRule(task, viewer).allowed;

  const pick = (kind) => setAction({ kind, busy: false, error: "" });
  const closeAction = () => setAction(NO_ACTION);

  const run = (call, successMessage) => async (payload) => {
    setAction((a) => ({ ...a, busy: true, error: "" }));
    try {
      await call(task.id, payload, task);
      emitAttendanceChanged(ATTENDANCE_EVENTS.TASK, { id: task.id });
      closeAction();
      onDone(successMessage);
    } catch (err) {
      setAction((a) => ({ ...a, busy: false, error: onActionError(err, "Couldn’t do that to this task.") }));
    }
  };

  return (
    <>
      <TaskFooterNote task={task} plane={viewer} />

      {!terminal && (
        <>
          <button type="button" onClick={() => pick("cancel")} className={DANGER}>
            <HiBan className="w-4 h-4" /> Call it off
          </button>
          <button type="button" onClick={() => pick("extend")} className={QUIET}>
            <HiCalendar className="w-4 h-4" /> Move the deadline
          </button>
          <button type="button" onClick={() => pick("reassign")} className={QUIET}>
            <HiSwitchHorizontal className="w-4 h-4" /> Hand it over
          </button>
        </>
      )}

      {canReopen && (
        <button type="button" onClick={() => pick("reopen")} className={OUTLINE}>
          <HiRefresh className="w-4 h-4" /> {awaiting ? "Send back for changes" : "Reopen the task"}
        </button>
      )}

      {awaiting && (
        <button type="button" onClick={() => pick("approve")} className={PRIMARY}>
          <HiCheckCircle className="w-4 h-4" /> Approve
        </button>
      )}

      {action.kind === "approve" && (
        <ApproveTaskDialog
          task={task}
          busy={action.busy}
          error={action.error}
          onConfirm={run(adapter.approve, "Approved. They’ve been told.")}
          onClose={closeAction}
        />
      )}
      {action.kind === "reopen" && (
        <ReopenTaskDialog
          task={task}
          plane={viewer}
          busy={action.busy}
          error={action.error}
          onConfirm={run(adapter.reopen, "Sent back with your notes.")}
          onClose={closeAction}
        />
      )}
      {action.kind === "reassign" && (
        <ReassignTaskDialog
          task={task}
          plane={viewer}
          busy={action.busy}
          error={action.error}
          onConfirm={run(adapter.reassign, "Handed over. The new person has been told.")}
          onClose={closeAction}
        />
      )}
      {action.kind === "cancel" && (
        <CancelTaskDialog
          task={task}
          busy={action.busy}
          error={action.error}
          onConfirm={run(adapter.cancel, "Task called off.")}
          onClose={closeAction}
        />
      )}
      {action.kind === "extend" && (
        <ExtendDueDateDialog
          task={task}
          busy={action.busy}
          error={action.error}
          onConfirm={run(adapter.extend, "Deadline moved. They’ve been told.")}
          onClose={closeAction}
        />
      )}
    </>
  );
}
