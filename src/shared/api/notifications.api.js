// ─────────────────────────────────────────────────────────────────────────────
// notifications.api.js — the notification inbox and the push-device registry.
//
// Two groups of calls behind one mount (`/api/v1/notifications/*`), owned by
// the backend's notification module:
//   · the INBOX — the in-app feed, its unread badge, read marks and dismiss
//     (2026-10-24 contract). Every event the engine raises writes an in-app
//     row, so this feed is the source of truth; a push is only a nudge.
//   · the DEVICE REGISTRY — which browser or handset the server may wake.
//     Location checks were its first consumer; the engine is its second.
//
// ─── CONTRACT TRAPS ────────────────────────────────────────────────────────
// · UNKNOWN QUERY PARAMETERS ARE A 400, not ignored — the validators do not use
//   Joi `stripUnknown`. `qs()` drops undefined/null/"" so a filter nobody set
//   never reaches the wire, and nothing here forwards a caller's spare keys.
// · `limit` IS CAPPED AT 50 by the server. Asking for more is a 400, not a
//   truncated page, so `listNotifications` clamps rather than letting a caller
//   discover that in production.
// · THE TWO PATCHes SEND NO BODY. The schema is `Joi.object({}).max(0)`: an
//   absent body parses to `{}` and passes, while any key at all is a 400.
//   Never "helpfully" post the notification back.
// · `GET /unread-count` IS A LITERAL PATH that would be captured by a `GET /:id`
//   route. There is no `GET /:id` today; if one appears, this call breaks before
//   anything else does.
// · THE BADGE IS CAPPED (`NOTIFICATION_UNREAD_COUNT_CAP`, default 100). With
//   `is_capped: true`, `unread_count` means "at least this many" — render 99+,
//   never the raw figure. `badgeLabel()` in notificationMeta.js does that.
// · MARK-ALL-READ IS WATERMARKED to the request moment, so a notification that
//   arrives mid-request stays unread. Trust `updated_count`, then re-read the
//   badge rather than assuming zero.
// · DISMISS IS A HARD DELETE and a second DELETE of the same id is a 404. Treat
//   404 on dismiss as success — the row is gone either way.
// · 503 `FEATURE_DISABLED` IS THE KILL SWITCH, not an outage: hide the bell and
//   the inbox, show no error. `isNotificationsDisabled()` in
//   notificationErrors.js is the one test for it.
// · REGISTRATION IS A HARD PREREQUISITE for push and for location checks. With
//   no active device, every locate against the person is `422 NO_ACTIVE_DEVICE`.
// · THE POST UPSERTS ON THE TOKEN. Re-registering the same browser or handset
//   returns the same row rather than a duplicate — the server keys on a hash of
//   `push_token`, which is globally unique, so a reassigned company phone moves
//   to its new owner instead of colliding.
// · THE TOKEN IS NEVER RETURNED. Neither `push_token` nor its hash comes back on
//   any read, so a device row cannot be matched to a live browser subscription
//   by comparing tokens. Match on `id`, which is what we store locally.
//
// Contract: public/ref docs/md_notifications/notification_api_contract.md
//           public/ref docs/md_updates/2026-10-24_notification_inbox_apis_and_push_payload.md
//           public/ref docs/md_updates/2026-10-23_on_demand_location_tracking_frontend_guide.md §2.1
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";
import { qs } from "./attendance.api.js";

const seg = (value) => encodeURIComponent(String(value ?? ""));

/** The server's own cap. Asking for more is a 400, so clamp before sending. */
export const NOTIFICATION_PAGE_MAX = 50;

/** The `category` values the server accepts. Anything else is a 400, not an empty page. */
export const NOTIFICATION_CATEGORIES = [
  "leave", "attendance", "payroll", "task", "document", "shift", "employee", "system",
];

export const notificationsAPI = {
  // ── Inbox ────────────────────────────────────────────────────────────────

  /**
   * The paginated feed, newest first.
   * @param {{page?: number, limit?: number, is_read?: boolean, category?: string}} params
   *   Only these four keys are sent; anything else would be a 400.
   * @returns `{ items: [...], pagination: { page, limit, total, total_pages } }`
   *   — `total_pages`, snake_case, unlike the task module's `totalPages`.
   */
  listNotifications: ({ page, limit, is_read, category } = {}) => request(
    `/notifications${qs({
      page,
      limit: limit == null ? undefined : Math.min(Number(limit) || 1, NOTIFICATION_PAGE_MAX),
      // Joi coerces the query string, so "true"/"false" is what it wants.
      is_read: typeof is_read === "boolean" ? String(is_read) : undefined,
      category: NOTIFICATION_CATEGORIES.includes(category) ? category : undefined,
    })}`,
  ),

  /** The badge. `{ unread_count, is_capped }` — capped means "at least this many". */
  getUnreadCount: () => request("/notifications/unread-count"),

  /** Idempotent: marking an already-read notification returns 200 with the same `read_at`. */
  markRead: (id) => request(`/notifications/${seg(id)}/read`, { method: "PATCH" }),

  /** Clears everything unread as of the request moment. `{ updated_count }`. */
  markAllRead: () => request("/notifications/mark-all-read", { method: "PATCH" }),

  /** Hard delete. A second call for the same id is a 404 — treat that as success. */
  dismissNotification: (id) => request(`/notifications/${seg(id)}`, { method: "DELETE" }),

  // ── Device registry ──────────────────────────────────────────────────────

  /**
   * Register (or re-register) this device so the server can wake it.
   * @param {{platform: "android"|"ios"|"web", push_token: string, device_name?: string, app_version?: string}} payload
   *   `push_token` is 1–8192 chars: an FCM registration token on mobile, or the
   *   JSON-serialised `PushSubscription` on web.
   * @returns `{ id, platform, device_name, app_version, is_active, last_seen_at,
   *   last_push_at, created_at }` — 201 on a new row, and on a repeat too.
   */
  registerDevice: (payload) => request("/notifications/devices", {
    method: "POST",
    body: JSON.stringify(payload),
  }),

  /** This person's own active devices. Carries no token, by design. */
  listDevices: () => request("/notifications/devices"),

  /** De-register on sign-out or when somebody turns the browser answer off. */
  deleteDevice: (id) => request(`/notifications/devices/${seg(id)}`, { method: "DELETE" }),
};

export default notificationsAPI;
