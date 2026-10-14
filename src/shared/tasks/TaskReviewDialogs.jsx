// ─────────────────────────────────────────────────────────────────────────────
// TaskReviewDialogs.jsx — The five things a reviewer does to a task: approve
// it (#259), send it back (#260), hand it to someone else (#261), call it off
// (#262) and move the deadline (#263).
//
// All five are reason prompts, so all five are ReasonDialog — the house dialog
// for "the server refuses this without a written reason" (CLAUDE.md §3). Two of
// them put an extra field above the reason through ReasonDialog's `children`:
// reassign needs the new person, extend needs the new date. Neither is a record
// inspector and neither gets a bespoke modal.
//
// Traps:
//
// • THE MINIMUM LENGTH IS NOT ONE NUMBER. Sending a task back needs 10
//   characters normally and 15 when HR reopens an already-approved task
//   (#260, EC-T8). `reopenRule()` owns that so the dialog and the button that
//   offers it can't disagree.
//
// • AN OVERDUE TASK CANNOT BE HANDED OVER WITHOUT A NEW DEADLINE (#261,
//   EC-T7) — the server answers 400 without one. So the date field is required
//   exactly when the task is already late, and says why.
//
// • APPROVING IS THE ONE ACTION WITH AN OPTIONAL REASON. ReasonDialog's
//   `optional` mode exists for it; a second dialog that looked almost the same
//   would have drifted from this one within a release.
//
// • THE PERSON PICKER IS NEVER A `<select>` OF PEOPLE (§5) and never offers
//   somebody the server would refuse: not the caller (D-T3 bans self-delegation)
//   and, for a manager, not an HR or admin colleague (#261 refuses those too).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import ReasonDialog from "../components/ReasonDialog";
import { PersonSelect } from "../components/PersonPicker";
import { fmtDateTime } from "../attendance/dates";
import { FieldError } from "../attendance/ui";
import { DueDateField } from "./TaskFormFields";
import { joinDueDate, labelClass, splitDueDate } from "./taskFormMeta";
import { useTaskAssigneeOptions } from "./useTaskAssignees";
import { TASK_LIMITS, dueDateProblem, isTaskOverdue, personInSentence, reopenRule } from "./taskMeta";

const help = (field) => ({ surface: "tasks.review", field });

/** #259 — accept the work. The note is optional and goes into the audit line. */
export function ApproveTaskDialog({ task, onConfirm, busy, error, onClose }) {
  return (
    <ReasonDialog
      title="Approve this work?"
      description={(
        <>Approving closes the task for {personInSentence(task?.assignee, "the person it’s with")} and tells them it was accepted. It can’t be
          undone — only HR can reopen a task once it’s approved.</>
      )}
      label="Note for them"
      optional
      maxLength={TASK_LIMITS.APPROVAL_NOTE_MAX}
      placeholder="Anything you want them to know about the work"
      confirmLabel="Approve and close"
      busy={busy}
      error={error}
      onSubmit={(note) => onConfirm({ approval_note: note || undefined })}
      onClose={onClose}
    />
  );
}

/** #260 — send it back with notes. HR's reopen of a finished task needs more detail. */
export function ReopenTaskDialog({ task, plane, onConfirm, busy, error, onClose }) {
  const rule = reopenRule(task, plane);
  return (
    <ReasonDialog
      title={rule.privileged ? "Reopen this closed task?" : "Send this back for changes?"}
      description={rule.privileged
        ? <>This task was already approved. Reopening it puts it back with {personInSentence(task?.assignee, "the person it’s with")} and records why, so write enough for somebody reading this later to understand.</>
        : <>The task goes back to {personInSentence(task?.assignee, "the person it’s with")} with what you write here, and the deadline doesn’t change. Say what needs fixing, not just that it’s wrong.</>}
      label="What needs changing"
      minLength={rule.minLength}
      maxLength={TASK_LIMITS.REOPEN_REASON_MAX}
      placeholder="e.g. The western region figures don’t match the July returns — please redo rows 45–60 and hand it in again."
      confirmLabel={rule.privileged ? "Reopen the task" : "Send back for changes"}
      busy={busy}
      error={error}
      onSubmit={(reason) => onConfirm({ reopen_reason: reason })}
      onClose={onClose}
    />
  );
}

/** #262 — call it off. Terminal, so the wording and the tone both say so. */
export function CancelTaskDialog({ task, onConfirm, busy, error, onClose }) {
  return (
    <ReasonDialog
      title="Call this task off?"
      description={(
        <>{personInSentence(task?.assignee, "the person it’s with")} is told it’s no longer needed and stops work. Nothing more can be done with
          the task afterwards, so cancel it only if the work itself has gone away.</>
      )}
      label="Why it’s no longer needed"
      tone="danger"
      minLength={TASK_LIMITS.REASON_MIN}
      maxLength={TASK_LIMITS.REASON_MAX}
      placeholder="e.g. The regional targets were restructured, so this analysis has been replaced by the national one."
      confirmLabel="Call it off"
      busy={busy}
      error={error}
      onSubmit={(reason) => onConfirm({ cancellation_reason: reason })}
      onClose={onClose}
    />
  );
}

/** #261 — hand it to someone else. The new deadline is required when it’s already late. */
export function ReassignTaskDialog({ task, plane, onConfirm, busy, error, onClose }) {
  const { options, loading, unavailable } = useTaskAssigneeOptions(plane);
  const overdue = isTaskOverdue(task);
  const [assigneeId, setAssigneeId] = useState("");
  const [due, setDue] = useState(() => (overdue ? splitDueDate(task?.due_date) : { date: "", time: "" }));
  const [touched, setTouched] = useState(false);

  const sameAsNow = !!assigneeId && assigneeId === task?.assignee_id;
  const dueIso = joinDueDate(due);
  // Optional unless the task is late, in which case EC-T7 makes it mandatory.
  const dueWanted = overdue || !!due.date || !!due.time;
  const dueProblem = dueWanted ? dueDateProblem(dueIso) : "";
  const assigneeProblem = !assigneeId
    ? "Choose who takes this on."
    : sameAsNow ? "They already have this task. Pick somebody else." : "";

  return (
    <ReasonDialog
      title="Hand this task to someone else?"
      description={(
        <>The new person starts from an unread task and is told about it; what has already been handed in stays on the
          record. {overdue && <strong>This task is already past its deadline, so set a new one.</strong>}</>
      )}
      label="Why it’s moving"
      minLength={TASK_LIMITS.REASON_MIN}
      maxLength={TASK_LIMITS.APPROVAL_NOTE_MAX}
      placeholder="e.g. Alex is on unplanned medical leave — Jordan is picking this up."
      confirmLabel="Hand it over"
      busy={busy}
      error={error}
      canSubmit={!assigneeProblem && !dueProblem}
      onSubmit={(reason) => onConfirm({
        new_assignee_id: assigneeId,
        reason,
        ...(dueIso ? { new_due_date: dueIso } : {}),
      })}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        <div className="sm:col-span-2">
          <div className="flex items-center">
            <label htmlFor="task-reassign-to" className={labelClass}>Who takes it on <span className="text-rose-400">*</span></label>
          </div>
          <PersonSelect
            id="task-reassign-to"
            people={options}
            value={assigneeId}
            onChange={(id) => { setAssigneeId(id); setTouched(true); }}
            loading={loading}
            disabled={busy}
            invalid={touched && !!assigneeProblem}
            placeholder={plane === "manager" ? "Choose one of your team" : "Choose anyone in the organisation"}
            emptyText={unavailable ? "The list of people isn’t available here." : "No people found."}
          />
          <FieldError message={touched ? assigneeProblem : ""} />
        </div>
        <DueDateField
          id="task-reassign-due"
          value={due}
          onChange={setDue}
          error={touched || overdue ? dueProblem : ""}
          required={overdue}
          disabled={busy}
          label={overdue ? "New deadline" : "New deadline (optional)"}
          help={help("new_due_date")}
        />
        {!overdue && (
          <p className="sm:col-span-2 text-[11px] text-slate-400 -mt-2">
            Leave the deadline alone to keep {fmtDateTime(task?.due_date)}.
          </p>
        )}
      </div>
    </ReasonDialog>
  );
}

/** #263 — move the deadline out. The original is kept, which is the point. */
export function ExtendDueDateDialog({ task, onConfirm, busy, error, onClose }) {
  const [due, setDue] = useState(() => splitDueDate(task?.due_date));
  const [touched, setTouched] = useState(false);
  const dueIso = joinDueDate(due);
  const problem = dueDateProblem(dueIso, { after: task?.due_date });

  return (
    <ReasonDialog
      title="Move the deadline?"
      description={(
        <>{personInSentence(task?.assignee, "the person it’s with")} is told the new date. The date this task was first due stays on the record,
          so it still shows as having been extended.</>
      )}
      label="Why it needs longer"
      minLength={TASK_LIMITS.REASON_MIN}
      maxLength={TASK_LIMITS.REASON_MAX}
      placeholder="e.g. The vendor data arrived four days late, so the reconciliation can’t be finished by Friday."
      confirmLabel="Move the deadline"
      busy={busy}
      error={error}
      canSubmit={!problem}
      onSubmit={(reason) => onConfirm({ new_due_date: dueIso, reason })}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        <DueDateField
          id="task-extend-due"
          value={due}
          onChange={(next) => { setDue(next); setTouched(true); }}
          error={touched ? problem : ""}
          disabled={busy}
          label="New deadline"
          help={help("new_due_date")}
        />
        <p className="sm:col-span-2 text-[11px] text-slate-400 -mt-2">
          Due now: {fmtDateTime(task?.due_date)}. The new date has to be later than that.
        </p>
      </div>
    </ReasonDialog>
  );
}
