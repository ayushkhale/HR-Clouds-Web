// ─────────────────────────────────────────────────────────────────────────────
// TaskDiscussion.jsx — The conversation on one task (#253, #254, #264 and the
// managerial companion feed), rendered as a section of the task record
// inspector rather than as a screen of its own.
//
// One component, three planes (CLAUDE.md §2). `plane` picks which route the
// feed and the composer go through — the assignee posts through /tasks/me, a
// reviewer through /tasks/manager, HR through the same managerial route — and
// changes NOTHING else. An employee, a manager and HR see the same thread, in
// the same order, with the same controls, because the thread is the one place
// in this module where all three meet.
//
// Traps this file exists to hold:
//
// • COMMENTS ARE APPEND-ONLY AND CARRY NO `If-Match`. That is deliberate on
//   the server's side (phase 4 §1.2): three people typing at once must all
//   land, not race for a version. So nothing here reloads the task to get a
//   version first, and a post never produces a 412.
//
// • THE FEED IS READ NEWEST-FIRST AND DRAWN OLDEST-FIRST. #254 pages from
//   whichever end `order` names. Asking for ASC would open a long thread on
//   its oldest page — a year-old brief — and hide today's message behind the
//   pager, so we ask for DESC page 1 and reverse it, which is how every chat
//   behaves: you land on the newest, and "Show earlier messages" walks back.
//   A comment posted by somebody else between two page reads shifts that
//   window, which is why posting reloads from page 1 rather than paging on.
//
// • CANCELLED LOCKS WRITING, NOT READING (EC-T23). A cancelled task's thread
//   is exactly what somebody comes looking for later — why it was called off —
//   so the feed stays and only the composer goes. COMPLETED is NOT a lock:
//   handover notes after sign-off are a feature, so the composer stays there.
//
// • A COMMENT NAMES ITS FILES BY ID, NOT BY NAME. #254 returns
//   `attachment_ids` and nothing else about them, and an id must never reach
//   the screen (§4). Each id is looked up in the task's own attachment list
//   (plus anything uploaded in this dialog, which lands before the task is
//   re-read) and falls back to the words "Attached file" — never the uuid.
//
// • THE SYSTEM NOTES ARE MACHINE SHOUTING. #260/#261/#262 write
//   "REWORK REQUESTED: …" into the thread. `parseSystemComment` splits the
//   prefix off and the note is drawn with the same words HR's audit table
//   uses for that event, so nobody reads a server string in capitals (§4, §6).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiChatAlt2, HiCog, HiDownload, HiExclamationCircle, HiInformationCircle, HiStar,
} from "react-icons/hi";
import { DetailSection } from "../components/DetailDialog";
import GenderAvatar from "../components/GenderAvatar";
import FieldHelp from "../fieldHelp/FieldHelp";
import { InlineAlert, Spinner } from "../attendance/ui";
import { fmtDateTime } from "../attendance/dates";
import { TONE_CLASSES } from "../attendance/enums";
import { commentRateLimitMessage, isCommentRateLimited, taskErrorMessage } from "../utils/taskErrors";
import { taskPlaneFor } from "./taskPlanes";
import { openTaskAttachment } from "./taskUpload";
import { TaskAttachmentsField, TaskLinkList, TaskLinksField } from "./TaskFormFields";
import { textareaClass } from "./taskFormMeta";
import {
  TASK_LIMITS, canCommentOnTask, cleanLinks, formatFileSize, linkProblem, parseSystemComment,
  personInSentence,
} from "./taskMeta";

const help = (field) => ({ surface: "tasks.discussion", field });

/** The envelope's body, whichever depth `request()` handed back. */
const unwrap = (res) => (res?.data ?? res ?? {});

const commentsOf = (body) => (Array.isArray(body?.comments) ? body.comments : []);

/** A page read newest-first, turned back into reading order. */
const oldestFirst = (list) => [...list].reverse();

export default function TaskDiscussion({ task, plane = "me", onPosted, bare = false }) {
  const adapter = taskPlaneFor(plane);
  const taskId = task?.id;
  const open = canCommentOnTask(task);

  const [milestonesOnly, setMilestonesOnly] = useState(false);
  const [rows, setRows] = useState([]);
  // The unfiltered size of the thread, for the section title. Held apart from
  // the rows so switching the filter on doesn't make the heading count drop.
  const [threadSize, setThreadSize] = useState(null);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [error, setError] = useState("");
  // Files uploaded from this composer. The task record is only re-read after a
  // post that carried one, and until it lands this is the only place their
  // names exist — without it a just-posted file would read "Attached file".
  const [justUploaded, setJustUploaded] = useState([]);

  // A token rather than a flag: the filter can be switched faster than a read
  // comes back, and the loser must not overwrite the winner (§7).
  const token = useRef(0);

  const read = useCallback((params) => adapter.comments(taskId, {
    limit: TASK_LIMITS.COMMENTS_PER_PAGE,
    order: "DESC",
    ...(milestonesOnly ? { is_progress_update: true } : {}),
    ...params,
  }), [adapter, taskId, milestonesOnly]);

  const load = useCallback(async () => {
    if (!taskId) return;
    const mine = (token.current += 1);
    setLoading(true);
    setError("");
    try {
      const body = unwrap(await read({ page: 1 }));
      if (mine !== token.current) return;
      const list = commentsOf(body);
      setRows(oldestFirst(list));
      setHasEarlier(!!body.pagination?.has_next_page);
      setPage(1);
      if (!milestonesOnly) setThreadSize(Number(body.pagination?.total_items ?? list.length));
    } catch (err) {
      if (mine !== token.current) return;
      setError(taskErrorMessage(err, "Couldn’t load the discussion."));
    } finally {
      if (mine === token.current) setLoading(false);
    }
  }, [read, taskId, milestonesOnly]);

  useEffect(() => { load(); }, [load]);

  const loadEarlier = async () => {
    const next = page + 1;
    const mine = token.current;
    setLoadingEarlier(true);
    try {
      const body = unwrap(await read({ page: next }));
      if (mine !== token.current) return;
      setRows((current) => [...oldestFirst(commentsOf(body)), ...current]);
      setHasEarlier(!!body.pagination?.has_next_page);
      setPage(next);
    } catch (err) {
      if (mine !== token.current) return;
      setError(taskErrorMessage(err, "Couldn’t load the earlier messages."));
    } finally {
      if (mine === token.current) setLoadingEarlier(false);
    }
  };

  /**
   * Post, then show the new message where it belongs — at the bottom.
   *
   * The server's own copy of the comment is appended rather than the draft, so
   * the author summary, the timestamp and the milestone flag on screen are the
   * ones that were actually saved.
   */
  const post = async (payload, files) => {
    const posted = unwrap(await adapter.postComment(taskId, payload)).comment;
    if (files?.length) {
      setJustUploaded((current) => [
        ...current,
        ...files
          .map((f) => ({ id: f.attachment?.id, file_name: f.file_name, file_size_bytes: f.file_size_bytes }))
          .filter((f) => f.id),
      ]);
    }
    setThreadSize((n) => (Number.isFinite(n) ? n + 1 : n));
    // A plain comment posted while "Milestones only" is on would be appended
    // into a list it doesn't belong in, so that case re-reads instead.
    if (posted && !milestonesOnly) setRows((current) => [...current, posted]);
    else load();
    // The task's Files section is now out of date. Nothing else a comment can
    // change shows anywhere else on this dialog, so nothing else is re-read.
    if (payload.attachment_ids?.length) onPosted?.();
  };

  const fileById = useMemo(() => {
    const map = new Map();
    (Array.isArray(task?.attachments) ? task.attachments : []).forEach((row) => { if (row?.id) map.set(row.id, row); });
    justUploaded.forEach((row) => map.set(row.id, row));
    return map;
  }, [task?.attachments, justUploaded]);

  const count = Number.isFinite(threadSize) ? threadSize : Number(task?.comments_count ?? NaN);
  const title = `Discussion${Number.isFinite(count) && count > 0 ? ` (${count})` : ""}`;

  const milestonesToggle = count > 0 ? (
    <button
      type="button"
      onClick={() => setMilestonesOnly((v) => !v)}
      aria-pressed={milestonesOnly}
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-bold border transition ${
        milestonesOnly
          ? "bg-purple-600 text-white border-purple-600"
          : "bg-white text-slate-500 border-slate-200 hover:text-purple-700 hover:border-purple-200"
      }`}
    >
      <HiStar className="w-3.5 h-3.5" /> Milestones only
    </button>
  ) : null;

  const body = (
    <>
      {error && <InlineAlert tone="rose" className="mb-3">{error}</InlineAlert>}

      {hasEarlier && (
        <button
          type="button"
          onClick={loadEarlier}
          disabled={loadingEarlier}
          className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-purple-700 hover:text-purple-900 transition disabled:opacity-50"
        >
          {loadingEarlier && <Spinner className="w-3 h-3" />} Show earlier messages
        </button>
      )}

      {loading ? (
        <p className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Spinner className="w-3.5 h-3.5" /> Loading the discussion…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400">
          {milestonesOnly
            ? "No milestones yet. A milestone is an update somebody marked as a step finished."
            : "Nothing said yet. Anything written here stays with the task, so whoever picks it up next can read it."}
        </p>
      ) : (
        <ul className="space-y-5">
          {rows.map((row) => (
            <CommentRow key={row.id} comment={row} fileById={fileById} />
          ))}
        </ul>
      )}

      {open ? (
        <CommentComposer taskId={taskId} onPost={post} />
      ) : (
        <p className="mt-4 pt-4 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-500">
          <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500" />
          <span>This task was called off, so nothing more can be added. Everything already said stays on the record.</span>
        </p>
      )}
    </>
  );

  if (bare) {
    return (
      <div>
        {milestonesToggle && <div className="flex justify-end mb-3">{milestonesToggle}</div>}
        {body}
      </div>
    );
  }

  return (
    <DetailSection
      title={title}
      icon={HiChatAlt2}
      help={{ ...help("comments"), label: "the discussion" }}
      action={milestonesToggle}
    >
      {body}
    </DetailSection>
  );
}

/* ── One message ──────────────────────────────────────────────────────────── */

function CommentRow({ comment, fileById }) {
  const author = comment?.author;
  const links = Array.isArray(comment?.external_links) ? comment.external_links : [];

  if (comment?.system_generated) return <SystemNote comment={comment} />;

  return (
    <li className="flex gap-3">
      <span className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-purple-50 ring-1 ring-slate-200">
        <GenderAvatar person={author} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-bold text-slate-800">{personInSentence(author, "A colleague")}</span>
          <span className="text-[11px] text-slate-400">{fmtDateTime(comment?.created_at)}</span>
          {comment?.is_progress_update && (
            // Fuchsia, which is where §5 sends the gold a milestone badge would
            // otherwise be. The only other coloured thing on these screens is
            // the rose overdue chip, so a milestone can't be mistaken for one.
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${TONE_CLASSES.amber}`}>
              <HiStar className="w-3 h-3" /> Milestone
            </span>
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap break-words">{comment?.message}</p>
        <CommentFiles ids={comment?.attachment_ids} fileById={fileById} />
        {links.length > 0 && <div className="mt-2"><TaskLinkList links={links} /></div>}
      </div>
    </li>
  );
}

/**
 * A note the system wrote itself when the task was sent back, handed over or
 * called off. Tinted rather than badged: it is not somebody talking, and a
 * reader scanning the thread for "why did this change?" should find it without
 * having to read it.
 */
function SystemNote({ comment }) {
  const { label, body } = parseSystemComment(comment?.message);
  const author = comment?.author;
  return (
    <li className="flex gap-3">
      <span className="w-8 h-8 rounded-full shrink-0 bg-purple-100 text-purple-600 flex items-center justify-center">
        <HiCog className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-purple-100 bg-purple-50/60 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-bold text-purple-800">{label}</span>
          <span className="text-[11px] text-purple-400">{fmtDateTime(comment?.created_at)}</span>
          {author && <span className="text-[11px] text-purple-500">by {personInSentence(author, "a colleague")}</span>}
        </div>
        {body && <p className="mt-1 text-xs leading-relaxed text-purple-900 whitespace-pre-wrap break-words">{body}</p>}
      </div>
    </li>
  );
}

/**
 * Files bundled with a message. Downloaded, never previewed — #270 signs every
 * link with `Content-Disposition: attachment` and the link dies in 15 minutes,
 * so it is re-signed on each press (the same rule as the task's own file list).
 */
function CommentFiles({ ids, fileById }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const list = Array.isArray(ids) ? ids : [];

  const download = async (id) => {
    setBusyId(id);
    setError("");
    try {
      await openTaskAttachment(id);
    } catch (err) {
      setError(taskErrorMessage(err, "Couldn’t open that file. Try again."));
    } finally {
      setBusyId("");
    }
  };

  if (list.length === 0) return null;

  return (
    <>
      <ul className="mt-2 flex flex-wrap gap-2">
        {list.map((id) => {
          const file = fileById.get(id);
          return (
            <li key={id} className="min-w-0">
              <button
                type="button"
                data-row-action
                onClick={() => download(id)}
                disabled={busyId === id}
                className="inline-flex items-center gap-1.5 max-w-full h-8 px-3 rounded-lg text-[11px] font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition disabled:opacity-50"
              >
                {busyId === id ? <Spinner className="w-3 h-3" /> : <HiDownload className="w-3.5 h-3.5 shrink-0" />}
                {/* Never the id (§4): a file the task record can't name yet is
                    still downloadable, it just isn't introduced by name. */}
                <span className="truncate">{file?.file_name || "Attached file"}</span>
                {file?.file_size_bytes ? (
                  <span className="text-slate-400 shrink-0">{formatFileSize(file.file_size_bytes)}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="inline-flex items-start gap-1 text-[11px] font-semibold text-rose-600 mt-2">
          <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </p>
      )}
    </>
  );
}

/* ── Saying something ─────────────────────────────────────────────────────── */

/**
 * The reply box. NOT a dialog: §3 keeps forms out of the record inspector, and
 * that rule is about a popup over a popup — a reply box inside the thread it
 * belongs to IS the thread, and lifting it into its own modal would hide the
 * conversation you are replying to behind it.
 *
 * Files and links start folded behind one disclosure. Most comments are a
 * sentence, and three empty field groups under every one of them turned a
 * thread into a form.
 */
function CommentComposer({ taskId, onPost }) {
  const [message, setMessage] = useState("");
  const [milestone, setMilestone] = useState(false);
  const [links, setLinks] = useState([]);
  const [files, setFiles] = useState([]);
  const [extras, setExtras] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const trimmed = message.trim();
  const linkTrouble = links.map(linkProblem).find(Boolean) || "";
  const blocked = !trimmed || !!linkTrouble || saving;

  const send = async (e) => {
    e?.preventDefault();
    if (blocked) return;
    setSaving(true);
    setError("");
    try {
      await onPost({
        message: trimmed,
        is_progress_update: milestone,
        attachment_ids: files.map((file) => file.attachment?.id).filter(Boolean),
        external_links: cleanLinks(links),
      }, files);
      setMessage("");
      setMilestone(false);
      setLinks([]);
      setFiles([]);
      setExtras(false);
    } catch (err) {
      // The hourly cap is the one refusal worth a countdown rather than a
      // sentence — "try again" is useless advice when the answer is "in 14
      // minutes" (EC-T12).
      setError(isCommentRateLimited(err) ? commentRateLimitMessage(err) : taskErrorMessage(err, "Couldn’t post that. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={send} noValidate className="mt-4 pt-4 border-t border-slate-100 space-y-3">
      <label htmlFor={`task-comment-${taskId}`} className="sr-only">Add to the discussion</label>
      <textarea
        id={`task-comment-${taskId}`}
        rows={3}
        value={message}
        maxLength={TASK_LIMITS.COMMENT_MAX}
        onChange={(e) => setMessage(e.target.value)}
        // Ctrl/⌘+Enter sends, the way every other message box does. Plain Enter
        // stays a newline: a half-written update posted by a stray Return can't
        // be taken back, because comments can't be edited or deleted.
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e); }}
        placeholder="Say where things have got to, or ask a question."
        className={textareaClass(false)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={milestone}
                onChange={(e) => setMilestone(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              Mark as a milestone
            </label>
            <FieldHelp {...help("is_progress_update")} label="milestone" />
          </div>
          <button
            type="button"
            onClick={() => setExtras((v) => !v)}
            aria-expanded={extras}
            className="text-[11px] font-bold text-purple-700 hover:text-purple-900 transition"
          >
            {extras ? "Hide files and links" : "Add files or links"}
            {!extras && files.length + links.length > 0 ? ` (${files.length + links.length})` : ""}
          </button>
        </div>
        <button
          type="submit"
          disabled={blocked}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200 transition disabled:opacity-50 disabled:shadow-none"
        >
          {saving && <Spinner />} Post
        </button>
      </div>

      {extras && (
        <div className="space-y-3 pt-1">
          <TaskAttachmentsField
            files={files}
            onChange={setFiles}
            taskId={taskId}
            context="comment"
            label="Files"
          />
          <TaskLinksField
            rows={links}
            onChange={setLinks}
            max={TASK_LIMITS.COMMENT_LINKS_MAX}
            help={help("external_links")}
            label="Links"
          />
        </div>
      )}

      {error && <InlineAlert tone="rose">{error}</InlineAlert>}
    </form>
  );
}
