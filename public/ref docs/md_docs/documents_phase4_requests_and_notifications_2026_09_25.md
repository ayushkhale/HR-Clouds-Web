# Documents Module — Phase 4: Requests, Checklists, Notifications & Automation

**Date:** 2026-09-25
**Module:** Documents
**Type:** Additive feature release + two behavioural changes to existing endpoints
**Audience:** Frontend / API clients

---

## Summary

Phase 4 adds **document requests** (HR/managers ask an employee to provide a document), the **required-document checklist** with onboarding completeness, an **email notification outbox**, and the **background automation** (expiry flip, reminders, retention sweep, recipient top-up) with manual HR triggers.

- **19 new endpoints** (#80–#98) across the HR, Manager and Self planes.
- **1 additive response field** — `fulfilled_request_id` — on the existing upload-confirm and link-reference responses.
- **8 new org settings** (#71–#78) on `document_settings`.
- **2 behavioural changes** to existing endpoints (type deactivate, and `mandatory_for` validation) — see the last section; **client action required**.

> **Feature flag:** every endpoint requires `documents.access`.
> **Async surface:** notifications are delivered by email out-of-band. Nothing in these responses is a delivery receipt; use the HR notification list (#87) to observe the outbox.

---

## 1. Common shapes

### Envelope
All endpoints return the standard envelope:
```json
{ "success": true, "message": "…", "data": { … } }
```

### Request object (`serializeRequest`)
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "document_type_id": "uuid",
  "status": "open | overdue | fulfilled | cancelled",
  "due_on": "YYYY-MM-DD | null",
  "days_until_due": 3,
  "note": "string | null",
  "requested_by": "uuid",
  "requested_by_role": "hr | manager",
  "fulfilled_document_id": "uuid | null",
  "fulfilled_at": "ISO-8601 | null",
  "cancelled_at": "ISO-8601 | null",
  "cancel_reason": "string | null",
  "created_at": "ISO-8601",
  "reminder_count": 2,
  "last_reminder_on": "YYYY-MM-DD | null"
}
```
- `days_until_due` is **derived on read** from `due_on` vs today (IST); `null` when there is no `due_on`. Negative when overdue.
- **Plane projection:**
  - **HR** plane: full object (includes `reminder_count` and `last_reminder_on`).
  - **Manager** plane: includes `reminder_count`, **omits** `last_reminder_on`.
  - **Self** plane: **omits both** `reminder_count` and `last_reminder_on`.
- The response is **flat** — it does not embed the employee, document type, or requester objects. Resolve those from their ids via existing endpoints.

### Checklist object
```json
{
  "user_id": "uuid",
  "completeness": {
    "required": 6,
    "satisfied": 5,
    "percent": 83,
    "threshold": 100,
    "meets_threshold": false
  },
  "items": [
    {
      "document_type_id": "uuid",
      "name": "Aadhaar Card",
      "is_statutory": true,
      "state": "satisfied | expiring | expired | pending_upload | requested | missing",
      "document_id": "uuid | null",
      "expires_on": "YYYY-MM-DD | null",
      "days_until_expiry": 12,
      "request_id": "uuid | null"
    }
  ],
  "profile_incomplete": true
}
```
- `profile_incomplete` is present **only when true** (the employee's targeting profile is not yet complete, so the required set is the smallest safe set).
- On the **Manager** plane, `document_id` is `null` for a type whose policy withholds manager view (the `state` is still shown).

---

## 2. New endpoints — HR plane (#80–#92)

Base: `/api/v1/documents/hr` · Roles: `hr` only.

| # | Method & Path | Purpose |
|---|---|---|
| 80 | `POST /employees/:userId/document-requests` | Raise a request for one type against one employee. |
| 81 | `POST /employees/:userId/document-requests/bulk-from-checklist` | Raise one request per outstanding checklist item. |
| 82 | `GET /document-requests` | Org-wide paged request list. |
| 83 | `GET /document-requests/:id` | Request detail. |
| 84 | `POST /document-requests/:id/cancel` | Cancel with a mandatory reason. |
| 85 | `POST /document-requests/:id/remind` | Send the overdue notice now (idempotent per day). |
| 86 | `GET /employees/:userId/checklist` | One employee's checklist + completeness. |
| 87 | `GET /notifications` | Notification outbox (observability). |
| 88 | `POST /jobs/expiry-sweep/run` | Run expiry flip for the caller's org. |
| 89 | `POST /jobs/document-reminders/run` | Run the reminder job. |
| 90 | `POST /jobs/notification-dispatch/run` | Drain the outbox. |
| 91 | `POST /jobs/document-sweeper/run` | Run retention/abandoned sweep (destructive). |
| 92 | `POST /jobs/recipient-topup/run` | Run org-document recipient top-up. |

### #80 — Raise a request
Request body:
```json
{ "document_type_id": "uuid", "due_on": "YYYY-MM-DD (optional, today..+365 IST)", "note": "string ≤1000 (optional)" }
```
- **201** → the request object.
- **409 `DOCUMENT_ALREADY_PRESENT`** — a live document of that type already exists.
- **409 `DUPLICATE_REQUEST`** — an open request already exists; `details.request_id` gives the existing one.
- **404 `USER_NOT_FOUND`** — no active employee for `:userId`.
- **404 / 409** on the type per existing type rules.

### #81 — Bulk from checklist
No body. Raises one request for each outstanding item, each in its own savepoint (an item another caller just requested is skipped, not failed).
- **201** →
```json
{ "created": [ { "request_id": "uuid", "document_type_id": "uuid" } ],
  "skipped": [ { "document_type_id": "uuid", "reason": "already_requested" } ] }
```
- **409 `NOTHING_TO_REQUEST`** — the checklist has no outstanding items.

### #82 — List requests
Query: `status` (repeatable: `open|overdue|fulfilled|cancelled`), `user_id`, `document_type_id`, `overdue_only` (bool), `page` (≥1, default 1), `limit` (1–100, default 20).
- **200** → `{ "total": 42, "rows": [ <request object>, … ] }`.

### #83 — Get request → **200** request object (HR projection). Unknown/out-of-org id → **404 `DOCUMENT_NOT_FOUND`**.

### #84 — Cancel
Body: `{ "reason": "string 1..500 (required)" }`. **200** → the cancelled request. A settled (fulfilled/cancelled) request → **409**.

### #85 — Remind now
No body. **200** →
```json
{ "reminded": true, "request": <request object> }
```
or, if already reminded today:
```json
{ "reminded": false, "reason": "already_reminded_today", "request": <request object> }
```
(A reminder email is only *enqueued*; observe delivery via #87.)

### #86 — Checklist → **200** checklist object.

### #87 — Notifications (outbox)
Query: `status`, `event_type` (`document_uploaded|document_expiring|acknowledgement_pending|document_request_raised|document_request_overdue`), `from`, `to` (ISO dates), `page`, `limit` (1–100).
- **200** → `{ "total": N, "rows": [ … ] }`. Each row carries `id, event_type, channel, recipient_user_id, recipient_role, subject_user_id, entity_type, entity_id, payload, status, attempts, last_error, scheduled_for, claimed_at, sent_at, created_at, updated_at`. **`dedupe_key` is never returned.**

### #88–#92 — Manual job triggers
No meaningful body. **The org is always taken from the authenticated session; any `org_id` in the body is ignored.** Each returns:
```json
{ "job": "expiry_flip | document_reminders | notification_dispatch | document_sweeper | recipient_topup",
  "duration_ms": 84, "ok": true, "orgs_scanned": 1, "errors": [], … }
```
Job-specific counters are merged in (e.g. `flipped`, `claimed/sent/failed/skipped`, `abandoned/purged/outbox_purged`, `documents/recipients`, `overdue_flipped/expiry/acknowledgement/request_overdue`).

---

## 3. New endpoints — Manager plane (#93–#96)

Base: `/api/v1/documents/manager` · Roles: `manager, hr`. A manager acts only within their reporting cohort.

| # | Method & Path | Notes |
|---|---|---|
| 93 | `POST /employees/:userId/document-requests` | Same body as #80; only for types whose policy allows manager requests (else **403 `TYPE_NOT_REQUESTABLE`**). Out-of-scope employee → **403 `FORBIDDEN`**. |
| 94 | `GET /document-requests` | Same query as #82, scoped to the cohort. Manager projection (no `last_reminder_on`). |
| 95 | `POST /document-requests/:id/cancel` | Cancel a request **the manager raised** for an in-scope employee. Out-of-scope OR not-the-requester → **404 `DOCUMENT_NOT_FOUND`**. |
| 96 | `GET /employees/:userId/checklist` | Direct report's checklist; confidential-type links withheld. Out-of-scope → **403 `FORBIDDEN`**. |

---

## 4. New endpoints — Self plane (#97–#98)

Base: `/api/v1/documents` · Roles: any authenticated tenant role. Always scoped to the caller.

| # | Method & Path | Notes |
|---|---|---|
| 97 | `GET /me/document-requests` | The caller's own requests. Query: `status`, `document_type_id`, `overdue_only`, `page`, `limit`. Self projection (no `reminder_count`, no `last_reminder_on`). |
| 98 | `GET /me/checklist` | The caller's own checklist + completeness. |

> An HR or manager user hitting `/me/*` sees **only their own** rows, never the org-wide or team view.

---

## 5. Additive field on existing endpoints — `fulfilled_request_id`

When an employee document is confirmed (`POST …/documents/:id/confirm`, #11/#32/#37) or an external reference is linked (`POST …/link-reference`, #12), the upload now **auto-fulfils** any matching open/overdue request. The response detail gains one additive field:

```json
{ "…": "…", "fulfilled_request_id": "uuid | null" }
```
- `null` when no open request matched (or on an idempotent replay of a confirm that already ran).
- **This is purely additive.** No existing field changed name, type, or meaning. Clients that ignore unknown fields are unaffected; clients that want to close a "please upload X" prompt can read it.

---

## 6. New org settings (#71–#78)

All live on the `document_settings` singleton; read via `GET /hr/settings` (#23), written via `PUT /hr/settings` (#24). Full descriptions are in `org_settings_registry.md`.

| # | Key | Type | Default | Bounds |
|---|---|---|---|---|
| 71 | `document_expiry_reminder_days` | int[] | `[30, 15, 7]` | ≤6 entries, each 0–365; stored de-duplicated & descending; `[]` allowed |
| 72 | `document_notify_hr_on_upload` | bool | `false` | — |
| 73 | `document_notify_expiry` | bool | `false` | — |
| 74 | `document_notify_pending_acknowledgement` | bool | `false` | — |
| 75 | `document_notify_request_raised` | bool | `false` | — |
| 76 | `document_notify_request_overdue` | bool | `false` | — |
| 77 | `document_request_default_due_days` | int | `7` | 1–365 |
| 78 | `document_onboarding_completeness_threshold` | int | `100` | 0–100 |

Out-of-range values are rejected with **`422 SETTING_OUT_OF_RANGE`** (the array and the two numerics); a malformed schedule (>6 entries, non-integer, out of range) is likewise `422`. All five notification toggles default **off**: no email is sent until an org opts in.

---

## 7. Behavioural changes to EXISTING endpoints — ⚠️ client action required

### 7.1 Type deactivate can now fail on open requests
`PATCH /api/v1/documents/hr/types/:id/deactivate` (#8) already returned **`409 DOCUMENT_TYPE_IN_USE`** when a type had open employee documents or draft org documents. Phase 4 adds **open document requests** to the same guard. The `details` map now carries a third counter:
```json
{ "open_employee_documents": 0, "open_org_documents": 0, "open_document_requests": 2 }
```
- Same endpoint, same method, same error code and status. If your client already surfaces `DOCUMENT_TYPE_IN_USE` and its `details`, just read the new counter. An `overdue` request counts as open and blocks deactivation.

### 7.2 `mandatory_for` is now strictly validated
`POST /hr/types` (#4) and `PUT /hr/types/:id` (#7) previously accepted any object for `mandatory_for` and silently stored it. Phase 4 is the first reader of this field (it drives the checklist), so it is now validated against the six targeting keys — `target_departments`, `target_locations`, `target_employment_types`, `target_job_statuses`, `included_users`, `excluded_users`.
- Any **unknown key**, or an `included_users`/`excluded_users` **overlap**, now returns **`400 VALIDATION_ERROR`** (this codebase returns `400`, not `422`, for Joi failures).
- **No data migration is performed.** Existing rows written under loose validation are tolerated on read (`normaliseCriteria` ignores unknown keys), but an over-broad or typo'd `mandatory_for` may produce the wrong checklist. **Review any document type whose `mandatory_for` was configured before this release** and re-save it through the validated endpoint.

---

## 8. Delivery & operational notes for the frontend

- **Emails are asynchronous.** Requests/reminders enqueue a notice; the dispatcher (`*/15 min`) sends it. A `201`/`200` never means "email delivered". Use #87 to inspect the outbox (`status`, `attempts`, `last_error`).
- **Status is derived on read.** `open → overdue` and `available → expired` are reflected in list/detail responses even before the daily crons run; the crons only persist the flip.
- **Denial shapes are uniform.** `/document-requests/:id` failures collapse to `404 DOCUMENT_NOT_FOUND`; `/employees/:userId/...` out-of-scope failures return `403 FORBIDDEN`.
