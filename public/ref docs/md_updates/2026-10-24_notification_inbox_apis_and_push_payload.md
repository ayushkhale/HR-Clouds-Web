# Notification Inbox APIs + Push Payload Change

**Date:** 2026-10-24
**Area:** Notification module (`/api/v1/notifications`), FCM + Web Push transports
**Affects frontend:** YES — 5 new inbox endpoints, and a NEW push payload shape the clients must branch on.  
**Full Integration Guide:** [`public/md_notifications/frontend_fcm_and_notification_integration_guide.md`](../md_notifications/frontend_fcm_and_notification_integration_guide.md)

---

## 1. Why this exists

The multi-channel notification engine is live. It writes an **in-app** record for every
notification, and — for events that opt in — also fans out a **push** (FCM / Web Push) and/or an
**email**. The frontend needs to (a) render the in-app inbox from the new REST endpoints, and
(b) handle the new *visible* push payload shape in the service worker / mobile push handlers.

The whole engine is behind the `NOTIFICATION_ENGINE_ENABLED` kill switch. While it is **off**, all
five endpoints return **503 `FEATURE_DISABLED`** and no pushes are sent. Build the UI to degrade
gracefully on a 503 (hide the bell / inbox, do not hard-error).

---

## 2. New inbox REST endpoints

Base path: `/api/v1/notifications`
Auth: `Authorization: Bearer <token>` — all org roles (`employee`, `manager`, `hr`, `admin`,
`super-admin`). Every endpoint is **scoped to the caller's own notifications**; another user's id is
indistinguishable from a nonexistent one (always `404`, never `403`).

All responses use the standard envelope: `{ success, message, data }`.

### 2.1 `GET /` — feed (paginated, filterable)

Query params (all optional):

| param      | type    | default | notes                                                          |
|------------|---------|---------|----------------------------------------------------------------|
| `page`     | integer | `1`     | min 1                                                          |
| `limit`    | integer | `20`    | min 1, **max 50**                                             |
| `is_read`  | boolean | —       | absent = both; `true` = read only; `false` = unread only       |
| `category` | string  | —       | one of: `leave`, `attendance`, `payroll`, `task`, `document`, `shift`, `employee`, `system` |

Response `data`:

```json
{
  "items": [
    {
      "id": "uuid",
      "event_key": "leave.approved",
      "category": "leave",
      "title": "Leave approved",
      "message": "Your casual leave from 2026-10-25 to 2026-10-26 was approved.",
      "actor_name": "Priya Nair",
      "metadata": { "event_key": "leave.approved", "screen": "LeaveRequestDetail", "id": "L1" },
      "is_read": false,
      "read_at": null,
      "created_at": "2026-10-24T09:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 3, "total_pages": 1 }
}
```

- `message` is the full, display-ready text (names/dates already interpolated server-side). Render
  it as **plain text** — do not expect HTML.
- `metadata.screen` + the remaining metadata keys are the **deep link**: navigate to `screen`,
  passing the other keys (commonly `id`) as route params. `metadata` is always an object (never null).

### 2.2 `GET /unread-count` — badge

Response `data`:

```json
{ "unread_count": 7, "is_capped": false }
```

- `unread_count` is **bounded** by `NOTIFICATION_UNREAD_COUNT_CAP` (default 100). When the true
  count exceeds the cap, `unread_count` is the cap and `is_capped` is `true` — render as `"99+"`
  (or `"100+"`), do not treat it as the exact number.

### 2.3 `PATCH /:id/read` — mark one read (idempotent)

`:id` must be a UUID. Response `data`: `{ "id": "<id>", "is_read": true }`.
Re-marking an already-read notification still returns 200. A foreign/unknown id is `404`.

### 2.4 `PATCH /mark-all-read` — mark all read

Response `data`: `{ "updated_count": 5 }`. Marks everything unread **as of the request moment**;
a notification that arrives mid-request is not swept.

### 2.5 `DELETE /:id` — dismiss (hard delete)

`:id` must be a UUID. Response `data`: `{ "id": "<id>", "dismissed": true }`. Unknown id is `404`.
Dismiss is permanent (the row is deleted, not hidden).

### 2.6 Errors

| status | errorCode                 | when                                             |
|--------|---------------------------|--------------------------------------------------|
| 503    | `FEATURE_DISABLED`        | engine kill switch is off — hide the inbox UI    |
| 404    | `NOTIFICATION_NOT_FOUND`  | id not found for this caller (also the foreign-id case) |
| 400/422| validation                | bad `page`/`limit`/`category`/`id` (non-UUID)    |

---

## 3. Push payload change — ACTION REQUIRED in the service worker / push handler

The push transports now emit **two** payload shapes. The original location-tracking shape is
**unchanged**; a new *visible notification* shape is added for the engine's notifications. Clients
must branch on `type` (Web Push) / on the presence of a top-level `notification` (FCM).

### 3.1 Web Push

The service worker already handles `type: "LOCATION_REQUEST"`. It must gain a branch for the new
`type: "NOTIFICATION"`:

```jsonc
// EXISTING — unchanged (on-demand location request; silent, triggers a GPS read)
{ "type": "LOCATION_REQUEST", "requestId": "...", "expiresAt": "..." }

// NEW — a visible notification from the engine
{
  "type": "NOTIFICATION",
  "notification": { "title": "Leave approved", "body": "Your leave was approved." },
  // plus the routing keys (the whitelisted deep-link data; never amounts/reasons):
  "screen": "LeaveRequestDetail",
  "id": "L1",
  "event_key": "leave.approved"
}
```

Service worker should, on `type === "NOTIFICATION"`, call `showNotification(notification.title,
{ body: notification.body, data: <the routing keys> })`, and on notification click navigate using
`data.screen` + `data.id`. **Do not** display the `LOCATION_REQUEST` payload as a notification —
that branch must keep its current silent behavior.

### 3.2 FCM (Android / iOS)

- **Data-only (unchanged):** no top-level `notification` key; `apns-priority: 5` +
  `content-available: 1`. This is the silent location-request wake-up — keep the existing
  background handler.
- **Visible (new):** a top-level `notification: { title, body }` is present; `apns-priority: 10`
  with an `aps.alert`/`sound`, and **no** `content-available`. The OS renders the alert directly;
  the custom `data` object carries the same routing keys (`screen`, `id`, `event_key`) for tap
  handling. Only the whitelisted keys are present in `data` — the full `message` and any
  amount/reason text are **never** in the push payload (lock-screen privacy).

---

## 4. Notes

- In-app is always written; push/email are best-effort and may lag (a cron drains them ~every
  minute with retry/backoff). Treat the inbox feed as the source of truth; push is a nudge.
- No existing endpoint changed shape. This is additive.
- Source of truth for events and fields: `public/md_notifications/notification_event_catalog.md`
  and `notification_api_contract.md`.
