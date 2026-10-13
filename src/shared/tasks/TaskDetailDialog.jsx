// ─────────────────────────────────────────────────────────────────────────────
// TaskDetailDialog.jsx — The record inspector for one task, in every role
// (CLAUDE.md §3). The row in any of the three task lists opens this; every
// action a viewer may take on a task is in its footer, never in the row.
//
// One component, three planes (§2). `plane` picks the detail read and the
// footer actions through taskPlanes.js; the layout, wording and section order
// are identical for an employee, a manager and HR, because a manager who is
// promoted to HR must not have to relearn this screen.
//
// Traps this file exists to hold:
//
// • OPENING IT IS A WRITE ON THE `me` PLANE. #250 stamps `first_viewed_at` and
//   files a FIRST_VIEWED audit line the first time the assignee opens their own
//   task — that is the feature, not a side effect ("I never saw it" is what it
//   answers). So the list row is NEVER used to prefetch the detail, and the
//   manager and HR reads (#258/#267) are deliberately different endpoints that
//   leave the receipt alone.
//
// • THE LIST ROW IS A PARTIAL TASK. #256 returns six fields; #257/#266 a few
//   more. So the dialog opens on whatever the row knew, shows the spinner, and
//   swaps in the full record when it lands — rather than rendering "N/A" over
//   half the grid for a second.
//
// • ATTACHMENTS CANNOT BE PREVIEWED, ONLY DOWNLOADED. #270 signs the URL with
//   an RFC 6266 `Content-Disposition: attachment`, so an <iframe> would just
//   download it anyway; and the set includes Word and Excel, which no browser
//   previews. Hence a Download button per file and no AttachmentViewerDialog.
//   The link is re-signed on every press because it dies after 15 minutes.
//
// • A 412 IS NOT AN ERROR THE USER CAUSED. Somebody else wrote to the task
//   while this dialog was open. We reload the record, keep the dialog up, and
//   say so — closing it would throw away a half-typed reason.
//
// • `completed_by` / `cancelled_by` ARE BARE IDS. They go through the employee
//   directory's `nameOf` (§4, §7); an employee whose role can't read the roster
//   gets "A colleague", never a UUID.
//
// • THE DISCUSSION IS A SEPARATE READ, AND A WRITE INTO IT CHANGES THIS
//   RECORD. #250/#258/#267 deliberately do NOT embed the thread (phase 4 §4.2
//   — a long conversation would weigh down every task view), so TaskDiscussion
//   fetches it itself. But a comment that carries files adds rows to the
//   task's own attachments, which is why it is handed `load` and the Files
//   section below stays truthful without the user refreshing anything.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  HiClipboardCheck, HiCheckCircle, HiDownload, HiExclamationCircle, HiFlag,
  HiPaperClip, HiRefresh, HiUserGroup, HiCalendar, HiBan, HiPencilAlt, HiDatabase, HiMail, HiDocumentText,
} from "react-icons/hi";
import DetailDialog, {
  DetailFooterNote, DetailGrid, DetailSection, DetailStats, DetailTable, DetailText, displayValue,
} from "../components/DetailDialog";
import { useEmployeeDirectory } from "../contexts/EmployeeDirectoryContext";
import { InlineAlert, Spinner } from "../attendance/ui";
import { fmtDate, fmtDateTime, fmtTime } from "../attendance/dates";
import { personName } from "../attendance/normalize";
import { taskErrorMessage, isTaskStale } from "../utils/taskErrors";
import { openTaskAttachment } from "./taskUpload";
import TaskDiscussion from "./TaskDiscussion";
import { taskPlaneFor } from "./taskPlanes";
import { OverdueBadge, TaskStatusBadge } from "./TaskTable";
import { TaskLinkList } from "./TaskFormFields";
import {
  attachmentContextLabel, formatFileSize, hasExcessiveRework, isTaskOverdue, personNameOrNA,
  taskAuditActionLabel, taskCategoryLabel, taskNotificationEventLabel, taskNotificationStatusLabel,
  taskPriorityLabel, taskStatusLabel, wasTaskExtended,
} from "./taskMeta";

const help = (field) => ({ surface: "tasks.task_detail", field });

export default function TaskDetailDialog({ task: initial, plane = "me", onClose, onChanged, footer }) {
  const adapter = taskPlaneFor(plane);
  const [task, setTask] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { nameOf } = useEmployeeDirectory();
  const taskId = initial?.id;

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await adapter.detail(taskId);
      const full = res?.data ?? res;
      // Merged over the row, not swapped for it. The detail is the authority on
      // every key it sends (including explicit nulls), but a response that
      // omits one — a trimmed projection, a server mid-deploy — must not blank
      // a field the list row already knew.
      setTask((current) => ({ ...current, ...(full && typeof full === "object" ? full : {}) }));
      setError("");
    } catch (err) {
      // The row we already have still renders; the banner says the rest is missing.
      setError(taskErrorMessage(err, "Couldn’t load the rest of this task."));
    } finally {
      setLoading(false);
    }
    // `adapter` is derived from `plane`, which cannot change for a mounted dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, plane]);

  useEffect(() => { load(); }, [load]);

  // An action succeeded: take the server's fresh record, and let the list behind
  // the dialog refresh its own row and counts.
  const applyResult = (res) => {
    const next = res?.data ?? res;
    if (next?.id) setTask((current) => ({ ...current, ...next }));
    else load();
    onChanged?.();
  };

  const onActionError = (err, fallback) => {
    if (isTaskStale(err)) {
      load();
      return "Somebody else changed this task while you had it open. It’s been refreshed — check it and try again.";
    }
    return taskErrorMessage(err, fallback);
  };

  const overdue = isTaskOverdue(task);
  const assignee = task?.assignee;
  const assigner = task?.assigner;
  const attachments = Array.isArray(task?.attachments) ? task.attachments : [];
  const links = Array.isArray(task?.external_links) ? task.external_links : [];
  const auditLogs = Array.isArray(task?.audit_logs) ? task.audit_logs : [];
  const notifications = Array.isArray(task?.notifications) ? task.notifications : [];
  const reworkRounds = Number(task?.rework_count || 0);

  const stats = [
    // Date in the tile, time of day underneath: a stat value is one truncating
    // line, and "14 Oct 2026, 06:05 pm" lost its meridiem at 1366px. The full
    // instant still reads in full in the grids below.
    {
      label: "Deadline",
      value: fmtDate(task?.due_date),
      icon: HiCalendar,
      hint: [fmtTime(task?.due_date, ""), overdue ? "already past" : ""].filter(Boolean).join(" · ") || undefined,
      help: help("due_date"),
    },
    { label: "Where it stands", value: taskStatusLabel(task?.status), icon: HiClipboardCheck, help: help("status") },
    { label: "Priority", value: taskPriorityLabel(task?.priority), icon: HiFlag },
  ];
  if (reworkRounds > 0) {
    stats.push({
      label: "Times sent back",
      value: reworkRounds,
      icon: HiRefresh,
      hint: hasExcessiveRework(task) ? "That’s a lot — it may be worth talking the brief through" : undefined,
      help: help("rework_count"),
    });
  }

  const people = [
    { label: "Who it’s for", value: personNameOrNA(assignee), wide: false },
    { label: "Given by", value: personNameOrNA(assigner) },
    { label: "Given on", value: fmtDateTime(task?.created_at) },
    { label: "Kind of work", value: taskCategoryLabel(task?.category) },
  ];

  const progress = [
    {
      label: "First opened on",
      value: task?.is_viewed ? fmtDateTime(task?.first_viewed_at) : "Not opened yet",
      help: help("first_viewed_at"),
    },
    { label: "Last opened", value: task?.last_viewed_at ? fmtDateTime(task.last_viewed_at) : "N/A" },
    { label: "Handed in on", value: task?.submitted_at ? fmtDateTime(task.submitted_at) : "Not handed in yet" },
    {
      label: "Handed to someone else",
      value: Number(task?.reassignment_count || 0) > 0
        ? `${task.reassignment_count} time${task.reassignment_count === 1 ? "" : "s"}`
        : "No",
      help: help("reassignment_count"),
    },
  ];

  // Only worth a row when the deadline actually moved — #263 keeps the original
  // precisely so this can be said out loud.
  const deadlineRows = wasTaskExtended(task)
    ? [
      { label: "Deadline first set to", value: fmtDateTime(task.original_due_date), help: help("original_due_date") },
      { label: "Deadline now", value: fmtDateTime(task.due_date) },
      { label: "Times moved", value: task.extension_count, help: help("extension_count") },
    ]
    : null;

  const closedRows = (() => {
    const status = String(task?.status || "").toLowerCase();
    if (status === "completed") {
      return [
        { label: "Approved on", value: fmtDateTime(task?.completed_at) },
        { label: "Approved by", value: task?.completer ? personName(task.completer) : nameOf(task?.completed_by) },
        {
          label: "Done on time",
          value: task?.is_completed_on_time === null || task?.is_completed_on_time === undefined
            ? "N/A"
            : task.is_completed_on_time ? "Yes" : "No — approved after the deadline",
          help: help("is_completed_on_time"),
        },
      ];
    }
    if (status === "cancelled") {
      return [
        { label: "Called off on", value: fmtDateTime(task?.cancelled_at) },
        { label: "Called off by", value: nameOf(task?.cancelled_by) },
      ];
    }
    return null;
  })();

  return (
    <DetailDialog
      eyebrow="Task"
      icon={HiClipboardCheck}
      title={task?.title}
      subtitle={`${taskCategoryLabel(task?.category)} · ${taskPriorityLabel(task?.priority)} priority`}
      badge={(
        <span className="flex items-center gap-2">
          {overdue && <OverdueBadge />}
          <TaskStatusBadge status={task?.status} />
        </span>
      )}
      loading={loading}
      onClose={onClose}
      footer={footer?.({ task, applyResult, onActionError, reload: load })}
    >
      {error && <InlineAlert tone="rose">{error}</InlineAlert>}

      {/* The brief comes FIRST, before the tiles, and does not collapse. It is
          the one thing a person opens a task to read; underneath three stat
          tiles and a chevron it read as a footnote to its own deadline. The
          tiles are the facts about the task — they follow it. */}
      <DetailSection title="What needs to be done" icon={HiPencilAlt} collapsible={false}>
        <TaskBrief description={task?.description} />
      </DetailSection>

      <DetailStats items={stats} />

      <DetailSection title="Who and when" icon={HiUserGroup}>
        <DetailGrid items={people} cols={4} />
      </DetailSection>

      <DetailSection title="How it’s going" icon={HiRefresh}>
        <DetailGrid items={progress} cols={4} />
      </DetailSection>

      {deadlineRows && (
        <DetailSection title="The deadline has moved" icon={HiCalendar}>
          <DetailGrid items={deadlineRows} cols={3} />
        </DetailSection>
      )}

      {task?.cancellation_reason && (
        <DetailSection title="Why it was called off" icon={HiBan}>
          <DetailText>{task.cancellation_reason}</DetailText>
        </DetailSection>
      )}

      {closedRows && (
        <DetailSection title={String(task?.status).toLowerCase() === "completed" ? "Signed off" : "Called off"} icon={HiCheckCircle}>
          <DetailGrid items={closedRows} cols={3} />
        </DetailSection>
      )}

      {/* The conversation sits after everything that states a fact about the
          task and before the artefacts it refers to, because it is the only
          section a reader can ACT in — and it is never folded by default for
          the same reason: a collapsed discussion hides the only way to say
          something. Its own files and links are the ones on the messages; the
          two sections below are the task's. */}
      <TaskDiscussion task={task} plane={plane} onPosted={load} />

      <DetailSection title={`Reference links${links.length ? ` (${links.length})` : ""}`} icon={HiPaperClip} defaultOpen={links.length > 0}>
        <TaskLinkList links={links} />
      </DetailSection>

      <DetailSection
        title={`Files${attachments.length ? ` (${attachments.length})` : ""}`}
        icon={HiPaperClip}
        defaultOpen={attachments.length > 0}
      >
        <AttachmentTable attachments={attachments} />
      </DetailSection>

      {/* HR only: #267 is the one read that returns these. The other planes get
          no empty section — a capability a role lacks is absent, not blank. */}
      {adapter.showsAudit && (
        <DetailSection
          title={`Everything that has happened${auditLogs.length ? ` (${auditLogs.length})` : ""}`}
          icon={HiDatabase}
          defaultOpen={false}
          help={help("audit_logs")}
        >
          <DetailTable
            columns={[
              { header: "What happened", render: (row) => taskAuditActionLabel(row.action) },
              { header: "Who", render: (row) => personNameOrNA(row.actor) },
              { header: "When", render: (row) => fmtDateTime(row.created_at) },
              {
                header: "Moved it to",
                render: (row) => (row.to_status ? taskStatusLabel(row.to_status) : null),
              },
            ]}
            rows={auditLogs}
            empty="Nothing recorded yet."
          />
        </DetailSection>
      )}

      {adapter.showsNotifications && (
        <DetailSection
          title={`Emails about this task${notifications.length ? ` (${notifications.length})` : ""}`}
          icon={HiMail}
          defaultOpen={false}
          help={help("notifications")}
        >
          <DetailTable
            columns={[
              { header: "What was sent", render: (row) => taskNotificationEventLabel(row.event_type) },
              { header: "How it went", render: (row) => taskNotificationStatusLabel(row.status) },
              { header: "Sent on", render: (row) => (row.sent_at ? fmtDateTime(row.sent_at) : null) },
              { header: "Tries", render: (row) => displayValue(row.attempts), align: "right" },
            ]}
            rows={notifications}
            empty="No emails queued for this task."
          />
        </DetailSection>
      )}
    </DetailDialog>
  );
}

/**
 * The brief itself — set bigger and looser than a `DetailText` note.
 *
 * `DetailText` is the house wrapper for a REASON or a comment: an 11px line in
 * a grey box, deliberately quiet because it sits beside the fields it explains.
 * The brief is the opposite — it is a paragraph somebody has to read and act
 * on, sometimes 2,000 characters of it, so it gets body copy, proper leading
 * and a measure that stops at 75ch rather than running the full width of a 4xl
 * dialog.
 */
function TaskBrief({ description }) {
  if (!description) {
    return <p className="text-sm text-slate-400">Nothing was written in the brief.</p>;
  }
  return (
    <p className="max-w-[75ch] text-sm leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
      {description}
    </p>
  );
}

/**
 * Files on the task. Each download link is signed fresh — they expire in 15
 * minutes.
 *
 * A LIST, NOT A `DetailTable`. Five columns (name, where it came from, size,
 * added, Download) did not fit the popup's content width, so the section grew
 * its own horizontal scrollbar and the Download button sat off the right edge
 * until you dragged the table sideways. A file has one thing worth reading —
 * its name — and three bits of small print; the small print goes on one quiet
 * line underneath and the button never leaves the screen.
 */
function AttachmentTable({ attachments }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const download = async (attachment) => {
    setBusyId(attachment.id);
    setError("");
    try {
      await openTaskAttachment(attachment.id);
    } catch (err) {
      setError(taskErrorMessage(err, "Couldn’t open that file. Try again."));
    } finally {
      setBusyId("");
    }
  };

  if (!attachments.length) {
    return <p className="text-xs text-slate-400">No files on this task.</p>;
  }

  return (
    <>
      <ul className="space-y-2">
        {attachments.map((row) => (
          <li
            key={row.id}
            className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5"
          >
            <span className="w-8 h-8 shrink-0 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <HiDocumentText className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 break-words">{row.file_name}</p>
              {/* One quiet line for everything the four extra columns used to
                  carry. Nothing here is worth a column of its own. */}
              <p className="text-[11px] text-slate-400">
                {[attachmentContextLabel(row.attachment_context), formatFileSize(row.file_size_bytes), fmtDate(row.created_at)]
                  .filter(Boolean).join(" · ")}
              </p>
            </div>
            <button
              type="button"
              data-row-action
              onClick={() => download(row)}
              disabled={busyId === row.id}
              className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition disabled:opacity-50"
            >
              {busyId === row.id ? <Spinner className="w-3 h-3" /> : <HiDownload className="w-3.5 h-3.5" />} Download
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="inline-flex items-start gap-1 text-[11px] font-semibold text-rose-600 mt-2">
          <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </p>
      )}
    </>
  );
}

/**
 * The assigner's name for use INSIDE a sentence. "N/A" is right in a labelled
 * field and wrong in prose — "Start work to let N/A know" — so an unresolvable
 * assigner reads as the role instead.
 */
const reviewerInSentence = (task) => (task?.assigner ? personName(task.assigner) : "your reviewer");

/** Why a task has no actions for this viewer, so the footer is never just empty (§3). */
export function TaskFooterNote({ task, plane }) {
  const status = String(task?.status || "").toLowerCase();
  if (status === "cancelled") {
    return <DetailFooterNote>This task was called off, so nothing more can be done with it.</DetailFooterNote>;
  }
  if (status === "completed") {
    return plane === "me"
      ? <DetailFooterNote>Your work was approved and this task is closed.</DetailFooterNote>
      : <DetailFooterNote>This task is closed. Only HR can reopen a task that has been approved.</DetailFooterNote>;
  }
  if (plane === "me" && status === "in_review") {
    return (
      <DetailFooterNote>
        You’ve handed this in. {reviewerInSentence(task)} will either approve it or send it back with notes.
      </DetailFooterNote>
    );
  }
  if (plane === "me" && status === "pending") {
    return <DetailFooterNote>Start work to let {reviewerInSentence(task)} know you’ve picked this up.</DetailFooterNote>;
  }
  return null;
}

