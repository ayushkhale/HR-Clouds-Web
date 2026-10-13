// ─────────────────────────────────────────────────────────────────────────────
// taskErrors.js — Typed `errorCode` values from the Task Assignment module
// (#249–#270) turned into plain English. Same shape as leaveErrors.js /
// payrollErrors.js: a code we know wins, then the server's own message, then a
// generic line.
//
// Written for someone who doesn't work in HR (CLAUDE.md §6): each line says
// what to do next, never which invariant the server tripped on. The server's
// own copy is engineer-facing ("Task must be in review status to be approved"),
// so most of these deliberately override it.
// ─────────────────────────────────────────────────────────────────────────────

const TASK_ERROR_MESSAGES = {
  // Feature gating / plan entitlement
  FEATURE_NOT_AVAILABLE: "Tasks aren’t switched on for this organisation. Ask your administrator to turn them on.",
  MISSING_ORG_CONTEXT: "Tasks are only available inside an organisation. Switch to an organisation account to continue.",

  // Access
  FORBIDDEN: "You don’t have authority to do this to this task.",
  CANNOT_ASSIGN_OUTSIDE_HIERARCHY: "You can only give tasks to people who report to you.",
  CANNOT_ACCESS_OUTSIDE_HIERARCHY: "That person doesn’t report to you, so you can’t see their tasks.",
  FORBIDDEN_TASK_ACCESS: "You can only join the discussion on tasks you gave out, or tasks belonging to people who report to you.",
  TASK_NOT_FOUND: "That task no longer exists, or it isn’t yours to open. Refresh the list to see what’s there now.",
  ASSIGNEE_NOT_FOUND: "That person isn’t in this organisation any more. Pick someone else.",

  // Creating and reassigning
  SELF_ASSIGNMENT_NOT_ALLOWED: "You can’t give a task to yourself — a task is work you hand to someone else.",
  INVALID_DUE_DATE: "Pick a deadline at least 15 minutes from now, and later than the one already set.",
  INVALID_REASSIGNMENT: "This task is already with that person.",
  OVERDUE_REASSIGNMENT_REQUIRES_NEW_DUE_DATE: "This task is already past its deadline, so set a new one before handing it over.",

  // Lifecycle
  TASK_TERMINATED: "This task is finished, so it can’t be changed any more.",
  TASK_COMPLETED: "This task has already been marked done.",
  INVALID_STATUS_TRANSITION: "That isn’t possible at this stage of the task. Refresh to see where it stands now.",
  PRECONDITION_FAILED: "Somebody else changed this task while you were looking at it. Refresh and try again.",

  // Attachments
  ATTACHMENT_LIMIT_EXCEEDED: "This task already has 20 files, which is the most it can hold. Remove one before adding another.",
  INVALID_ATTACHMENT_TOKEN: "That upload expired before it was saved. Choose the file again.",
  INVALID_ATTACHMENT_ID: "One of those files isn’t on this task any more. Refresh and attach it again.",
  ATTACHMENT_NOT_FOUND_IN_STORAGE: "The file didn’t finish uploading. Choose it again.",
  ATTACHMENT_NOT_FOUND: "That file isn’t there any more.",
  INVALID_ATTACHMENT: "One of those files isn’t on this task any more. Refresh and attach it again.",
  STORAGE_SERVICE_UNAVAILABLE: "File storage isn’t responding right now. Try again in a few minutes.",

  // The discussion (#253/#264). The rate limit's own line is generic on
  // purpose — `commentRateLimitMessage` below says the actual wait when the
  // server tells us one, and this is the fallback for when it doesn't.
  TOO_MANY_COMMENTS: "You’ve posted a lot on this task in the last hour. Wait a few minutes, then try again.",
};

export const taskErrorCode = (err) => err?.data?.errorCode || err?.data?.error_code || "";

/**
 * A friendly, actionable message for a rejected task request.
 * @param {unknown} err error thrown by `request()` (carries `.data.errorCode`)
 * @param {string} [fallback]
 */
export function taskErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  const code = taskErrorCode(err);
  if (code && TASK_ERROR_MESSAGES[code]) return TASK_ERROR_MESSAGES[code];
  return err?.message || fallback;
}

/** The organisation's plan doesn't include tasks — show the feature notice, not an error. */
export const isTaskFeatureDisabled = (err) => {
  const code = taskErrorCode(err);
  return code === "FEATURE_NOT_AVAILABLE" || code === "MISSING_ORG_CONTEXT";
};

/**
 * Someone else wrote to this task first (412). The caller reloads the row and
 * keeps the dialog open, rather than losing what the user typed.
 */
export const isTaskStale = (err) => taskErrorCode(err) === "PRECONDITION_FAILED" || err?.status === 412;

/** Too many comments on this task in the current hour (429, EC-T12). */
export const isCommentRateLimited = (err) =>
  taskErrorCode(err) === "TOO_MANY_COMMENTS" || err?.status === 429;

/**
 * The rate-limit refusal with the wait in it, when the server said how long.
 *
 * The seconds arrive under one of three names depending on how far the
 * response travelled (the handler's own `retry_after_seconds`, the generic
 * error envelope's `details`, or the HTTP `Retry-After` header our client
 * doesn't surface), so all the shapes we can see are checked and anything
 * missing falls back to the untimed line. Rounded UP to the next whole minute:
 * "wait 1 minute" and then being refused again is worse than waiting two.
 */
export function commentRateLimitMessage(err) {
  const data = err?.data || {};
  const seconds = Number(
    data.retry_after_seconds
    ?? data.details?.retry_after_seconds
    ?? data.data?.retry_after_seconds,
  );
  if (!Number.isFinite(seconds) || seconds <= 0) return TASK_ERROR_MESSAGES.TOO_MANY_COMMENTS;
  const minutes = Math.ceil(seconds / 60);
  return `You’ve reached the limit of 30 comments an hour on this task. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export { TASK_ERROR_MESSAGES };
