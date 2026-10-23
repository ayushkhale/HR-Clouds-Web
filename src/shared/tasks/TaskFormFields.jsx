// ─────────────────────────────────────────────────────────────────────────────
// TaskFormFields.jsx — The three form pieces every task dialog needs: the
// deadline, the reference links and the attachments. Kept together because all
// three are shared by the assign form (#255/#265), the submit form (#252) and
// the two deadline dialogs (#261 reassign-when-overdue, #263 extend).
//
// Each one renders as a fragment of labelled fields, never its own card, so
// the host form's grid stays one grid (CLAUDE.md §3 — wrap a pair in
// `className="contents"` rather than nesting another grid inside it).
//
// Traps:
//
// • THE DEADLINE IS A UTC INSTANT, NOT A DATE. The server compares it with
//   `now + 15 minutes` and decides lateness from it, so a date alone would
//   silently mean midnight — which is how a "due today" task is already
//   overdue the moment it is created. The field is therefore a date plus a
//   TimeField (never `<input type="time">`, §5), combined in the browser's own
//   zone and sent as an ISO string.
//
// • `combineLocalDateTime` is the shared helper the attendance module already
//   uses for exactly this; it returns a Date in local time, which `.toISOString()`
//   then converts. Doing the arithmetic by hand is how two screens end up a
//   timezone apart.
//
// • UPLOADS GO STRAIGHT TO S3 AND ARE SLOW. One file at a time with its own
//   spinner, and a failure leaves the rest of the list alone — the form must
//   never lose a 2000-character submission note because one PDF timed out.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { HiExclamationCircle, HiLink, HiPaperClip, HiPlus, HiTrash, HiUpload } from "react-icons/hi";
import TimeField from "../components/TimeField";
import FieldHelp from "../fieldHelp/FieldHelp";
import { FieldError } from "../attendance/ui";
import { toLocalYMD } from "../attendance/dates";
import { TASK_LIMITS, formatFileSize, linkProblem } from "./taskMeta";
import { inputClass, labelClass } from "./taskFormMeta";
import { TASK_ACCEPT_ATTR, taskFileProblem, taskUploadErrorMessage, uploadTaskFile } from "./taskUpload";

/**
 * Date + time for a deadline. `value` is `{ date, time }`; the host converts
 * with `joinDueDate` when it submits, so the half-filled state is editable
 * rather than snapping to midnight.
 */
export function DueDateField({ id, value, onChange, error, help, label = "Deadline", required = true, min, disabled = false }) {
  return (
    <>
      <div>
        <div className="flex items-center">
          <label htmlFor={`${id}-date`} className={labelClass}>
            {label} {required && <span className="text-rose-400">*</span>}
          </label>
          {help && <FieldHelp {...help} label={label.toLowerCase()} className="mb-1.5" />}
        </div>
        <input
          id={`${id}-date`}
          type="date"
          value={value.date}
          min={min ?? toLocalYMD(new Date())}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
          className={inputClass(!!error)}
        />
      </div>
      <div>
        {/* A <span>, not a <label>: TimeField is a group of buttons and a text
            box with no single labelable control, so it carries its own
            `aria-label` instead (same arrangement as the shift form). */}
        <span className={labelClass}>
          Time of day {required && <span className="text-rose-400">*</span>}
        </span>
        <TimeField
          label={`${label} time of day`}
          value={value.time}
          onChange={(next) => onChange({ ...value, time: next })}
          disabled={disabled}
          invalid={!!error}
          clearable={false}
        />
        <FieldError message={error} />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference links
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Repeatable `{ label, url }` rows. The server takes `https://` only and caps
 * the list, so both are enforced here — a rejected link would otherwise sink
 * the whole form with one unhelpful 400.
 */
export function TaskLinksField({ rows, onChange, max = TASK_LIMITS.LINKS_MAX, help, label = "Reference links" }) {
  const add = () => onChange([...rows, { label: "", url: "" }]);
  const remove = (index) => onChange(rows.filter((_, i) => i !== index));
  const set = (index, key, value) => onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  return (
    <div className="sm:col-span-2">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center">
          <span className={`${labelClass} mb-0`}>{label}</span>
          {help && <FieldHelp {...help} label="reference links" />}
        </div>
        {rows.length < max && (
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-900 transition"
          >
            <HiPlus className="w-3.5 h-3.5" /> Add a link
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-[11px] text-slate-400">
          Nothing linked. Add a sheet, document or page the work needs — it has to start with https://
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => {
            const problem = linkProblem(row);
            return (
              <div key={index} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2 items-start">
                <input
                  type="text"
                  value={row.label}
                  maxLength={TASK_LIMITS.LINK_LABEL_MAX}
                  placeholder="What it is"
                  onChange={(e) => set(index, "label", e.target.value)}
                  className={inputClass(!!problem)}
                  aria-label={`Link ${index + 1} name`}
                />
                <div className="min-w-0">
                  <input
                    type="url"
                    value={row.url}
                    maxLength={TASK_LIMITS.LINK_URL_MAX}
                    placeholder="https://…"
                    onChange={(e) => set(index, "url", e.target.value)}
                    className={inputClass(!!problem)}
                    aria-label={`Link ${index + 1} address`}
                  />
                  <FieldError message={problem} />
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="h-11 w-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                  aria-label={`Remove link ${index + 1}`}
                >
                  <HiTrash className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Read-only list of links on a task, for the detail dialog. */
export function TaskLinkList({ links }) {
  if (!links?.length) return <p className="text-xs text-slate-400">Nothing linked.</p>;
  return (
    <ul className="space-y-1.5">
      {links.map((link, i) => (
        <li key={`${link.url}-${i}`}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-start gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900 hover:underline break-all"
          >
            <HiLink className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {link.label || link.url}
          </a>
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Attachments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pick files for a task, one at a time, through the presigned handshake.
 *
 * `taskId` decides the mode (see taskUpload.js): with one, each file is
 * confirmed immediately and the host collects `attachment.id`; without one the
 * file is staged and the host collects `token` for `attachment_tokens`. The
 * host keeps the list either way, because what it sends differs.
 *
 * @param {object} props
 * @param {Array}  props.files    [{ token, file_name, file_size_bytes, attachment }]
 * @param {string} [props.taskId]
 */
export function TaskAttachmentsField({ files, onChange, taskId, context = "briefing", max = TASK_LIMITS.ATTACHMENTS_PER_WRITE, help, label = "Attachments", disabled = false, deferConfirm = false }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const atMax = files.length >= max;

  const pick = () => {
    if (busy || disabled || atMax) return;
    inputRef.current?.click();
  };

  const onFile = async (file) => {
    if (!file || busyRef.current) return;
    setError("");
    const problem = taskFileProblem(file);
    if (problem) { setError(problem); return; }
    busyRef.current = true;
    setBusy(true);
    try {
      const uploaded = await uploadTaskFile({ file, taskId, context, deferConfirm });
      onChange([...files, uploaded]);
    } catch (err) {
      setError(taskUploadErrorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="sm:col-span-2">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center">
          <span className={`${labelClass} mb-0`}>{label}</span>
          {help && <FieldHelp {...help} label="attachments" />}
        </div>
        <button
          type="button"
          onClick={pick}
          disabled={busy || disabled || atMax}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy
            ? <><span className="inline-block w-3.5 h-3.5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" /> Uploading…</>
            : <><HiUpload className="w-3.5 h-3.5" /> Add a file</>}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={TASK_ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onFile(f); }}
      />

      {files.length === 0 ? (
        <p className="text-[11px] text-slate-400">
          Nothing attached. PDF, Word, Excel or an image, up to 10 MB each.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((file, index) => (
            <li key={file.token || index} className="flex items-center gap-2 bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2">
              <HiPaperClip className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span className="flex-1 min-w-0 truncate text-xs font-semibold text-slate-700">{file.file_name}</span>
              <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{formatFileSize(file.file_size_bytes)}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="p-1 rounded text-slate-400 hover:text-rose-600 transition shrink-0"
                aria-label={`Remove ${file.file_name}`}
              >
                <HiTrash className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {atMax && <p className="text-[11px] text-slate-400 mt-1.5">That’s the most files you can add at once.</p>}
      {error && (
        <p className="inline-flex items-start gap-1 text-[11px] font-semibold text-rose-600 mt-1.5">
          <HiExclamationCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </p>
      )}
    </div>
  );
}
