// ─────────────────────────────────────────────────────────────────────────────
// SubmitTaskDialog.jsx — The assignee hands their work in for review (#252).
//
// It is a form, not a record inspector, so it does not use DetailDialog (§3);
// it is the same wide, gridded, pinned-footer shape as the assign form, because
// four fields and a file list must not have to be scrolled past.
//
// Traps:
//
// • THE TASK HAS TO BE STARTED FIRST. #252 refuses a `pending` task with
//   "start work on the task first", so the My Tasks footer only offers this
//   from "being worked on" or "changes requested" — the dialog never has to
//   explain a state it can't be opened from.
//
// • FILES HERE ARE MODE B: the task already exists, so each upload is confirmed
//   through #269 as it is picked and we send `attachment_ids`. That is the
//   opposite of the assign form, which sends staged tokens — same field,
//   different currency, which is why taskUpload returns both.
//
// • SUBMITTING IS ONE-WAY. The task moves to "waiting for review" and the
//   assignee can no longer change its status (#251 answers 409), so the dialog
//   says that before they press the button rather than after.
//
// • NEW LINKS ARE APPENDED TO THE BRIEF'S LINKS, not swapped for them (#252
//   step 6). Nothing here can remove a link the assigner put on the task.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { HiX } from "react-icons/hi";
import FieldHelp from "../fieldHelp/FieldHelp";
import { FieldError, InlineAlert, Spinner } from "../attendance/ui";
import { taskErrorMessage } from "../utils/taskErrors";
import { TaskAttachmentsField, TaskLinksField } from "./TaskFormFields";
import { labelClass, textareaClass } from "./taskFormMeta";
import { TASK_LIMITS, cleanLinks, linkProblem } from "./taskMeta";

const help = (field) => ({ surface: "tasks.submit", field });

export default function SubmitTaskDialog({ task, onSubmit, onClose }) {
  const [note, setNote] = useState("");
  const [links, setLinks] = useState([]);
  const [files, setFiles] = useState([]);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const trimmed = note.trim();
  const noteProblem = trimmed.length < TASK_LIMITS.SUBMISSION_NOTE_MIN
    ? `Write at least ${TASK_LIMITS.SUBMISSION_NOTE_MIN} characters so your reviewer knows what you did.`
    : "";
  const linkProblems = links.map(linkProblem).find(Boolean) || "";
  const blocked = !!noteProblem || !!linkProblems;

  const send = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (saving || blocked) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        submission_note: trimmed,
        attachment_ids: files.map((file) => file.attachment?.id).filter(Boolean),
        external_links: cleanLinks(links),
      });
    } catch (err) {
      setError(taskErrorMessage(err, "Couldn’t hand this in."));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <form
        onSubmit={send}
        noValidate
        className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
        aria-label="Hand in your work"
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-800">Hand in your work</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{task?.title}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <InlineAlert tone="sky" className="mb-5">
            Once you hand this in, the task waits on your reviewer and you can’t change it until they either approve it
            or send it back.
          </InlineAlert>
          {error && <InlineAlert tone="rose" className="mb-5">{error}</InlineAlert>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div className="sm:col-span-2">
              <div className="flex items-center">
                <label htmlFor="task-submit-note" className={labelClass}>What you did <span className="text-rose-400">*</span></label>
                <FieldHelp {...help("submission_note")} label="what you did" className="mb-1.5" />
              </div>
              <textarea
                id="task-submit-note"
                rows={5}
                value={note}
                maxLength={TASK_LIMITS.SUBMISSION_NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="What you finished, anything you changed along the way, and anything your reviewer should look at first."
                className={textareaClass(touched && !!noteProblem)}
              />
              <div className="flex items-center justify-between mt-1">
                <FieldError message={touched ? noteProblem : ""} />
                <span className="text-[11px] text-slate-400 tabular-nums ml-auto">
                  {note.length}/{TASK_LIMITS.SUBMISSION_NOTE_MAX}
                </span>
              </div>
            </div>

            <TaskLinksField
              rows={links}
              onChange={setLinks}
              max={TASK_LIMITS.SUBMISSION_LINKS_MAX}
              label="Links to the work"
              help={help("external_links")}
            />

            <TaskAttachmentsField
              files={files}
              onChange={setFiles}
              taskId={task?.id}
              context="submission"
              disabled={saving}
              label="Files you’re handing in"
              help={help("attachment_ids")}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">
            Not yet
          </button>
          <button type="submit" disabled={saving} className="sm:min-w-[170px] px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200 transition disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
            {saving ? <><Spinner /> Handing it in…</> : "Hand in for review"}
          </button>
        </div>
      </form>
    </div>
  );
}
