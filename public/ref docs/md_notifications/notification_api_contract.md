# Notification REST API Contract — Mobile App & Web Frontend

| | |
|---|---|
| **Status** | PLAN ONLY — these endpoints do not exist yet |
| **Authored** | 2026-10-24 |
| **Base** | `/api/v1/notifications` (existing mount, `notification.index.js`) |
| **Parent plan** | [`notification_system_implementation_plan.md`](notification_system_implementation_plan.md) |

Written for the mobile and web client engineers who will consume these, and for the backend engineer
who will implement them.

---

## 0. Conventions

**Auth.** `Authorization: Bearer <access token>` on every endpoint. A token without an `orgId` claim
(the org-selection token) is rejected by `authenticate` with `401 ORG_SELECTION_REQUIRED` before any
of this runs.

**Roles.** `authorize(['employee','manager','hr','admin','super-admin'])` — the same list the device
registry uses. Every org member has an inbox. `admin` / `super-admin` are platform-plane roles with
no tenant data; they authenticate fine and receive an **empty list**, because `org_id` is `NOT NULL`
on the table and no event ever targets them.

**Scoping — the only access rule there is.** Every query, read or write, is
`WHERE user_id = req.user.id AND org_id = req.user.orgId`. There is no `user_id` parameter, no
`employee_id` filter, and no manager or HR view of somebody else's inbox on any of these endpoints. A
notification id that does not match the caller returns **404**, never 403 — the caller learns nothing
about whether the id exists.

**Success envelope** (matches every other module):

```json
{ "success": true, "message": "Notifications fetched", "data": { } }
```

**Error envelope** (produced by `error.middleware.js`, not by the controller):

```json
{ "success": false, "message": "Notification not found", "errorCode": "NOTIFICATION_NOT_FOUND" }
```

**Kill switch.** With `NOTIFICATION_ENGINE_ENABLED` unset or `false`, all five endpoints return
`503` / `FEATURE_DISABLED` — the same shape the attendance location feature uses. Clients must treat
503 `FEATURE_DISABLED` as "hide the bell icon", not as an outage.

**Query validation.** Validated **in the controller** with
`validateOrThrow(schema, req.query)`, never by assigning `req.query` — Express 5 makes `req.query` a
getter and the assignment is a silent no-op. Unknown query parameters are **rejected** (`400`), as
Joi `stripUnknown` is not used anywhere in this repo's validators.

---

## 1. `GET /api/v1/notifications`

The paginated feed.

### Query parameters

| Name | Type | Default | Rules |
|---|---|---|---|
| `page` | integer | `1` | ≥ 1 |
| `limit` | integer | `20` | 1–50. Capped at 50 — a mobile feed has no legitimate need for more, and an uncapped `limit` is a cheap way to make the server do unbounded work. |
| `is_read` | boolean | — | Omitted = both. `false` is the one that uses the partial index. |
| `category` | string | — | One of `leave`, `attendance`, `payroll`, `task`, `document`, `shift`, `employee`, `system`. Anything else is `400`, not an empty list — a typo should be loud. |

### Ordering

`created_at DESC, id DESC`. **The `id` tiebreaker is not optional.** Two notifications written in the
same `bulkCreate` share a `created_at` to the microsecond; ordering by `created_at` alone lets
page 2 repeat or skip a row. `task.service.js:59` already records this lesson for tasks.

### 200 response

```json
{
  "success": true,
  "message": "Notifications fetched",
  "data": {
    "items": [
      {
        "id": "8f3c…",
        "event_key": "leave.approved",
        "category": "leave",
        "title": "Leave approved",
        "message": "Your Casual Leave from 2026-11-02 to 2026-11-04 was approved by Priya Nair.",
        "actor_name": "Priya Nair",
        "metadata": { "screen": "LeaveDetails", "id": "a91f…", "event_key": "leave.approved" },
        "is_read": false,
        "read_at": null,
        "created_at": "2026-10-24T09:12:44.118Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 143, "total_pages": 8 }
  }
}
```

### Projection — what is deliberately absent

| Not returned | Why |
|---|---|
| `actor_id` | Resolved to `actor_name` at read time. A raw user id in a client payload is an enumeration surface for no benefit. `actor_name` is `null` when the actor was deleted (`ON DELETE SET NULL`) or the event had no actor (a cron). |
| `user_id`, `org_id` | Always the caller's. Returning them invites a client to send them back as a filter. |
| `channels`, `dispatch_status`, `attempts`, `last_error`, `next_retry_at`, `push_sent_at`, `email_sent_at`, `delivered_at` | Delivery bookkeeping. Operationally useful, not client-useful, and `last_error` can carry provider detail. Keep them server-side. |
| `deduplication_key` | Internal. |
| `push_body` | The lock-screen variant; the app shows `message`. |

`is_read` is a derived boolean (`read_at !== null`) sent **alongside** `read_at` so a client can both
branch cheaply and show the timestamp.

### Errors

| Status | `errorCode` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad `page` / `limit` / `category` / unknown parameter |
| 401 | `AUTH_TOKEN_MISSING` · `TOKEN_EXPIRED` · `TOKEN_INVALID` | Standard |
| 403 | `ORG_ACCESS_DEACTIVATED` | Membership deactivated (from `authenticate`) |
| 503 | `FEATURE_DISABLED` | Engine kill switch off |

---

## 2. `GET /api/v1/notifications/unread-count`

The badge. Must be the cheapest endpoint in the product — a mobile app polls it.

```json
{
  "success": true,
  "message": "Unread count fetched",
  "data": { "unread_count": 100, "is_capped": true }
}
```

**Capped by design** (plan D-11). The query is

```sql
SELECT count(*) FROM (
  SELECT 1 FROM notifications
   WHERE user_id = :uid AND org_id = :org AND read_at IS NULL
   LIMIT :cap
) t
```

with `cap = NOTIFICATION_UNREAD_COUNT_CAP` (default 100). A plain `COUNT(*)` over a user who has
never opened the app is unbounded work on every poll, forever. `is_capped: true` means "at least
`unread_count`" — render `99+`. The partial index `notif_unread_idx` makes this an index-only scan
that stops after `cap` rows.

No query parameters. **Note for route authoring:** this is a literal path. If a `GET /:id` endpoint
is ever added it will capture `/unread-count` unless registered after it. Say so in the routes file.

---

## 3. `PATCH /api/v1/notifications/:id/read`

### Request

`:id` — UUID. No body. A body is rejected (`400`) rather than ignored.

### Behaviour

```sql
UPDATE notifications SET read_at = now(), updated_at = now()
 WHERE id = :id AND user_id = :uid AND org_id = :org AND read_at IS NULL
RETURNING id, read_at
```

**Idempotent.** Already-read returns `200` with the existing `read_at` — the `read_at IS NULL`
predicate means the second call updates nothing, and the controller then re-reads the row rather
than reporting a failure. A notification panel that fires this on every render must not produce
errors or move the timestamp.

```json
{ "success": true, "message": "Notification marked as read",
  "data": { "id": "8f3c…", "read_at": "2026-10-24T09:20:01.004Z" } }
```

### Errors

| Status | `errorCode` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `:id` is not a UUID |
| 404 | `NOTIFICATION_NOT_FOUND` | No row matched **id + user + org**. This is the IDOR boundary: another user's real id and a random UUID are indistinguishable from here. |
| 503 | `FEATURE_DISABLED` | Kill switch off |

---

## 4. `PATCH /api/v1/notifications/mark-all-read`

### Request

No body. Optionally `{ "category": "leave" }` to clear one tab — **decide before implementing**; the
plan assumes no body (clear everything) for Phase 1, because a partial clear plus a badge count is
an easy place to produce an inconsistent UI.

### Behaviour — watermarked (plan D-17)

```sql
UPDATE notifications SET read_at = :now, updated_at = :now
 WHERE user_id = :uid AND org_id = :org AND read_at IS NULL AND created_at <= :now
```

The `created_at <= :now` watermark makes the statement **deterministic**: a notification that arrives
while the update runs stays unread rather than being silently swallowed, so the badge the client
shows next is correct. Without it, "mark all read" can lose a notification the user never saw — and
nobody would ever find out.

```json
{ "success": true, "message": "All notifications marked as read",
  "data": { "updated_count": 143 } }
```

`updated_count` lets the client decrement its badge to zero confidently, and lets support answer
"did the button do anything?".

**Bounding.** On a stale account this can touch tens of thousands of rows. The write is index-driven
(`notif_unread_idx` holds exactly the rows being updated) and is a single statement, so it takes no
long lock in practice. If the retention sweeper is ever disabled, revisit this with a chunked loop —
noted here so the trade-off is visible rather than discovered.

---

## 5. `DELETE /api/v1/notifications/:id`

Dismiss. A **hard delete** — the table is `paranoid: false` and a dismissed notification has no
audit value (the business event it describes is already audited by its own module).

```sql
DELETE FROM notifications WHERE id = :id AND user_id = :uid AND org_id = :org
```

```json
{ "success": true, "message": "Notification dismissed", "data": { "id": "8f3c…" } }
```

| Status | `errorCode` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `:id` is not a UUID |
| 404 | `NOTIFICATION_NOT_FOUND` | No row matched id + user + org (including a second DELETE of the same id) |
| 503 | `FEATURE_DISABLED` | Kill switch off |

A second `DELETE` of the same id returns `404`, not `200`. That is the honest answer and it matches
every other `DELETE` in this repo; clients should treat `404` on dismiss as success.

---

## 6. Validator sketch

`src/modules/notification/validators/notification.validator.js`

```js
const Joi = require('joi')

const CATEGORIES = ['leave','attendance','payroll','task','document','shift','employee','system']

exports.listNotificationsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
  is_read: Joi.boolean(),
  category: Joi.string().valid(...CATEGORIES)
})

exports.idParamSchema = Joi.object({ id: Joi.string().uuid().required() })
exports.emptyBodySchema = Joi.object({}).max(0)
```

`is_read: Joi.boolean()` accepts `"true"` / `"false"` strings — Joi coerces, which is what a query
string delivers. Do **not** hand-parse it.

---

## 7. Client integration notes

**Polling, not sockets.** There is no WebSocket or SSE feed, and there will not be one in this
project: `nginx` here sets `proxy_buffering on` and `Connection ""`, and auth is Bearer-only
(`EventSource` cannot send an `Authorization` header). Poll `unread-count` — every 60 s in the
foreground, and on app resume. It is one index-only scan.

**Push and the inbox are the same notification.** Every push corresponds to a row in this feed
(catalog invariant 3: every event carries `in_app`). On receiving a push, refresh the feed rather
than rendering the push payload as the source of truth — the payload is deliberately thinner than
the row (no reason text, no amounts).

**Deep linking.** `metadata.screen` and `metadata.params` (surfaced flattened as `metadata.id`) are
the routing contract. Treat an unknown `screen` as "open the notification list" — the catalog will
grow screens the installed app does not know yet.

**`total_pages` casing.** Snake_case, matching every other field. The `task` module returns
`totalPages`; that inconsistency is not propagated here. Flag it if the app already assumes
otherwise — this is decision 4 in the plan's §0.3 and is cheap to change before implementation and
expensive after.

---

## 8. Change-record obligation

These five endpoints are new, so they are additive for the frontend. At implementation time a dated
change record still goes into `public/md_updates/` — both for the new endpoints and, separately, for
the Web Push payload shape change, which is the one genuinely breaking-capable item in this project.
