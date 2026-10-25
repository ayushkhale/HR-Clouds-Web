// ─────────────────────────────────────────────────────────────────────────────
// inbox.api.js — the one read behind every badge in the app.
//
// `GET /inbox/badges` returns the whole count tree — sidebar badges, the twelve
// inbox cards, the governance tiles — in a single round trip, scoped to the
// caller's role by the server. It replaced a fan-out of 13–17 `limit: 1` reads
// that no screen could afford to repeat, which is why badges used to sit stale
// for a minute at a time and disagree with the list they opened.
//
// Nothing here caches or polls. badgeCountsStore.js owns both, and is the only
// caller: a second poller would undo the whole point of this endpoint.
//
// ─── CONTRACT TRAPS ────────────────────────────────────────────────────────
// · THE KEYS ARE ALWAYS PRESENT. A category this role may not see, or whose
//   billing feature is off, comes back as zeros AND is named in
//   `meta.unavailable_categories` (dotted: "inbox.claims", "bank_verification").
//   A zero you did not check against that list is a lie — HIDE the badge or the
//   card, never render a confident 0 for a queue that cannot exist (§2: absent,
//   not broken).
// · `sidebar.inbox_total` IS THE SUM OF THE TWELVE `categories.inbox.*.total`
//   VALUES AND NOTHING ELSE. Bank and document verification have their own
//   sidebar badges and are deliberately outside it. Don't add them back.
// · 429 `BADGE_SUMMARY_RATE_LIMITED` IS REAL: 240 reads per user per UTC hour.
//   A 60 s poll spends 60 of them, so decision-driven refreshes have room but
//   not unlimited room. The wait is in `error.retryAfter` (seconds, read from
//   the header by client.js) or `details.retry_after_seconds` in the body — a
//   proxy can strip the header but not the payload, so prefer the body.
// · NO ENDPOINT IS NOT AN OUTAGE. A server from before this feature answers 404
//   here. That is "this server counts the old way", not an error to show
//   anybody — `isBadgeSummaryMissing()` is the one test for it, and the store
//   falls back to the per-queue reads for the rest of the session.
// · THE NOTIFICATION FIGURES ARE NOT OURS TO RENDER. `notifications.unread` is
//   capped at 100 (`unread_is_capped`), and NotificationsContext already owns
//   that badge with optimistic read/dismiss writes this snapshot cannot see.
//   Two owners for one number is how the bell and the menu entry drift apart.
// · THE SERVER STRIPS UNKNOWN QUERY PARAMETERS (`stripUnknown: true`), so a
//   future `?groups=` cannot break an old client — and equally, a parameter we
//   invent today is silently ignored rather than refused.
//
// Contract: public/ref docs/md_updates/2026-10-25_badge_counts_and_pending_hr_api_changes.md
//           public/ref docs/md_updates/2026-10-25_unified_badge_counts_api_specification.md
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";

export const inboxAPI = {
  /** The whole badge tree for the signed-in user, in one request (#278). */
  getBadgeSummary: () => request("/inbox/badges"),
};

/**
 * Is this failure "the server has no badge endpoint" rather than a fault?
 *
 * 404 is an unmounted route; 501 is the shape a deliberately-absent feature
 * takes elsewhere in this API. Either way the answer is to count the old way,
 * quietly, for the rest of the session — never a toast and never an error page.
 */
export function isBadgeSummaryMissing(err) {
  const status = err?.status;
  return status === 404 || status === 501;
}

/** Seconds to wait after a 429, body first (a proxy can strip the header). */
export function badgeRetryAfterSeconds(err) {
  const fromBody = Number(err?.data?.details?.retry_after_seconds);
  if (Number.isFinite(fromBody) && fromBody >= 0) return fromBody;
  const fromHeader = Number(err?.retryAfter);
  return Number.isFinite(fromHeader) && fromHeader >= 0 ? fromHeader : 60;
}
