// ─────────────────────────────────────────────────────────────────────────────
// AssignTaskDialog.jsx — Give a task to somebody (#255 for a manager, #265 for
// HR). One form, one plane prop: the two endpoints take an identical body and
// differ only in how far they let you reach, so forking this would have been
// two copies of the same eleven fields (CLAUDE.md §2).
//
// Shaped like Create Attendance Policy, which is the house pattern for a big
// form: wide and gridded so nothing has to be scrolled past, uppercase 11px
// labels, pinned footer (§3). `max-w-md` on a form this size is a bug.
//
// Traps:
//
// • THE DEADLINE MUST BE AT LEAST 15 MINUTES AWAY (EC-T6) and is an instant,
//   not a date — see TaskFormFields. A "due today" task set to midnight would
//   be born overdue.
//
// • FILES ARE STAGED, NOT ATTACHED. Each one is uploaded to S3 before the task
//   exists and its signed token goes in `attachment_tokens`; the create
//   transaction verifies every token against storage and rolls the whole task
//   back if one is missing (§4.1). So a file picked here is already uploaded —
//   abandoning the form leaves an orphan object in the staging prefix, which is
//   the deliberate trade the backend chose over a two-step create.
//
// • THE TOKENS EXPIRE IN 15 MINUTES. A form left open longer fails with
//   INVALID_ATTACHMENT_TOKEN, which taskErrors words as "choose the file
//   again" — and the files list is kept so the user can see which one.
//
// • YOU CANNOT GIVE YOURSELF A TASK (D-T3), and a manager cannot give one to
//   HR or an admin (#255). Both are filtered out of the picker rather than
//   surfaced as a 400 after submit.
//
// • `assigneeId` LOCKS THE PERSON. Opened from somebody's own record (the
//   Tasks tab on an employee profile), the question "who is this for?" is
//   already answered, so the picker becomes a read-only name — a pre-filled
//   but editable picker there invites giving the task to the wrong person on a
//   screen that is about one. The lock is still CHECKED against the picker's
//   own options, so a person this plane may not delegate to is refused in our
//   words rather than by a 400 after the files have been uploaded.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { HiUser, HiX } from "react-icons/hi";
import { PersonSelect } from "../components/PersonPicker";
import FieldHelp from "../fieldHelp/FieldHelp";
import { FieldError, InlineAlert, Spinner } from "../attendance/ui";
import { taskErrorMessage } from "../utils/taskErrors";
import { taskPlaneFor } from "./taskPlanes";
import { useTaskAssigneeOptions } from "./useTaskAssignees";
import { DueDateField, TaskAttachmentsField, TaskLinksField } from "./TaskFormFields";
import { inputClass, joinDueDate, labelClass, textareaClass } from "./taskFormMeta";
import { TASK_CATEGORY_OPTIONS, TASK_LIMITS, TASK_PRIORITY_OPTIONS, cleanLinks, dueDateProblem, linkProblem } from "./taskMeta";

const help = (field) => ({ surface: "tasks.assign", field });

const EMPTY = {
  title: "",
  description: "",
  category: "operational",
  priority: "medium",
  assignee_id: "",
  due: { date: "", time: "" },
  links: [],
  files: [],
};

/**
 * @param {object} props
 * @param {"manager"|"hr"} [props.plane]
 * @param {string} [props.assigneeId]    lock the task to this person
 * @param {string} [props.assigneeName]  their name, so the lock never shows an id (§4)
 */
export default function AssignTaskDialog({ plane = "manager", assigneeId = "", assigneeName = "", onClose, onCreated }) {
  const adapter = taskPlaneFor(plane);
  const { options, loading: peopleLoading, unavailable } = useTaskAssigneeOptions(plane);
  const [form, setForm] = useState(() => (assigneeId ? { ...EMPTY, assignee_id: String(assigneeId) } : EMPTY));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // A locked person is verified against the same options the picker offers, but
  // only once they are in hand: while the roster is loading, or where this role
  // may not read it at all, the server is the authority (§7).
  const locked = !!assigneeId;
  const lockedEntry = locked ? options.find((person) => String(person.id) === String(assigneeId)) : null;
  const lockedRefused = locked && !lockedEntry && !peopleLoading && !unavailable;
  const lockedName = assigneeName || lockedEntry?.name || (peopleLoading ? "Loading…" : "This person");

  const dueIso = joinDueDate(form.due);
  const problems = {
    title: form.title.trim() ? "" : "Give the task a short title.",
    description: form.description.trim() ? "" : "Say what needs to be done.",
    assignee_id: lockedRefused
      ? `You can’t give ${lockedName} a task. ${plane === "manager" ? "Only the people who report to you can be given one." : "They may have left the organisation."}`
      : form.assignee_id ? "" : "Choose who this is for.",
    due: dueDateProblem(dueIso),
    links: form.links.map(linkProblem).find(Boolean) || "",
  };
  const blocked = Object.values(problems).some(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (saving || blocked) return;
    setSaving(true);
    setError("");
    try {
      const res = await adapter.create({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority,
        due_date: dueIso,
        assignee_id: form.assignee_id,
        external_links: cleanLinks(form.links),
        attachment_tokens: form.files.map((file) => file.token),
      });
      onCreated(res?.data ?? res);
    } catch (err) {
      setError(taskErrorMessage(err, "Couldn’t give out this task."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <form
        onSubmit={submit}
        noValidate
        className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
        aria-label="Give out a task"
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Give out a task</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {locked
                ? `This one goes to ${lockedName}.`
                : plane === "hr"
                  ? "Anyone in the organisation can be given this."
                  : "You can give this to anyone who reports to you."}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {error && <InlineAlert tone="rose" className="mb-5">{error}</InlineAlert>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div className="sm:col-span-2">
              <label htmlFor="task-title" className={labelClass}>Title <span className="text-rose-400">*</span></label>
              <input
                id="task-title"
                type="text"
                value={form.title}
                maxLength={TASK_LIMITS.TITLE_MAX}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Reconcile Q3 sales commission against the CRM"
                className={inputClass(touched && !!problems.title)}
              />
              <FieldError message={touched ? problems.title : ""} />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="task-who" className={labelClass}>Who it’s for <span className="text-rose-400">*</span></label>
              {locked ? (
                <>
                  {/* Not a disabled input: there is nothing to fix here, so it
                      reads as the answer it is rather than a dead control. */}
                  <p
                    id="task-who"
                    className={`min-h-10 flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold ${lockedRefused ? "bg-rose-50 border border-rose-200 text-rose-700" : "bg-slate-50/70 border border-slate-200 text-slate-800"}`}
                  >
                    <HiUser className={`w-4 h-4 shrink-0 ${lockedRefused ? "text-rose-400" : "text-purple-500"}`} />
                    <span className="truncate">{lockedName}</span>
                  </p>
                  {!lockedRefused && (
                    <p className="text-[11px] text-slate-500 mt-1">Opened from their record, so this task can only go to them.</p>
                  )}
                  <FieldError message={lockedRefused ? problems.assignee_id : ""} />
                </>
              ) : (
                <>
                  <PersonSelect
                    id="task-who"
                    people={options}
                    value={form.assignee_id}
                    onChange={(id) => set("assignee_id", id)}
                    loading={peopleLoading}
                    disabled={saving}
                    invalid={touched && !!problems.assignee_id}
                    placeholder={plane === "hr" ? "Choose anyone in the organisation" : "Choose one of your team"}
                    emptyText={unavailable
                      ? "The list of people isn’t available here."
                      : plane === "manager" ? "Nobody reports to you yet." : "No people found."}
                  />
                  <FieldError message={touched ? problems.assignee_id : ""} />
                </>
              )}
            </div>

            <div>
              <div className="flex items-center">
                <label htmlFor="task-category" className={labelClass}>Kind of work</label>
                <FieldHelp {...help("category")} label="kind of work" className="mb-1.5" />
              </div>
              <select
                id="task-category"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className={inputClass(false)}
              >
                {TASK_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center">
                <label htmlFor="task-priority" className={labelClass}>Priority</label>
                <FieldHelp {...help("priority")} label="priority" className="mb-1.5" />
              </div>
              <select
                id="task-priority"
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
                className={inputClass(false)}
              >
                {TASK_PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <DueDateField
              id="task-due"
              value={form.due}
              onChange={(next) => set("due", next)}
              error={touched ? problems.due : ""}
              disabled={saving}
              help={help("due_date")}
            />

            <div className="sm:col-span-2">
              <label htmlFor="task-description" className={labelClass}>What needs to be done <span className="text-rose-400">*</span></label>
              <textarea
                id="task-description"
                rows={5}
                value={form.description}
                maxLength={TASK_LIMITS.DESCRIPTION_MAX}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What the work is, what finished looks like, and anything they need to know before starting."
                className={textareaClass(touched && !!problems.description)}
              />
              <div className="flex items-center justify-between mt-1">
                <FieldError message={touched ? problems.description : ""} />
                <span className="text-[11px] text-slate-400 tabular-nums ml-auto">
                  {form.description.length}/{TASK_LIMITS.DESCRIPTION_MAX}
                </span>
              </div>
            </div>

            <TaskLinksField
              rows={form.links}
              onChange={(rows) => set("links", rows)}
              help={help("external_links")}
            />

            <TaskAttachmentsField
              files={form.files}
              onChange={(files) => set("files", files)}
              context="briefing"
              disabled={saving}
              help={help("attachment_tokens")}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="sm:min-w-[170px] px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200 transition disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
            {saving ? <><Spinner /> Giving it out…</> : "Give out the task"}
          </button>
        </div>
      </form>
    </div>
  );
}
