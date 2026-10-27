// ─────────────────────────────────────────────────────────────────────────────
// taskUpload.js — The browser → S3 → confirm handshake for task files
// (#268–#270), in both of the two modes the backend calls A and B.
//
// Mode B (the task exists): upload-url with `task_id` → PUT to S3 → #269
// confirm → an attachment row with an id, which is what `attachment_ids` on a
// submission takes.
//
// Mode A (the task does not exist yet): upload-url WITHOUT `task_id` → PUT to
// S3 → keep the signed token. We deliberately do NOT confirm: the create call
// takes `attachment_tokens`, and its own transaction verifies each file is
// really in S3 and binds it to the new task, rolling the whole creation back if
// one is missing (#255/#265 §4.1). Confirming first would leave an orphan row
// bound to no task whenever the user then abandoned the form.
//
// Traps:
// • The PUT must be a BARE fetch — `request()` would add our Authorization
//   header and API base URL and S3 would reject the signature. `putToSignedUrl`
//   (payrollAttachments.js) already gets this right, including never setting
//   Content-Length, which browsers forbid. Reused rather than rewritten.
// • The staging token expires in 15 minutes. If the user sits on a half-filled
//   form past that, the create call answers INVALID_ATTACHMENT_TOKEN, which
//   taskErrors.js words as "choose the file again".
// • Tasks accept two file types payroll receipts don't — Word and Excel — so
//   the type list is its own, not payroll's.
// ─────────────────────────────────────────────────────────────────────────────

import { tasksAPI } from "../api";
import { putToSignedUrl, trimFileName } from "../utils/payrollAttachments";
import { taskErrorMessage } from "../utils/taskErrors";

/** CHK_TASK_ATTACHMENTS_SIZE — the server refuses anything larger. */
export const TASK_MAX_BYTES = 50 * 1024 * 1024;

export const TASK_ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export const TASK_ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xlsx";

const EXT_TO_TYPE = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const extOf = (name) => {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
};

/**
 * The content type to declare for a file. Windows hands us an empty `type` for
 * .docx often enough that the extension has to be able to decide on its own.
 */
export function taskContentType(file) {
  const byExt = EXT_TO_TYPE[extOf(file?.name)];
  if (byExt) return byExt;
  if (file?.type && TASK_ALLOWED_TYPES.includes(file.type)) return file.type;
  return file?.type || "";
}

/** Why this file can't be sent, or "" when it's fine. Checked before any request. */
export function taskFileProblem(file) {
  if (!file) return "Choose a file.";
  if (!file.size) return "That file is empty. Choose another one.";
  if (file.size > TASK_MAX_BYTES) return "That file is larger than 50 MB. Choose a smaller one.";
  if (!TASK_ALLOWED_TYPES.includes(taskContentType(file))) {
    return "Use a PDF, Word, Excel, JPG, PNG or WebP file.";
  }
  return "";
}

/** Which stage of the handshake failed, so the message can say something useful. */
export class TaskUploadError extends Error {
  constructor(stage, cause) {
    super(cause?.message || "Couldn’t upload the file.");
    this.name = "TaskUploadError";
    this.stage = stage; // "issue" | "put" | "confirm"
    this.cause = cause;
  }
}

export function taskUploadErrorMessage(err) {
  if (err instanceof TaskUploadError) {
    if (err.stage === "put") return "Couldn’t send the file to storage. Try again.";
    return taskErrorMessage(err.cause, "Couldn’t upload the file. Try again.");
  }
  return taskErrorMessage(err, "Couldn’t upload the file. Try again.");
}

/**
 * Upload one file for a task.
 *
 * @param {object} opts
 * @param {File}   opts.file
 * @param {string} [opts.taskId]   present → Mode B (confirmed now); absent → Mode A (token held)
 * @param {"briefing"|"submission"|"comment"} [opts.context]
 * @param {boolean} [opts.deferConfirm]
 *   Mode B with the confirm step held back: upload is scoped to the task via
 *   `task_id` (storage key and token claims both carry it), but #269 is NOT
 *   called here — the host confirms later. The task discussion composer uses
 *   this so a file picked and then removed before "Post" writes no row into
 *   `task_attachments`; otherwise the removed file still reaches the
 *   assignee, because #269 is what makes an attachment visible on the task.
 * @returns {Promise<{ attachment: object|null, token: string, file_name: string, file_size_bytes: number, content_type: string }>}
 *   `attachment` is the saved row in Mode B and null in Mode A or deferred
 *   Mode B, where `token` is what the create / confirm call needs.
 */
export async function uploadTaskFile({ file, taskId, context = "briefing", deferConfirm = false }) {
  const content_type = taskContentType(file);
  const file_name = trimFileName(file.name);

  let issued;
  try {
    const res = await tasksAPI.getTaskUploadUrl({
      file_name,
      content_type,
      file_size_bytes: file.size,
      attachment_context: context,
      ...(taskId ? { task_id: taskId } : {}),
    });
    issued = res?.data ?? res;
  } catch (err) {
    throw new TaskUploadError("issue", err);
  }

  const uploadUrl = issued?.upload_url;
  const token = issued?.attachment_token;
  if (!uploadUrl || !token) {
    throw new TaskUploadError("issue", new Error("Storage didn’t return an upload link."));
  }

  try {
    await putToSignedUrl(uploadUrl, file, issued?.required_headers, content_type);
  } catch (err) {
    throw new TaskUploadError("put", err);
  }

  const meta = { token, file_name, file_size_bytes: file.size, content_type };

  // Mode A stops here on purpose — see the header.
  if (!taskId) return { attachment: null, ...meta };

  // Deferred Mode B — hold the token, let the host confirm when it actually
  // commits the message. See the JSDoc for why the discussion composer wants
  // this instead of a confirm-on-pick.
  if (deferConfirm) return { attachment: null, ...meta };

  try {
    const res = await tasksAPI.confirmTaskAttachment(token);
    const body = res?.data ?? res ?? {};
    return { attachment: body.attachment ?? body, ...meta };
  } catch (err) {
    throw new TaskUploadError("confirm", err);
  }
}

/**
 * Open one attachment through a fresh presigned link (#270). Never cache the
 * URL: it dies after 15 minutes, and the server audits nothing we could replay.
 */
export async function openTaskAttachment(attachmentId) {
  const res = await tasksAPI.getTaskAttachmentDownloadUrl(attachmentId);
  const data = res?.data ?? res ?? {};
  const url = data.download_url || data.url || "";
  if (!url) throw new Error("Storage didn’t return a link for that file.");
  // `noopener` matters: the signed URL would otherwise be reachable from the
  // opened tab's `window.opener`.
  window.open(url, "_blank", "noopener,noreferrer");
  return data;
}
