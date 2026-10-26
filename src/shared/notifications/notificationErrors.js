// ─────────────────────────────────────────────────────────────────────────────
// notificationErrors.js — the notification module's error codes in plain words,
// plus the two predicates the UI branches on.
//
// Always branch on the CODE, never the message (§7). Two codes decide behaviour
// rather than wording:
//
// · `FEATURE_DISABLED` (503) is the engine's kill switch, not an outage. Ops
//   turns the whole engine off with one environment variable and every endpoint
//   answers 503 until it comes back. The UI must then HIDE the bell and the
//   inbox and say nothing — a toast reading "notifications are unavailable" on
//   every poll, once a minute, forever, is worse than no notifications. Nothing
//   in this app depends on the feed, so there is nothing to warn about.
//
// · `NOTIFICATION_NOT_FOUND` (404) is the IDOR boundary: somebody else's real id
//   and a random one are indistinguishable from the client. It also means "the
//   row is already gone", which is why a dismiss that 404s counts as a success —
//   the user asked for it to go away and it has.
//
// Contract: public/ref docs/md_notifications/notification_api_contract.md §1–§5
// ─────────────────────────────────────────────────────────────────────────────

const MESSAGES = {
  FEATURE_DISABLED: "Notifications are switched off for this organisation.",
  NOTIFICATION_NOT_FOUND: "That notification is no longer there. It may already have been cleared.",
  VALIDATION_ERROR: "Couldn’t load that view of your notifications. Try the All tab.",
  ORG_SELECTION_REQUIRED: "Choose which organisation you’re working in, then open notifications again.",
  ORG_ACCESS_DEACTIVATED: "Your access to this organisation has been turned off, so there is nothing to show.",
};

/** The server's `errorCode`, whatever shape the failure arrived in. */
export function notificationErrorCode(err) {
  return err?.data?.errorCode || err?.errorCode || err?.data?.code || "";
}

/**
 * A sentence to show a person. Never a raw code and never a Joi message (§6).
 * `fallback` covers a network failure, a timeout or a gateway HTML page, none
 * of which carry a code.
 */
export function notificationErrorMessage(err, fallback = "Couldn’t load your notifications.") {
  const mapped = MESSAGES[notificationErrorCode(err)];
  if (mapped) return mapped;
  if (err?.isTimeout) return "That took too long. Check your connection and try again.";
  const message = typeof err?.message === "string" ? err.message : "";
  // client.js synthesises "Request failed (503 …)" when the body carried
  // nothing readable; that is a status line, not something to show anyone.
  if (message && !/^Request failed \(/.test(message)) return message;
  return fallback;
}

/**
 * The kill switch. Latched by NotificationsContext the first time it is seen:
 * the bell, the sidebar entry and the page all disappear until the next reload
 * finds the engine back on.
 *
 * The status is checked as well as the code because a gateway can answer 503
 * with its own HTML, which carries no code at all — and the honest reading of
 * "the notification service is not answering" is the same one: hide it.
 */
export const isNotificationsDisabled = (err) =>
  notificationErrorCode(err) === "FEATURE_DISABLED" || err?.status === 503;

/** Gone, or never ours. Either way the row should leave the list. */
export const isNotificationMissing = (err) =>
  notificationErrorCode(err) === "NOTIFICATION_NOT_FOUND" || err?.status === 404;
